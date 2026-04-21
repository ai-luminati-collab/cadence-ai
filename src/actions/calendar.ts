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

  // Build post count from content matrix or frequency fallback
  let targetPostsStr = "around 15-20 posts"
  if (frequency === "aggressive") targetPostsStr = "around 25-30 posts (almost daily)"
  if (frequency === "light") targetPostsStr = "around 8-12 posts"
  
  // If content matrix is provided, calculate exact totals and build the blueprint
  let matrixBlueprint = ''
  if (contentMatrix && Object.keys(contentMatrix).length > 0) {
    const totalPosts = Object.values(contentMatrix).reduce((sum, monthData) => 
      sum + Object.values(monthData).reduce((s, platFmts) => 
        s + Object.values(platFmts).reduce((c, n) => c + n, 0), 0), 0)
    targetPostsStr = `EXACTLY ${totalPosts} posts total`
    
    const lines: string[] = []
    for (const [monthKey, platforms] of Object.entries(contentMatrix)) {
      const [y, m] = monthKey.split('-')
      const monthLabel = new Date(parseInt(y), parseInt(m) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
      lines.push(`\n[${monthLabel.toUpperCase()}]`)
      for (const [plat, formats] of Object.entries(platforms)) {
        const formatList = Object.entries(formats).filter(([_, count]) => count > 0).map(([fmt, count]) => `${count}x ${fmt}`).join(', ')
        if (formatList) lines.push(`  ${plat}: ${formatList}`)
      }
    }
    matrixBlueprint = lines.join('\n')
  }

  // Use compiled Brand OS if available (saves ~15K tokens vs loading full KB)
  const brandOSContext = buildBrandOSContext(strategy.compiledBrandOS)
  const knowledgeSummary = brandOSContext ? '' : await getAllKnowledgeSummary()

  const prompt = `
    You are an elite Social Media Manager and Content Strategist.
    We need to map out a precise content calendar between the exact dates of [${startDate}] and [${endDate}].
    
    Here is the brand context:
    Name: ${brandInfo.name}
    Industry: ${brandInfo.industry}
    Voice: ${strategy.persona}
    Audience: ${strategy.targetAudience}
    ${platformScope && platformScope.length > 0 ? `
    PLATFORM SCOPE RESTRICTION: ONLY generate posts for these platforms: ${platformScope.join(', ')}. Do NOT include any other platform.
    ` : `Platforms: ${brandInfo.platforms?.join(', ') || 'All platforms'}`}

    ${matrixBlueprint ? `
    === CONTENT SCOPE MATRIX (MANDATORY — FOLLOW EXACTLY) ===
    The user has defined the EXACT number of posts per format per platform per month.
    You MUST follow this distribution PRECISELY. Do NOT add extra posts or skip any.
    ${matrixBlueprint}
    =========================================================
    ` : (formatScope && Object.keys(formatScope).length > 0 ? `
    === PER-PLATFORM FORMAT SCOPE (STRICT — ONLY USE THESE FORMATS) ===
    ${Object.entries(formatScope).map(([plat, fmts]) => `- ${plat}: ${fmts.join(', ')}`).join('\n    ')}
    ====================================================================
    ` : '')}

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
    - NOT every post needs to feature a product. Posts about culture, behind-the-scenes,
      lifestyle, industry trends, community engagement, etc. are perfectly fine and encouraged.
    - HOWEVER, if a post concept DOES reference a specific product or menu item,
      it MUST be one from the list above — by its EXACT name.
    - NEVER invent, hallucinate, or assume products that are NOT on this list.
    ========================================================================
    ` : ''}

    Content Pillars and their distribution weighting:
    ${strategy.coreNarratives}

    ${strategy.strategicPatterns && strategy.strategicPatterns.length > 0 ? `
    === MASTER STRATEGIC PATTERNS (CRITICAL INJECTION) ===
    The brand OS requires you to execute the following specific strategic patterns across the calendar.
    For each post you generate, you MUST align it with ONE of these patterns to avoid generic outputs.
    ${strategy.strategicPatterns.map((p, i) => `
    Pattern ${i+1}: [${p.id}] ${p.name}
    Description: ${p.description}
    Execution Markers: ${p.executionMarkers.join(', ')}
    `).join('\n')}
    ======================================================
    ` : ''}

    ${customEvents || "None specified. Auto-detect relevant cultural holidays for the target demographic if applicable."}

    === LIVE MARKET TRACTION (CRITICAL) ===
    ${liveMarketTraction && liveMarketTraction !== "NO_LIVE_DATA_AVAILABLE" 
      ? `We just scraped the live internet. Use these exact viral archetypes to shape the concepts:\n${liveMarketTraction}` 
      : "No live traction data loaded. Default to foundational elite strategy."}
    =======================================

    === USER-LOCKED TOPICALS ===
    The user has already LOCKED IN the following cultural moments/topicals. You MUST map a post for EVERY single one of these on their EXACT given dates, using their EXACT requested format.
    ${lockedTopicals.length > 0 ? lockedTopicals.filter(t => t.selected).map(t => `[LOCKED TOPICAL] Date: ${t.dateStr} | Event: ${t.name} | Format: ${t.suggestedFormat} | Relevance: ${t.relevance}`).join('\n') : "No locked topicals provided."}
    ============================

    Target Platforms available for distribution:
    ${brandInfo.platforms?.join(', ') || 'Meta'}

    === PLATFORM NATIVE PLAYBOOKS (STRICT COMPLIANCE REQUIRED) ===
    ${strategy.platformPlaybooks && Object.keys(strategy.platformPlaybooks).length > 0 
      ? `You MUST format and route content strictly according to these platform rules:\n` + Object.entries(strategy.platformPlaybooks).map(([platform, playbook]) => `
      [${platform.toUpperCase()} PLAYBOOK]:
      - Role: ${playbook.role}
      - Format Mechanics allowed: ${playbook.mechanics}
      - Tone shift: ${playbook.toneModifier}
      - Frequency: ${playbook.cadence}
      `).join('\n')
      : "No strict platform playbooks defined. Rely on native generalized best practices."}
    ==============================================================

    ${brandInfo.aiKnowledgeBase && brandInfo.aiKnowledgeBase.length > 0 ? `
    === LEARNED BRAND RULES (FROM CREATIVE DIRECTOR — HIGHEST PRIORITY) ===
    These rules were learned from direct feedback and OVERRIDE all other instructions when they conflict:
    ${brandInfo.aiKnowledgeBase.map((rule, i) => `    ${i+1}. ${rule}`).join('\n')}
    ======================================================================
    ` : ''}

    CRITICAL QUALITY & OMNICHANNEL ROUTING GUIDELINES:
    1. META UNIFICATION (STRICT): "Meta" refers to Instagram & Facebook combined. Strategy must lead with high-retention visual hooks.
    2. ALGORITHMIC NATIVES: Use native hooks (POV, Unpopular Opinion, etc.). No generic corporate ideas.
    3. SUBCONSCIOUS TRIGGERS: Pull levers of status, survival, or belonging.
    4. NO CRINGE: If a concept sounds like it came from a 2010 marketing PDF, delete it. We only do cultural resonance.
    5. NEVER USE EM DASHES: Do NOT use the "---" or "--" or "—" character anywhere in any field. Use commas, periods, or short dashes (-) instead.
    6. STORIES CAN SHARE DAYS: Stories (format: 'Story') are ephemeral and SHOULD be scheduled on the same day as regular posts (Static, Carousel, Reel) on the same platform. A day can have both a Reel AND a Story for Meta. Treat Stories as supplementary, not competing.

    ${brandOSContext ? `
    === COMPILED BRAND OS (FOLLOW STRICTLY — THIS IS YOUR GROUND TRUTH) ===
    The following intelligence was compiled specifically for this brand during strategy generation.
    It contains platform rules, format blueprints, anti-patterns, category context, and quality standards.
    Use this to correctly assign platforms, formats, and content strategies:

    ${brandOSContext}
    ====================================================================
    ` : knowledgeSummary ? `
    === MASTER CONTENT INTELLIGENCE (RESEARCH-BACKED — USE FOR CALENDAR PLANNING) ===
    Use this intelligence to correctly assign platforms, formats, and content strategies:
    ${knowledgeSummary}
    ===============================================================================
    ` : ''}

    ${selectedBuckets && selectedBuckets.length > 0 ? `
    === CONTENT BUCKET MIX (${bucketMode === 'manual' ? 'STRICT — USER-DEFINED COUNTS' : 'AI-GUIDED — RESPECT MIN/MAX'}) ===
    The user has defined specific content buckets for this calendar. Each post MUST be assigned to one of these buckets.
    ${selectedBuckets.map(b => `  - [${b.pillarName}] → "${b.bucketName}" (ID: ${b.bucketId}) — ${b.count ? `EXACT: ${b.count} posts` : `Range: ${b.min}-${b.max} posts/month`}`).join('\n')}
    
    ${bucketMode === 'manual' ? 'You MUST match the exact post counts above. No more, no less per bucket.' : 'You have flexibility within the min/max ranges. Distribute intelligently based on strategy.'}
    ================================================================
    ` : ''}

    Output a strict JSON array under the key "posts". We need ${targetPostsStr} strategically scattered between ${startDate} and ${endDate}.
    Each post object must have:
    "id": A unique random string
    "date": The exact date string this post goes live (FORMAT: YYYY-MM-DD). It MUST fall strictly between ${startDate} and ${endDate}.
    "platform": The specific platform this post is destined for. Use "Meta (Instagram & Facebook)" for Instagram/Facebook, or name the specific platform (LinkedIn, X (Twitter), etc).
    "format": Must match the platform constraint (e.g. 'Reel', 'Carousel', 'Static', 'Story' for Meta; 'Text', 'Thread' for Linkedin/X, 'Short' for Youtube).
    "pillar": Which content pillar does this fit into (use the exact pillar name provided above)
    ${selectedBuckets && selectedBuckets.length > 0 ? `"bucketId": The exact bucket ID from the Content Bucket Mix above that this post belongs to.
    "bucketName": The exact bucket name this post belongs to.` : ''}
    "topic": A hyper-engaging, viral 2-3 sentence description of what the post will actually be about. Be DETAILED and SPECIFIC. Not just a hook — describe the full concept, angle, and narrative arc. (e.g. "POV: you finally found the skincare routine that clears hormonal acne. Open on a frustrated morning mirror check, then reveal the 3-step ritual. End with the 'glowing skin' payoff shot.")
    "eventContext": (Optional) If this post is related to a custom event or a detected cultural holiday/trend on that day, name the event here. Otherwise leave it blank.
    "psychTrigger": A 1-sentence analysis of which psychological lever this post pulls (Status, Nostalgia, FOMO, Belonging, Survival, Curiosity, Scarcity) and HOW it does it. Be specific to THIS post's concept.
    "usageStory": A 1-sentence description of how/when/where the product or brand appears in the narrative of THIS specific post. Not generic — tied to the concept.
    ${strategy.strategicPatterns && strategy.strategicPatterns.length > 0 ? `"strategicPatternId": The ID (e.g. 'Pattern 01') of the specific pattern from the MASTER STRATEGIC PATTERNS that this post executes.
    "strategicPatternName": The name of the specific pattern chosen.` : ''}

    === STORY FORMAT RULES (CRITICAL FOR format: 'Story') ===
    When format is "Story", you MUST also include:
    "storyMediaType": Either "video" (a 5-15 sec clip) or "static" (a single designed frame). Choose based on the concept.
    "storyFeature": Which Instagram interactive sticker/feature to use. Pick ONE: "Poll", "Quiz", "Question Box", "Countdown", "Emoji Slider", "Link Sticker", "Music", "Mention". Match it to the concept's intent.
    "storyCopy": The exact text overlay copy that appears on the Story frame (keep it under 15 words, punchy and native).
    ============================================================

    Return the payload strictly with { "posts": [ ... ] } without any markdown backticks or wrappers.
  `

  try {
     // Run the Calendar Generation directly on GPT-4o (Boss Model) using a single-pass execution.
     // This guarantees elite reasoning for strategy distribution, but finishes in ~30s instead of 60s+ 
     // (avoiding the two-stage Vercel serverless timeout).
     // When Brand OS exists, pass '' to suppress legacy KB loading
     const res = await askExpertAgentPremium(prompt, brandOSContext ? '' : undefined)
     if (!res.success) throw new Error("Agent failed execution.")

     // Remove markdown formatting from Assistant response if any
     let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
     const data = JSON.parse(resultText).posts
     return { success: true, data }
  } catch (error: any) {
     console.error("AI Calendar Generation Failed:", error)
     return { success: false, error: error.message || "Failed to generate Calendar" }
  }
}
