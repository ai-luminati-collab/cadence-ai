import OpenAI from 'openai'
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
 * Stage 1 (WORKER): gpt-5.4-mini generates the draft fast (~3-8s)
 * Stage 2 (BOSS):   gpt-5.4 with high reasoning reviews, fixes, and upgrades (~5-15s)
 * 
 * Total: ~8-20s vs pure gpt-5.4 xhigh at ~40-90s
 * Quality: Higher than either model alone (generation + verification)
 */
export async function askExpertAgent(prompt: string, skipReview = false) {
  if (!process.env.OPENAI_API_KEY) {
     throw new Error("Missing OPENAI_API_KEY.")
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const knowledgeContext = getKnowledgeBaseContext()
  const liveAlgoState = await getLiveAlgorithmState()

  const systemInstructions = `You are Cadence, an elite top-tier marketing strategist. 
You will be prompted to generate highly technical, data-driven content strategies and content calendars for brands.
CRITICAL INSTRUCTION: You MUST use the following Digital Marketing Playbooks as your only ground truth to formulate your strategies. Do not guess algorithms—look them up in these playbooks strictly.

${liveAlgoState}

### DIGITAL MARKETING PLAYBOOKS KNOWLEDGE BASE:
${knowledgeContext}
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

     // ═══════════════════════════════════════════════
     // STAGE 2: BOSS (gpt-4o) — Review & Upgrade
     // ═══════════════════════════════════════════════
     console.log("🧠 Stage 2: Boss reviewing with gpt-4o (high reasoning)...")
     const startBoss = Date.now()

      const bossResponse = await openai.chat.completions.create({
         model: "gpt-5.4",
         messages: [
            { role: "developer", content: `You are the Ruthless Creative Director at a top-tier culture-led agency. 
Your job is to kill "Artificial Smog"—the generic, wordy, flowery marketing fluff that AI often generates.

YOUR QUALITY PROTOCOL:
1. KILL "THE SMOG": Words like "Elevate," "Unlock," "Empower," "Revolutionize," "Seamless," "Experience" are banned. If you see them, replace them with gritty, human, punchy alternatives.
2. ENFORCE BREVITY: If the junior strategist wrote 3 sentences where one word would suffice, cut it. 
3. CULTURAL NATIVE: Does this sound like a corporate bot or a specific human? If it's generic, add local nuance or relatable truths.
4. TONE LOCK: If the persona is "Short & Punchy", be aggressive. Your goal is the minimum amount of words for maximum impact.
5. PRESERVE FORMAT: Keep the JSON keys and structure exactly as provided.

CRITICAL: Return ONLY the final output. No commentary.` },
           { role: "user", content: `Here is the worker's draft to review and upgrade:\n\n${draft}` }
        ]
     })

     const finalOutput = bossResponse.choices[0]?.message?.content
     const bossTime = ((Date.now() - startBoss) / 1000).toFixed(1)
     console.log(`✅ Stage 2 complete in ${bossTime}s`)
     console.log(`📊 Total pipeline: ${((Date.now() - startWorker) / 1000).toFixed(1)}s (Worker: ${workerTime}s + Boss: ${bossTime}s)`)

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
 * Single-Tier Premium Pipeline
 * Uses ONLY gpt-4o for highest reasoning, bypassing the 2-stage review to save time on large outputs.
 */
export async function askExpertAgentPremium(prompt: string) {
  if (!process.env.OPENAI_API_KEY) {
     throw new Error("Missing OPENAI_API_KEY.")
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const knowledgeContext = getKnowledgeBaseContext()
  const liveAlgoState = await getLiveAlgorithmState()

  const systemInstructions = `You are Cadence, an elite top-tier marketing strategist. 
You will be prompted to generate highly technical, data-driven content strategies and content calendars for brands.
CRITICAL INSTRUCTION: You MUST use the following Digital Marketing Playbooks as your only ground truth to formulate your strategies. Do not guess algorithms—look them up in these playbooks strictly.

${liveAlgoState}

### DIGITAL MARKETING PLAYBOOKS KNOWLEDGE BASE:
${knowledgeContext}
`

  try {
     console.log("💎 Running Premium Single-Pass with gpt-4o...")
     const start = Date.now()

     const response = await openai.chat.completions.create({
        model: "gpt-5.4",
        temperature: 0.7,
        messages: [
           { role: "system", content: systemInstructions },
           { role: "user", content: prompt }
        ]
     })

     const finalOutput = response.choices[0]?.message?.content
     const time = ((Date.now() - start) / 1000).toFixed(1)
     console.log(`✅ Premium Single-Pass complete in ${time}s`)

     if (finalOutput) {
        return { success: true, data: finalOutput }
     } else {
        throw new Error("Premium returned empty output")
     }
  } catch (e: any) {
     console.error("Premium Pipeline Failed:", e)
     throw new Error(e.message || "Unknown OpenAI Premium error.")
  }
}
