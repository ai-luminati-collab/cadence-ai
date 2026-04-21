import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// Cache the knowledge base in memory directly on the server
let cachedKnowledgeBase: string | null = null

function getKnowledgeBaseContext() {
   if (cachedKnowledgeBase) return cachedKnowledgeBase

   try {
      const kbDirPath = path.join(process.cwd(), 'src/core/knowledge')
      if (!fs.existsSync(kbDirPath)) return ""

      const files = fs.readdirSync(kbDirPath).filter(f => f.endsWith('.md'))
      const fileContents = files.map(file => {
         const content = fs.readFileSync(path.join(kbDirPath, file), 'utf-8')
         return `--- File: ${file} ---\n${content}\n`
      })

      cachedKnowledgeBase = fileContents.join('\n')
      return cachedKnowledgeBase
   } catch (e) {
      console.error("Failed to read knowledge base files:", e)
      return ""
   }
}

// ═══════════════════════════════════════════════════════════════
// LIVE ALGORITHM STATE — Fetched from Supabase with TTL cache
// ═══════════════════════════════════════════════════════════════
let cachedAlgoState: string | null = null
let algoStateFetchedAt: number = 0
const ALGO_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

async function getLiveAlgorithmState(): Promise<string> {
   // Return from memory cache if fresh
   if (cachedAlgoState && (Date.now() - algoStateFetchedAt) < ALGO_CACHE_TTL_MS) {
      return cachedAlgoState
   }

   try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!supabaseUrl || !supabaseKey) return ''

      const supabase = createClient(supabaseUrl, supabaseKey)
      const { data, error } = await supabase
         .from('global_algorithm_state')
         .select('rules, last_updated')
         .eq('id', 1)
         .single()

      if (error || !data || !data.rules || Object.keys(data.rules).length === 0) {
         console.warn('⚠️ No live algorithm state found in Supabase. Skipping injection.')
         cachedAlgoState = ''
         algoStateFetchedAt = Date.now()
         return ''
      }

      const rules = data.rules as any
      const lastUpdated = data.last_updated
         ? new Date(data.last_updated).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
         : 'Unknown'

      // Format the rules into a clean, injectable prompt section
      let formatted = `### 🔴 LIVE ALGORITHM INTELLIGENCE (Last Updated: ${lastUpdated})\n`
      formatted += `Use these verified, data-backed rules to optimize content for current platform algorithms.\n\n`

      if (rules.platforms) {
         for (const [platform, platformRules] of Object.entries(rules.platforms)) {
            const ruleList = platformRules as any[]
            if (ruleList && ruleList.length > 0) {
               formatted += `**${platform.toUpperCase()}:**\n`
               for (const r of ruleList) {
                  formatted += `- [${r.confidence?.toUpperCase() || 'MEDIUM'}] ${r.rule}\n`
               }
               formatted += '\n'
            }
         }
      }

      if (rules.cross_platform && rules.cross_platform.length > 0) {
         formatted += `**CROSS-PLATFORM RULES:**\n`
         for (const r of rules.cross_platform) {
            formatted += `- [${r.confidence?.toUpperCase() || 'MEDIUM'}] ${r.rule}\n`
         }
         formatted += '\n'
      }

      if (rules.scout_summary) {
         formatted += `**SCOUT SUMMARY:** ${rules.scout_summary}\n`
      }

      cachedAlgoState = formatted
      algoStateFetchedAt = Date.now()
      console.log(`📡 Live Algorithm State loaded (${formatted.length} chars, updated ${lastUpdated})`)
      return formatted
   } catch (e) {
      console.error('Failed to fetch live algorithm state:', e)
      cachedAlgoState = ''
      algoStateFetchedAt = Date.now()
      return ''
   }
}

/**
 * Two-Tier AI Pipeline: Generator → Verifier
 *
 * Stage 1 (WORKER): GPT-5.4-mini generates the draft fast (~3-8s)
 * Stage 2 (BOSS):   Claude Opus 4.6 reviews, fixes, and upgrades (~5-15s)
 *
 * Why Claude as Boss: Produces 70-80% less "AI smog" natively, follows
 * constraint sets (banned words, format rules, anti-patterns) more reliably,
 * and excels at structured JSON output at large sizes.
 */
