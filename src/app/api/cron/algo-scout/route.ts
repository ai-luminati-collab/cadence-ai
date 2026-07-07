import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

/**
 * ═══════════════════════════════════════════════════════════════════
 * ALGORITHM SCOUT — Automated Weekly Cron Job
 * ═══════════════════════════════════════════════════════════════════
 *
 * This endpoint is called weekly by Vercel Cron (Sunday 3 AM UTC).
 * It can also be triggered manually via GET with the correct auth header.
 *
 * Pipeline:
 * 1. Searches the live web for algorithm changes across major platforms
 * 2. Distills raw findings into 10 strict rules via GPT-5.4-mini
 * 3. Upserts the result into Supabase `global_algorithm_state` table
 *
 * Security: Requires CRON_SECRET header or query param for authorization.
 * Resilience: If any step fails, existing cached data is NEVER overwritten.
 * ═══════════════════════════════════════════════════════════════════
 */

// The platforms we track algorithm changes for
const PLATFORMS = ['Instagram', 'TikTok', 'LinkedIn', 'YouTube Shorts'] as const

// Highly specific search queries that target empirical data, NOT guru blogs
function buildSearchQueries(): string[] {
  const now = new Date()
  const month = now.toLocaleString('en-US', { month: 'long' })
  const year = now.getFullYear()

  return PLATFORMS.flatMap(platform => [
    `${platform} algorithm update ${month} ${year} official changelog`,
    `${platform} organic reach changes ${month} ${year} data analysis`,
  ])
}

/**
 * Search the web using OpenAI's Responses API with the web_search tool.
 * This avoids needing a separate Tavily/Exa API key entirely.
 */
async function searchWebViaOpenAI(openai: OpenAI, queries: string[]): Promise<string> {
  const combinedQuery = queries.join('\n- ')

  try {
    const response = await openai.responses.create({
      model: 'gpt-5.4-mini',
      tools: [{ type: 'web_search' as any }],
      input: `You are a social media algorithm research analyst. Search the web for the following topics and return a comprehensive summary of what you find. Focus ONLY on verified data, official announcements, and empirical tests. Ignore opinion pieces and guru clickbait.

Topics to research:
- ${combinedQuery}

Return your findings as a detailed raw report. Include specific numbers, dates, and source URLs where possible.`,
    })

    // Extract the text output from the response
    const textOutput = response.output?.find((item: any) => item.type === 'message')
    if (textOutput && 'content' in textOutput) {
      const textContent = textOutput.content?.find((c: any) => c.type === 'output_text')
      if (textContent && 'text' in textContent) {
        return textContent.text
      }
    }

    // Fallback: try to get any text from the response
    return JSON.stringify(response.output || 'No results found')
  } catch (error: any) {
    console.error('OpenAI web search failed:', error.message)
    // If web search tool is not available, fall back to Tavily
    return await searchWebViaTavily(queries)
  }
}

/**
 * Fallback: Search using Tavily API if available
 */
async function searchWebViaTavily(queries: string[]): Promise<string> {
  if (!process.env.TAVILY_API_KEY) {
    console.warn('⚠️ No TAVILY_API_KEY found, using knowledge-only mode')
    return ''
  }

  const results: string[] = []

  for (const query of queries.slice(0, 4)) { // Limit to 4 queries to stay within rate limits
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query,
          search_depth: 'advanced',
          max_results: 3,
          include_raw_content: false,
          include_answer: true,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.answer) results.push(data.answer)
        if (data.results) {
          for (const r of data.results) {
            results.push(`[${r.title}](${r.url}): ${r.content}`)
          }
        }
      }
    } catch (e) {
      console.warn(`Tavily query failed for: ${query}`)
    }
  }

  return results.join('\n\n')
}

/**
 * Distill raw search results into structured algorithm rules using GPT-5.4-mini.
 * Uses strict JSON schema to guarantee parseable output.
 */
