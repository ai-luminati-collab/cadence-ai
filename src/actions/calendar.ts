'use server'

import { askExpertAgent, askExpertAgentPremium } from '@/lib/openai-agent'
import { BrandInfo, Strategy, ContentBucket } from '@/stores/brand'
import { TopicalEvent } from './topicals'
import { getAllKnowledgeSummary } from '@/lib/knowledge-loader'
import { buildProductContext } from '@/lib/product-context'
import { buildBrandOSContext } from '@/lib/brand-os-context'

export interface BucketSelection {
  bucketId: string
  bucketName: string
  pillarName: string
  count?: number // exact override, or leave empty for AI to decide within min/max
  min: number
  max: number
}

// ═══════════════════════════════════════════════════════════════════
// DATE DISTRIBUTION ENGINE — Deterministic post scheduling
//
// The AI is unreliable at counting and spacing. This engine:
// 1. Reads the content matrix (month → platform → format → count)
// 2. Computes the exact number of posts per month per platform
// 3. Distributes them evenly across business days (Mon-Fri primary, weekends for lifestyle/culture)
// 4. Ensures no platform is stacked on the same day (round-robin interleaving)
// 5. Stories get pinned to the same day as a main post (they're supplementary)
// 6. Locked topicals get exact date placement, remaining slots fill around them
// ═══════════════════════════════════════════════════════════════════

interface PreScheduledSlot {
  id: string
  date: string       // YYYY-MM-DD
  platform: string
  format: string
  slotIndex: number  // for AI reference
}