export async function askExpertAgent(prompt: string, skipReview = false, knowledgeOverride?: string | null) {
  if (!process.env.OPENAI_API_KEY) {
     throw new Error("Missing OPENAI_API_KEY.")
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  // If knowledgeOverride is explicitly provided (even ''), use it instead of loading the full KB.
  // undefined/null = legacy behaviour (load everything).
  const knowledgeContext = knowledgeOverride !== undefined && knowledgeOverride !== null
    ? knowledgeOverride
    : getKnowledgeBaseContext()

  const liveAlgoState = await getLiveAlgorithmState()

  const systemInstructions = knowledgeContext
    ? `You are Cadence, an elite top-tier marketing strategist.
You will be prompted to generate highly technical, data-driven content strategies and content calendars for brands.
CRITICAL INSTRUCTION: You MUST use the following Digital Marketing Playbooks as your only ground truth to formulate your strategies. Do not guess algorithms—look them up in these playbooks strictly.

${liveAlgoState}

### DIGITAL MARKETING PLAYBOOKS KNOWLEDGE BASE:
${knowledgeContext}
`
    : `You are Cadence, an elite top-tier marketing strategist.
${liveAlgoState}
`

  try {
     // ═══════════════════════════════════════════════
     // STAGE 1: WORKER (gpt-4o-mini) — Fast Draft
     // ═══════════════════════════════════════════════
     console.log("⚡ Stage 1: Worker drafting with gpt-4o-mini...")
     const startWorker = Date.now()

     const workerResponse = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        temperature: 0.7,
        messages: [
           { role: "system", content: systemInstructions },
           { role: "user", content: prompt }
        ]
     })

     const draft = workerResponse.choices[0]?.message?.content
     const workerTime = ((Date.now() - startWorker) / 1000).toFixed(1)
     console.log(`✅ Stage 1 complete in ${workerTime}s`)

     if (!draft) {
        throw new Error("Worker returned empty draft")
     }

     // For lightweight tasks (trends, simple lookups), skip the boss review
     if (skipReview) {
        console.log("⏩ Boss review skipped (lightweight task)")
        return { success: true, data: draft }
     }

     // ═══════════════════════════════════════════════════════════
     // STAGE 2: BOSS (Claude Opus 4.6) — Real Review & Rewrite
     //
     // Claude is NOT a rubber stamp. It must:
     //   1. DIAGNOSE specific problems in the worker draft
     //   2. REWRITE sections that are weak, generic, or smoggy
     //   3. REJECT entire outputs that are unsalvageable (triggers re-draft)
     //   4. APPROVE only when the output is genuinely world-class
     // ═══════════════════════════════════════════════════════════
     console.log("🧠 Stage 2: Boss reviewing with Claude Opus 4.6...")
     const startBoss = Date.now()

     if (!process.env.ANTHROPIC_API_KEY) {
        console.warn("⚠️ ANTHROPIC_API_KEY not set — falling back to worker draft")
        return { success: true, data: draft }
     }

     const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

     const bossResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: `You are the Ruthless Creative Director at a top-tier culture-led agency.
A junior strategist (GPT) just generated a draft. Your job is to tear it apart and rebuild it better.

You are NOT a proofreader. You are NOT here to polish. You are here to TRANSFORM mediocre into magnetic.

YOUR REVIEW PROTOCOL:
1. READ the entire draft critically. Judge it like a $50K client is paying for this.
2. DIAGNOSE: What's weak? What's generic? What sounds like AI wrote it? What would a real human scroll past?
3. REWRITE: Don't just flag problems — FIX THEM. Replace every weak line with a stronger one. Replace every generic phrase with something specific, gritty, and human.
4. KILL "THE SMOG": Words like "Elevate," "Unlock," "Empower," "Revolutionize," "Seamless," "Experience," "Leverage," "Synergy," "Curate," "Journey," "Delve" are BANNED. If you see them, rip them out and write something a real person would say.
5. ENFORCE BREVITY: If the draft used 3 sentences where 1 punchy line would hit harder — cut it. No filler. No throat-clearing. No "In today's digital landscape..." garbage.
6. CULTURAL NATIVE TEST: Read every line and ask — "Would a 28-year-old brand manager screenshot this and send it to their team?" If the answer is no, rewrite it until the answer is yes.
7. TONE LOCK: Match the brand persona exactly. If it says "Short & Punchy" — be aggressive. Every extra word is a failure.
8. JSON INTEGRITY: The output MUST be valid JSON with the exact same keys/structure as the draft. Do NOT add new keys, remove keys, or change the schema. Only improve the VALUES.

YOUR DECISION:
- If the draft is 70%+ good: Fix the weak parts, keep the strong parts. Return the improved version.
- If the draft is fundamentally generic (reads like any brand could have written it): Rewrite aggressively. Keep the structure but replace most of the copy.
- If the JSON is malformed or missing critical fields: Fix the structure AND improve the content.

CRITICAL: Return ONLY the final improved output. Same JSON format. No commentary, no "Here's my review", no preamble. Just the upgraded output, ready to ship.`,
        messages: [
           { role: "user", content: `Here is the junior strategist's draft. Review it ruthlessly and return the improved version:\n\n${draft}` }
        ]
     })

     const finalOutput = bossResponse.content[0]?.type === 'text' ? bossResponse.content[0].text : null
     const bossTime = ((Date.now() - startBoss) / 1000).toFixed(1)
     console.log(`✅ Stage 2 (Claude Boss) complete in ${bossTime}s`)
     console.log(`📊 Total pipeline: ${((Date.now() - startWorker) / 1000).toFixed(1)}s (Worker/GPT: ${workerTime}s + Boss/Claude: ${bossTime}s)`)

     if (finalOutput) {
        return { success: true, data: finalOutput }
     } else {
        // If boss fails, fall back to worker draft
        console.warn("⚠️ Boss returned empty — falling back to worker draft")
        return { success: true, data: draft }
     }

  } catch (e: any) {
     console.error("Agentic Pipeline Failed:", e)
     throw new Error(e.message || "Unknown OpenAI Agent error.")
  }
}

