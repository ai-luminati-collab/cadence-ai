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

  // Check if content matrix has any actual posts (not just empty month keys)
  const matrixHasPosts = contentMatrix && Object.keys(contentMatrix).length > 0 &&
    Object.values(contentMatrix).some(platformData =>
      Object.values(platformData).some(formats =>
        Object.values(formats).some(count => count > 0)
      )
    )

  // If content matrix exists AND has real post counts, use it
  if (matrixHasPosts && contentMatrix) {
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
  }

  // ── FALLBACK: No valid content matrix — generate a reasonable default ──
  if (slots.length === 0) {
    console.log('📅 No matrix posts found — using fallback distribution')
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

// Max posts per AI call — GPT-mini is fast enough for larger batches
const BATCH_SIZE = 20

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

  console.log(`📅 Date engine generated ${preSlots.length} slots`)

  // Use compiled Brand OS if available
  const brandOSContext = buildBrandOSContext(strategy.compiledBrandOS)
  const knowledgeSummary = brandOSContext ? '' : await getAllKnowledgeSummary()

  // ── Build shared context (sent with every batch) ──
  const sharedContext = buildSharedContext(
    brandInfo, strategy, customEvents, liveMarketTraction,
    lockedTopicals, selectedBuckets, bucketMode,
    brandOSContext, knowledgeSummary
  )

  // ── STEP 2: Batch slots into chunks and generate in parallel/sequence ──
  const batches: PreScheduledSlot[][] = []
  for (let i = 0; i < preSlots.length; i += BATCH_SIZE) {
    batches.push(preSlots.slice(i, i + BATCH_SIZE))
  }

  console.log(`🔄 Splitting into ${batches.length} batch(es) of up to ${BATCH_SIZE} posts`)

  let allPosts: any[] = []

  try {
    // Generate batches sequentially (parallel would be faster but risks rate limits)
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx]
      console.log(`⚡ Batch ${batchIdx + 1}/${batches.length}: generating ${batch.length} posts...`)

      const batchPosts = await generateBatch(
        batch, sharedContext, strategy, selectedBuckets, brandOSContext
      )
      allPosts = [...allPosts, ...batchPosts]
    }

    if (allPosts.length === 0) throw new Error("Calendar generation returned no posts")

    // ── POST-PROCESSING: Fill any gaps with placeholder posts ──
    if (allPosts.length < preSlots.length) {
      console.warn(`⚠️ AI returned ${allPosts.length} posts but ${preSlots.length} slots exist. Padding.`)
      const covered = new Set(allPosts.map((p: any) => `${p.date}|${p.platform}|${p.format}`))
      for (const slot of preSlots) {
        const key = `${slot.date}|${slot.platform}|${slot.format}`
        if (!covered.has(key)) {
          allPosts.push({
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

    // Sort chronologically
    allPosts.sort((a: any, b: any) => a.date.localeCompare(b.date))

    console.log(`✅ Calendar complete: ${allPosts.length} posts`)
    return { success: true, data: allPosts }
  } catch (error: any) {
    console.error("AI Calendar Generation Failed:", error)
    return { success: false, error: error.message || "Failed to generate Calendar" }
  }
}

// ═══════════════════════════════════════════════════════════════════
// SHARED CONTEXT BUILDER — Assembled once, reused for every batch
// ═══════════════════════════════════════════════════════════════════

function buildSharedContext(
  brandInfo: BrandInfo,
  strategy: Strategy,
  customEvents: string,
  liveMarketTraction: string,
  lockedTopicals: TopicalEvent[],
  selectedBuckets: BucketSelection[] | undefined,
  bucketMode: string | undefined,
  brandOSContext: string,
  knowledgeSummary: string
): string {
  const sections: string[] = []

  sections.push(`Brand: ${brandInfo.name} | Industry: ${brandInfo.industry}
Voice: ${strategy.persona}
Audience: ${strategy.targetAudience}`)

  if (brandInfo.coreProducts && brandInfo.coreProducts.length > 0) {
    sections.push(`CORE PRODUCTS (only reference these by exact name if mentioning a product):
${brandInfo.coreProducts.map((p, i) => `  ${i+1}. ${p}`).join('\n')}
Not every post needs a product. Culture/BTS/lifestyle posts are encouraged.`)
  }

  sections.push(`Content Pillars: ${strategy.coreNarratives}`)

  if (strategy.strategicPatterns && strategy.strategicPatterns.length > 0) {
    sections.push(`STRATEGIC PATTERNS (align each post to one):
${strategy.strategicPatterns.map((p, i) => `  ${p.id}: ${p.name} - ${p.description}`).join('\n')}`)
  }

  if (strategy.platformPlaybooks && Object.keys(strategy.platformPlaybooks).length > 0) {
    sections.push(`PLATFORM PLAYBOOKS:
${Object.entries(strategy.platformPlaybooks).map(([plat, pb]) =>
  `  ${plat}: Role=${pb.role} | Mechanics=${pb.mechanics} | Tone=${pb.toneModifier}`
).join('\n')}`)
  }

  if (liveMarketTraction && liveMarketTraction !== "NO_LIVE_DATA_AVAILABLE") {
    sections.push(`LIVE TRACTION:\n${liveMarketTraction}`)
  }

  if (lockedTopicals.length > 0) {
    const locked = lockedTopicals.filter(t => t.selected)
    if (locked.length > 0) {
      sections.push(`LOCKED TOPICALS:\n${locked.map(t => `  ${t.dateStr}: ${t.name} (${t.suggestedFormat})`).join('\n')}`)
    }
  }

  if (brandInfo.aiKnowledgeBase && brandInfo.aiKnowledgeBase.length > 0) {
    sections.push(`LEARNED RULES (HIGHEST PRIORITY):\n${brandInfo.aiKnowledgeBase.map((r, i) => `  ${i+1}. ${r}`).join('\n')}`)
  }

  if (selectedBuckets && selectedBuckets.length > 0) {
    sections.push(`CONTENT BUCKETS (${bucketMode === 'manual' ? 'strict counts' : 'AI-guided'}):
${selectedBuckets.map(b => `  [${b.pillarName}] "${b.bucketName}" (${b.bucketId}) ${b.count ? `exact: ${b.count}` : `${b.min}-${b.max}/mo`}`).join('\n')}`)
  }

  if (brandOSContext) {
    sections.push(`BRAND OS:\n${brandOSContext}`)
  } else if (knowledgeSummary) {
    sections.push(`CONTENT INTELLIGENCE:\n${knowledgeSummary}`)
  }

  return sections.join('\n\n')
}

// ═══════════════════════════════════════════════════════════════════
// BATCH GENERATOR — Generates creative for a chunk of slots
// ═══════════════════════════════════════════════════════════════════

async function generateBatch(
  slots: PreScheduledSlot[],
  sharedContext: string,
  strategy: Strategy,
  selectedBuckets: BucketSelection[] | undefined,
  brandOSContext: string
): Promise<any[]> {
  const slotManifest = slots.map(s =>
    `  [SLOT ${s.slotIndex}] ${s.date} | ${s.platform} | ${s.format}`
  ).join('\n')

  const hasPatterns = strategy.strategicPatterns && strategy.strategicPatterns.length > 0
  const hasBuckets = selectedBuckets && selectedBuckets.length > 0

  const prompt = `
You are an elite Social Media Strategist. Fill in the creative for these ${slots.length} pre-scheduled posts.
The dates, platforms, and formats are LOCKED. Only provide the creative content.

${sharedContext}

QUALITY: No AI smog. No em dashes. Cultural native tone. Specific to THIS brand.

═══ SLOTS TO FILL (${slots.length} posts) ═══
${slotManifest}
═══════════════════════════════════

For each slot, return a JSON object:
- "id": unique string (e.g. "post-abc123")
- "date": EXACT date from slot (YYYY-MM-DD)
- "platform": EXACT platform from slot
- "format": EXACT format from slot
- "pillar": content pillar name
${hasBuckets ? '- "bucketId": bucket ID\n- "bucketName": bucket name' : ''}
- "topic": 2-3 sentence viral concept. DETAILED. Not just a hook - full concept, angle, narrative arc.
- "eventContext": cultural event name if applicable, otherwise ""
- "psychTrigger": 1-sentence psychological lever analysis
- "usageStory": 1-sentence brand/product appearance in concept
${hasPatterns ? '- "strategicPatternId": pattern ID\n- "strategicPatternName": pattern name' : ''}
${slots.some(s => s.format === 'Story') ? `
For Story format ONLY, also include:
- "storyMediaType": "video" or "static"
- "storyFeature": "Poll"/"Quiz"/"Question Box"/"Countdown"/"Emoji Slider"/"Link Sticker"/"Music"/"Mention"
- "storyCopy": text overlay (under 15 words)` : ''}

Return { "posts": [ ... ] } with EXACTLY ${slots.length} posts. Pure JSON only, no markdown.`

  // Use GPT-mini (skipReview=true) for speed — each batch must finish in <15s
  // The date/platform/format precision is handled by code, AI only fills creative
  const res = await askExpertAgent(prompt, true, brandOSContext ? '' : undefined)
  if (!res.success) throw new Error(`Batch generation failed: ${(res as any).error || 'unknown'}`)

  let resultText = (res.data || '').replace(/```json/g, '').replace(/```/g, '').trim()

  if (!resultText || resultText.length < 10) {
    console.warn(`⚠️ AI returned empty/tiny response (${resultText.length} chars). Generating placeholders.`)
    return slots.map(slot => ({
      id: slot.id,
      date: slot.date,
      platform: slot.platform,
      format: slot.format,
      pillar: 'General',
      topic: `[AI Draft Pending] ${slot.platform} ${slot.format} post`,
      eventContext: '',
      psychTrigger: '',
      usageStory: ''
    }))
  }

  // Try to parse; if truncated JSON, attempt repair
  let posts: any[] = []
  try {
    const parsed = JSON.parse(resultText)
    posts = Array.isArray(parsed?.posts) ? parsed.posts : Array.isArray(parsed) ? parsed : []
  } catch (parseErr) {
    console.warn('⚠️ JSON parse failed, attempting repair...')
    posts = repairTruncatedJSON(resultText, slots)
  }

  // If AI returned fewer posts than slots, pad with placeholders
  if (posts.length === 0) {
    console.warn('⚠️ AI returned 0 parseable posts. Using placeholders for all slots.')
    return slots.map(slot => ({
      id: slot.id,
      date: slot.date,
      platform: slot.platform,
      format: slot.format,
      pillar: 'General',
      topic: `[AI Draft Pending] ${slot.platform} ${slot.format} post — concept to be filled`,
      eventContext: '',
      psychTrigger: '',
      usageStory: ''
    }))
  }

  // Enforce slot data onto posts (AI can't change dates/platforms/formats)
  return posts.slice(0, slots.length).map((post: any, i: number) => {
    const slot = slots[i]
    if (!slot) return post
    return {
      ...post,
      date: slot.date,
      platform: slot.platform,
      format: slot.format,
      id: post.id || slot.id
    }
  })
}

// ═══════════════════════════════════════════════════════════════════
// JSON REPAIR — Recovers posts from truncated AI output
// ═══════════════════════════════════════════════════════════════════

function repairTruncatedJSON(raw: string, slots: PreScheduledSlot[]): any[] {
  console.log(`🔧 Attempting to repair truncated JSON (${raw.length} chars)`)

  // Strategy: find all complete JSON objects in the array
  const posts: any[] = []

  // Find the posts array start
  const arrayStart = raw.indexOf('[')
  if (arrayStart === -1) return []

  let depth = 0
  let objStart = -1

  for (let i = arrayStart; i < raw.length; i++) {
    const ch = raw[i]

    if (ch === '{' && depth === 1) {
      // Start of a post object (depth 1 = inside the array)
      objStart = i
    }

    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 1 && objStart !== -1) {
        // End of a post object
        const objStr = raw.substring(objStart, i + 1)
        try {
          const obj = JSON.parse(objStr)
          posts.push(obj)
        } catch {
          // Skip malformed object
        }
        objStart = -1
      }
    }
  }

  console.log(`🔧 Recovered ${posts.length}/${slots.length} posts from truncated JSON`)
  return posts
}