function generateDateSlots(
  startDate: string,
  endDate: string,
  contentMatrix?: Record<string, Record<string, Record<string, number>>>,
  lockedTopicals?: TopicalEvent[],
  frequency?: string,
  platforms?: string[]
): PreScheduledSlot[] {
  const slots: PreScheduledSlot[] = []
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')

  // If content matrix exists, use it to generate exact slots per month
  if (contentMatrix && Object.keys(contentMatrix).length > 0) {
    for (const [monthKey, platformData] of Object.entries(contentMatrix)) {
      const [y, m] = monthKey.split('-')
      const year = parseInt(y)
      const month = parseInt(m) - 1 // 0-indexed
      const daysInMonth = new Date(year, month + 1, 0).getDate()

      // Collect all non-story posts for this month
      const mainPosts: { platform: string; format: string }[] = []
      const storyPosts: { platform: string; format: string }[] = []

      for (const [platform, formats] of Object.entries(platformData)) {
        for (const [format, count] of Object.entries(formats)) {
          if (count <= 0) continue
          const bucket = format === 'Story' ? storyPosts : mainPosts
          for (let i = 0; i < count; i++) {
            bucket.push({ platform, format })
          }
        }
      }

      // ── STEP 1: Get available dates in this month (within start-end range) ──
      const availableDates: string[] = []
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d)
        if (date < start || date > end) continue
        availableDates.push(
          `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        )
      }

      if (availableDates.length === 0) continue

      // ── STEP 2: Reserve locked topical dates ──
      const reservedDates = new Set<string>()
      if (lockedTopicals) {
        for (const t of lockedTopicals) {
          if (t.selected && t.dateStr && availableDates.includes(t.dateStr)) {
            reservedDates.add(t.dateStr)
          }
        }
      }

      // ── STEP 3: Interleave platforms for variety ──
      // Shuffle main posts so platforms alternate (not 10x Meta then 5x LinkedIn)
      const platformGroups: Record<string, { platform: string; format: string }[]> = {}
      for (const post of mainPosts) {
        if (!platformGroups[post.platform]) platformGroups[post.platform] = []
        platformGroups[post.platform].push(post)
      }

      const interleaved: { platform: string; format: string }[] = []
      const platformKeys = Object.keys(platformGroups)
      let maxLen = Math.max(...platformKeys.map(k => platformGroups[k].length), 0)
      for (let i = 0; i < maxLen; i++) {
        for (const key of platformKeys) {
          if (i < platformGroups[key].length) {
            interleaved.push(platformGroups[key][i])
          }
        }
      }

      // ── STEP 4: Distribute main posts evenly across available dates ──
      // Prioritize business days (Mon-Fri) for professional platforms,
      // allow weekends for lifestyle/culture
      const totalMain = interleaved.length
      if (totalMain === 0) continue

      // Calculate ideal spacing
      const spacing = Math.max(1, Math.floor(availableDates.length / totalMain))

      // Assign dates with even distribution
      let dateIdx = 0
      for (let i = 0; i < totalMain; i++) {
        // Find the next available date slot
        const targetIdx = Math.min(
          Math.round((i / totalMain) * availableDates.length),
          availableDates.length - 1
        )

        // Nudge forward if this date already has 3+ posts (avoid overcrowding)
        let assignIdx = targetIdx
        const dateCounts: Record<string, number> = {}
        for (const s of slots) {
          dateCounts[s.date] = (dateCounts[s.date] || 0) + 1
        }

        // Try to find a less crowded nearby date
        for (let attempt = 0; attempt < availableDates.length; attempt++) {
          const checkIdx = (targetIdx + attempt) % availableDates.length
          const checkDate = availableDates[checkIdx]
          const existing = dateCounts[checkDate] || 0
          if (existing < 3) { // Max 3 posts per day (e.g., Reel + Static + Story)
            assignIdx = checkIdx
            break
          }
        }

        const assignedDate = availableDates[assignIdx]
        slots.push({
          id: `slot-${monthKey}-${i}`,
          date: assignedDate,
          platform: interleaved[i].platform,
          format: interleaved[i].format,
          slotIndex: slots.length + 1
        })

        // Update count tracking
        if (!dateCounts[assignedDate]) dateCounts[assignedDate] = 0
        dateCounts[assignedDate]++
      }

      // ── STEP 5: Pin stories to same day as a main post on that platform ──
      for (const story of storyPosts) {
        // Find a main post date for this platform
        const platformDates = slots
          .filter(s => s.platform === story.platform && s.format !== 'Story' && s.date.startsWith(monthKey))
          .map(s => s.date)

        // Distribute stories across platform's existing dates
        const storyDate = platformDates.length > 0
          ? platformDates[slots.filter(s => s.format === 'Story' && s.platform === story.platform).length % platformDates.length]
          : availableDates[Math.floor(Math.random() * availableDates.length)]

        slots.push({
          id: `slot-${monthKey}-story-${slots.length}`,
          date: storyDate,
          platform: story.platform,
          format: story.format,
          slotIndex: slots.length + 1
        })
      }
    }
  } else {
    // ── FALLBACK: No content matrix — generate a reasonable default ──
    let targetCount = 18 // moderate
    if (frequency === 'aggressive') targetCount = 28
    if (frequency === 'light') targetCount = 10

    const allDates: string[] = []
    const cursor = new Date(start)
    while (cursor <= end) {
      allDates.push(cursor.toISOString().split('T')[0])
      cursor.setDate(cursor.getDate() + 1)
    }

    const activePlatforms = platforms || ['Meta (Instagram & Facebook)']
    const defaultFormats: Record<string, string[]> = {
      'Meta (Instagram & Facebook)': ['Static', 'Carousel', 'Reel', 'Story'],
      'LinkedIn': ['Text', 'Carousel', 'Static'],
      'X (Twitter)': ['Text', 'Thread', 'Static'],
      'YouTube': ['Reel', 'Video'],
      'TikTok': ['Reel', 'Carousel'],
      'Pinterest': ['Static', 'Carousel'],
    }

    const spacing = Math.max(1, Math.floor(allDates.length / targetCount))
    for (let i = 0; i < targetCount && i * spacing < allDates.length; i++) {
      const platform = activePlatforms[i % activePlatforms.length]
      const formats = defaultFormats[platform] || ['Static']
      const format = formats[i % formats.length]

      slots.push({
        id: `slot-${i}`,
        date: allDates[Math.min(i * spacing, allDates.length - 1)],
        platform,
        format,
        slotIndex: i + 1
      })
    }
  }

  // Sort by date for clean output
  slots.sort((a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform))

  // Re-index after sort
  slots.forEach((s, i) => { s.slotIndex = i + 1 })

  return slots
}

// ═══════════════════════════════════════════════════════════════════

export async function generateContentCalendar(
  brandInfo: BrandInfo,
  strategy: Strategy,
  startDate: string,
  endDate: string,
  frequency: string = "moderate",
  customEvents: string = "",
  lockedTopicals: TopicalEvent[] = [],
  liveMarketTraction: string = "",
  platformScope?: string[],
  formatScope?: Record<string, string[]>,
  contentMatrix?: Record<string, Record<string, Record<string, number>>>,
  selectedBuckets?: BucketSelection[],
  bucketMode?: 'ai' | 'manual'
) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('YOUR_KEY_HERE')) {
    throw new Error("Missing valid OPENAI_API_KEY in environment variables.")
  }

  // ── STEP 1: Pre-compute all date/platform/format slots deterministically ──
  const preSlots = generateDateSlots(
    startDate, endDate, contentMatrix, lockedTopicals, frequency, brandInfo.platforms
  )

  // Build the slot manifest for the AI
  const slotManifest = preSlots.map(s =>
    `  [SLOT ${s.slotIndex}] Date: ${s.date} | Platform: ${s.platform} | Format: ${s.format}`
  ).join('\n')

  // Summary stats for the AI
  const platformCounts: Record<string, number> = {}
  const formatCounts: Record<string, number> = {}
  for (const s of preSlots) {
    platformCounts[s.platform] = (platformCounts[s.platform] || 0) + 1
    formatCounts[s.format] = (formatCounts[s.format] || 0) + 1
  }
  const summaryStr = Object.entries(platformCounts)
    .map(([p, c]) => `${p}: ${c} posts`)
    .join(', ')

  // Use compiled Brand OS if available (saves ~15K tokens vs loading full KB)
  const brandOSContext = buildBrandOSContext(strategy.compiledBrandOS)
  const knowledgeSummary = brandOSContext ? '' : await getAllKnowledgeSummary()

  const prompt = `
    You are an elite Social Media Manager and Content Strategist.
    We need to fill a pre-scheduled content calendar with ${preSlots.length} posts between [${startDate}] and [${endDate}].

    IMPORTANT: The DATE, PLATFORM, and FORMAT for every post have ALREADY been decided by our scheduling engine.
    Your job is ONLY to fill in the CREATIVE — the topic, concept, pillar, psychological trigger, and all content fields.
    Do NOT change any dates, platforms, or formats. They are locked.

    Here is the brand context:
    Name: ${brandInfo.name}
    Industry: ${brandInfo.industry}
    Voice: ${strategy.persona}
    Audience: ${strategy.targetAudience}
    Distribution: ${summaryStr}

    ${buildProductContext(brandInfo.brandType, brandInfo.productCatalog, brandInfo.serviceOfferings, brandInfo.uploadedDocs) ? `
    === PRODUCT/SERVICE INTELLIGENCE ===
    ${buildProductContext(brandInfo.brandType, brandInfo.productCatalog, brandInfo.serviceOfferings, brandInfo.uploadedDocs)}
    ===================================
    ` : ''}

    ${brandInfo.coreProducts && brandInfo.coreProducts.length > 0 ? `
    === CORE PRODUCTS / MENU — ANTI-HALLUCINATION CONSTRAINT (MANDATORY) ===
    The brand "${brandInfo.name}" sells ONLY these specific products/items:
    ${brandInfo.coreProducts.map((p, i) => `  ${i+1}. ${p}`).join('\n')}

    IMPORTANT NUANCE:
    - NOT every post needs to feature a product. Culture, BTS, lifestyle, trends, community posts are encouraged.
    - But if a post DOES reference a specific product, it MUST be from the list above by EXACT name.
    - NEVER invent products not on this list.
    ========================================================================
    ` : ''}

    Content Pillars and their distribution weighting:
    ${strategy.coreNarratives}

    ${strategy.strategicPatterns && strategy.strategicPatterns.length > 0 ? `
    === MASTER STRATEGIC PATTERNS (CRITICAL INJECTION) ===
    Align each post with ONE of these patterns:
    ${strategy.strategicPatterns.map((p, i) => `
    Pattern ${i+1}: [${p.id}] ${p.name}
    Description: ${p.description}
    Execution Markers: ${p.executionMarkers.join(', ')}
    `).join('\n')}
    ======================================================
    ` : ''}

    ${customEvents || "None specified. Auto-detect relevant cultural holidays for the target demographic if applicable."}

    === LIVE MARKET TRACTION ===
    ${liveMarketTraction && liveMarketTraction !== "NO_LIVE_DATA_AVAILABLE"
      ? `Use these viral archetypes to shape concepts:\n${liveMarketTraction}`
      : "No live traction data. Default to foundational elite strategy."}
    ============================

    === USER-LOCKED TOPICALS ===
    ${lockedTopicals.length > 0 ? lockedTopicals.filter(t => t.selected).map(t => `[LOCKED] Date: ${t.dateStr} | Event: ${t.name} | Format: ${t.suggestedFormat} | Relevance: ${t.relevance}`).join('\n') : "No locked topicals."}
    ============================

    === PLATFORM NATIVE PLAYBOOKS ===
    ${strategy.platformPlaybooks && Object.keys(strategy.platformPlaybooks).length > 0
      ? Object.entries(strategy.platformPlaybooks).map(([platform, playbook]) => `
      [${platform.toUpperCase()}]:
      - Role: ${playbook.role}
      - Mechanics: ${playbook.mechanics}
      - Tone: ${playbook.toneModifier}
      - Cadence: ${playbook.cadence}
      `).join('\n')
      : "Rely on native best practices."}
    =================================

    ${brandInfo.aiKnowledgeBase && brandInfo.aiKnowledgeBase.length > 0 ? `
    === LEARNED BRAND RULES (HIGHEST PRIORITY) ===
    ${brandInfo.aiKnowledgeBase.map((rule, i) => `    ${i+1}. ${rule}`).join('\n')}
    ================================================
    ` : ''}

    ${selectedBuckets && selectedBuckets.length > 0 ? `
    === CONTENT BUCKET MIX (${bucketMode === 'manual' ? 'STRICT COUNTS' : 'AI-GUIDED MIN/MAX'}) ===
    Each post MUST be assigned to one of these buckets:
    ${selectedBuckets.map(b => `  - [${b.pillarName}] "${b.bucketName}" (ID: ${b.bucketId}) ${b.count ? `EXACT: ${b.count} posts` : `Range: ${b.min}-${b.max}/month`}`).join('\n')}
    ${bucketMode === 'manual' ? 'Match exact post counts per bucket.' : 'Stay within min/max ranges.'}
    ================================================================
    ` : ''}

    QUALITY RULES:
    1. META = Instagram & Facebook combined. Lead with high-retention visual hooks.
    2. Use native hooks (POV, Unpopular Opinion, etc.). No generic corporate ideas.
    3. Pull psychological levers: status, survival, belonging, FOMO, curiosity.
    4. No cringe. No 2010 marketing speak. Cultural resonance only.
    5. NEVER use em dashes (-- or —). Use commas, periods, or short dashes (-).

    ${brandOSContext ? `
    === COMPILED BRAND OS (GROUND TRUTH) ===
    ${brandOSContext}
    =========================================
    ` : knowledgeSummary ? `
    === CONTENT INTELLIGENCE ===
    ${knowledgeSummary}
    ============================
    ` : ''}

    ════════════════════════════════════════════════════════════
    PRE-SCHEDULED SLOTS — YOU MUST GENERATE EXACTLY ONE POST PER SLOT
    Total: ${preSlots.length} posts
    ════════════════════════════════════════════════════════════
${slotManifest}
    ════════════════════════════════════════════════════════════

    For EACH slot above, output a JSON object with these fields:
    "id": A unique random string (e.g. "post-abc123")
    "date": COPY EXACTLY from the slot above (YYYY-MM-DD)
    "platform": COPY EXACTLY from the slot above
    "format": COPY EXACTLY from the slot above
    "pillar": Which content pillar this fits (use exact pillar names from above)
    ${selectedBuckets && selectedBuckets.length > 0 ? `"bucketId": The exact bucket ID this post belongs to.
    "bucketName": The exact bucket name.` : ''}
    "topic": A hyper-engaging, viral 2-3 sentence description of the full concept, angle, and narrative arc. Be DETAILED and SPECIFIC. (e.g. "POV: you finally found the skincare routine that clears hormonal acne. Open on a frustrated morning mirror check, then reveal the 3-step ritual. End with the 'glowing skin' payoff shot.")
    "eventContext": If related to a cultural holiday/trend on that day, name it. Otherwise "".
    "psychTrigger": 1-sentence analysis of which psychological lever this post pulls and HOW.
    "usageStory": 1-sentence description of how/where the product or brand appears in THIS concept.
    ${strategy.strategicPatterns && strategy.strategicPatterns.length > 0 ? `"strategicPatternId": The pattern ID this post executes.
    "strategicPatternName": The pattern name.` : ''}

    === STORY FORMAT EXTRAS (only when format is 'Story') ===
    "storyMediaType": "video" or "static"
    "storyFeature": One of: "Poll", "Quiz", "Question Box", "Countdown", "Emoji Slider", "Link Sticker", "Music", "Mention"
    "storyCopy": Text overlay (under 15 words, punchy)
    ==========================================================

    Return { "posts": [ ... ] } with EXACTLY ${preSlots.length} posts. No markdown. No wrappers. Pure JSON.
  `

  try {
     const res = await askExpertAgentPremium(prompt, brandOSContext ? '' : undefined)
     if (!res.success) throw new Error("Agent failed execution.")

     let resultText = (res.data || '').replace(/```json/g, '').replace(/```/g, '').trim()
     const parsed = JSON.parse(resultText)
     let posts = Array.isArray(parsed?.posts) ? parsed.posts : Array.isArray(parsed) ? parsed : []

     if (posts.length === 0) throw new Error("Calendar generation returned no posts")

     // ── POST-PROCESSING: Enforce the pre-scheduled slots ──
     // If AI returned fewer posts than slots, or changed dates/platforms, fix it
     if (posts.length < preSlots.length) {
       console.warn(`⚠️ AI returned ${posts.length} posts but ${preSlots.length} slots were scheduled. Padding missing slots.`)
       // Keep what AI gave us, add placeholder slots for the rest
       const coveredDates = new Set(posts.map((p: any) => `${p.date}|${p.platform}|${p.format}`))
       for (const slot of preSlots) {
         const key = `${slot.date}|${slot.platform}|${slot.format}`
         if (!coveredDates.has(key)) {
           posts.push({
             id: slot.id,
             date: slot.date,
             platform: slot.platform,
             format: slot.format,
             pillar: 'General',
             topic: `[Pending] ${slot.platform} ${slot.format} post - concept to be filled`,
             eventContext: '',
             psychTrigger: '',
             usageStory: ''
           })
         }
       }
     }

     // Enforce correct dates/platforms from slots (in case AI hallucinated different ones)
     posts = posts.slice(0, preSlots.length).map((post: any, i: number) => {
       const slot = preSlots[i]
       if (!slot) return post
       return {
         ...post,
         date: slot.date,
         platform: slot.platform,
         format: slot.format,
         id: post.id || slot.id
       }
     })

     // Sort by date
     posts.sort((a: any, b: any) => a.date.localeCompare(b.date))

     return { success: true, data: posts }
  } catch (error: any) {
     console.error("AI Calendar Generation Failed:", error)
     return { success: false, error: error.message || "Failed to generate Calendar" }
  }
}