/**
 * Single-Tier Premium Pipeline (Claude Opus 4.6)
 * Uses Claude Opus for highest reasoning on large structured outputs (calendar, strategy).
 * No worker draft — Claude generates from scratch with full context.
 * Used when the output is too large/important for a GPT-mini first pass.
 */
export async function askExpertAgentPremium(prompt: string, knowledgeOverride?: string | null) {
  if (!process.env.ANTHROPIC_API_KEY) {
     throw new Error("Missing ANTHROPIC_API_KEY.")
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const knowledgeContext = knowledgeOverride !== undefined && knowledgeOverride !== null
    ? knowledgeOverride
    : getKnowledgeBaseContext()

  const liveAlgoState = await getLiveAlgorithmState()

  const systemInstructions = knowledgeContext
    ? `You are Cadence, an elite top-tier marketing strategist. You are also a ruthless creative director — you do NOT produce generic, safe, or AI-sounding output.
You will be prompted to generate highly technical, data-driven content strategies and content calendars for brands.
CRITICAL INSTRUCTION: You MUST use the following Digital Marketing Playbooks as your only ground truth to formulate your strategies. Do not guess algorithms—look them up in these playbooks strictly.

QUALITY STANDARDS YOU ENFORCE ON YOURSELF:
- ZERO AI SMOG: Never use "Elevate," "Unlock," "Empower," "Seamless," "Journey," "Delve," "Leverage," "Curate." Write like a human who's actually good at their job.
- SPECIFICITY OVER GENERICS: Every strategy, every concept, every hook must be specific to THIS brand. If it could apply to any brand in the industry, it's too generic — rewrite.
- BREVITY IS RESPECT: Say more with less. No throat-clearing. No filler paragraphs.
- CULTURAL NATIVE: Content must sound like it was written by someone who lives on the platform, not someone who read a blog about it.

${liveAlgoState}

### DIGITAL MARKETING PLAYBOOKS KNOWLEDGE BASE:
${knowledgeContext}
`
    : `You are Cadence, an elite top-tier marketing strategist. You are also a ruthless creative director — you do NOT produce generic, safe, or AI-sounding output.

QUALITY STANDARDS YOU ENFORCE ON YOURSELF:
- ZERO AI SMOG: Never use "Elevate," "Unlock," "Empower," "Seamless," "Journey," "Delve," "Leverage," "Curate." Write like a human who's actually good at their job.
- SPECIFICITY OVER GENERICS: Every output must be specific to THIS brand. Generic = failure.
- BREVITY IS RESPECT: Say more with less.
- CULTURAL NATIVE: Sound like someone who lives on the platform.

${liveAlgoState}
`

  try {
     console.log("💎 Running Premium Single-Pass with Claude Opus 4.6...")
     const start = Date.now()

     const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: systemInstructions,
        messages: [
           { role: "user", content: prompt }
        ]
     })

     const finalOutput = response.content[0]?.type === 'text' ? response.content[0].text : null
     const time = ((Date.now() - start) / 1000).toFixed(1)
     console.log(`✅ Premium Single-Pass (Claude Opus) complete in ${time}s`)

     if (finalOutput) {
        return { success: true, data: finalOutput }
     } else {
        throw new Error("Premium returned empty output")
     }
  } catch (e: any) {
     console.error("Premium Pipeline Failed:", e)
     throw new Error(e.message || "Unknown Claude Premium error.")
  }
}