async function distillRules(openai: OpenAI, rawData: string): Promise<{ rules: any; sources: string[] }> {
  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    temperature: 0.2, // Low temperature for factual precision
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are an elite social media algorithm analyst. Your job is to distill raw web research into strict, actionable algorithm rules.

CRITICAL RULES:
1. ONLY include rules that are backed by data or official announcements. NEVER include speculation or guru opinions.
2. If you cannot verify a claim from the raw data, DO NOT include it.
3. Each rule must be specific and actionable (e.g., "Post between 7-9 AM local time" NOT "Post at the right time").
4. If the raw data is empty or insufficient, return fewer rules rather than making things up.

Return a JSON object with this exact structure:
{
  "platforms": {
    "instagram": [
      { "rule": "string describing the rule", "confidence": "high|medium", "source": "url or description" }
    ],
    "tiktok": [...],
    "linkedin": [...],
    "youtube_shorts": [...]
  },
  "cross_platform": [
    { "rule": "string describing a universal rule", "confidence": "high|medium", "source": "url or description" }
  ],
  "scout_summary": "A 2-sentence executive summary of the most important changes this week"
}

If you have NO data for a platform, return an empty array for that platform. Do NOT fabricate rules.`,
      },
      {
        role: 'user',
        content: `Here is the raw algorithm research data collected from live web searches. Distill this into strict, verified rules:\n\n--- RAW DATA ---\n${rawData || 'No live data was retrieved. Return empty arrays for all platforms and note this in the scout_summary.'}\n--- END RAW DATA ---`,
      },
    ],
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Distillation returned empty output')

  const parsed = JSON.parse(content)

  // Extract source URLs from the rules
  const sources: string[] = []
  for (const platform of Object.values(parsed.platforms || {})) {
    for (const rule of platform as any[]) {
      if (rule.source && rule.source.startsWith('http')) {
        sources.push(rule.source)
      }
    }
  }

  return { rules: parsed, sources }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // ─── Security Gate ──────────────────────────────────────
  // Vercel Cron sends CRON_SECRET in the Authorization header.
  // Manual triggers can pass it as a query param.
  const authHeader = request.headers.get('authorization')
  const querySecret = request.nextUrl.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET?.trim()

  if (!cronSecret) {
    // Fail closed: without a configured secret this endpoint would be
    // publicly triggerable (it burns OpenAI credits and writes to Supabase).
    console.error('🚫 Algorithm Scout: CRON_SECRET is not set — refusing to run')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    querySecret?.trim() === cronSecret
  if (!isAuthorized) {
    console.warn('🚫 Algorithm Scout: Unauthorized access attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ─── Validate Environment ──────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 })
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // Use service role key if available for writes, otherwise fall back to anon key
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseKey)

  try {
    // ─── Step 1: Search ──────────────────────────────────
    console.log('🔍 Algorithm Scout: Starting web search...')
    const queries = buildSearchQueries()
    const rawData = await searchWebViaOpenAI(openai, queries)
    console.log(`✅ Search complete. Raw data length: ${rawData.length} chars`)

    if (!rawData || rawData.length < 50) {
      console.warn('⚠️ Algorithm Scout: Insufficient search data. Preserving existing cache.')
      return NextResponse.json({
        success: false,
        message: 'Insufficient search data. Existing cache preserved.',
        duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      })
    }

    // ─── Step 2: Distill ─────────────────────────────────
    console.log('🧠 Algorithm Scout: Distilling rules via GPT-5.4-mini...')
    const { rules, sources } = await distillRules(openai, rawData)
    console.log(`✅ Distillation complete.`)

    // ─── Step 3: Validate before writing ─────────────────
    // Never write garbage to the cache. Validate the shape.
    if (!rules.platforms || typeof rules.platforms !== 'object') {
      throw new Error('Distilled output failed shape validation: missing platforms object')
    }

    // ─── Step 4: Upsert to Supabase ──────────────────────
    console.log('💾 Algorithm Scout: Upserting to Supabase...')
    const { error } = await supabase
      .from('global_algorithm_state')
      .upsert(
        {
          id: 1,
          rules,
          sources,
          last_updated: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )

    if (error) {
      throw new Error(`Supabase upsert failed: ${error.message}`)
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`🎯 Algorithm Scout: Complete in ${duration}s`)

    return NextResponse.json({
      success: true,
      duration: `${duration}s`,
      platforms_covered: Object.keys(rules.platforms),
      rule_counts: Object.fromEntries(
        Object.entries(rules.platforms).map(([k, v]) => [k, (v as any[]).length])
      ),
      scout_summary: rules.scout_summary || 'No summary generated',
    })
  } catch (error: any) {
    console.error('❌ Algorithm Scout failed:', error.message)
    // CRITICAL: We never touch the existing cache on failure.
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      },
      { status: 500 }
    )
  }
}
