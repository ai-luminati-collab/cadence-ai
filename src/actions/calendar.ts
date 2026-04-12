'use server'

export const maxDuration = 300

import { askExpertAgent } from '@/lib/openai-agent'
import { BrandInfo, Strategy } from '@/stores/brand'
import { TopicalEvent } from './topicals'
import { getAllKnowledgeSummary } from '@/lib/knowledge-loader'
import { buildProductContext } from '@/lib/product-context'

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
  contentMatrix?: Record<string, Record<string, Record<string, number>>>
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

  // Load cross-platform intelligence for calendar planning
  const knowledgeSummary = await getAllKnowledgeSummary()

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

    Content Pillars and their distribution weighting:
    ${strategy.coreNarratives}

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

    ${knowledgeSummary ? `
    === MASTER CONTENT INTELLIGENCE (RESEARCH-BACKED — USE FOR CALENDAR PLANNING) ===
    Use this intelligence to correctly assign platforms, formats, and content strategies:
    ${knowledgeSummary}
    ===============================================================================
    ` : ''}

    Output a strict JSON array under the key "posts". We need ${targetPostsStr} strategically scattered between ${startDate} and ${endDate}.
    Each post object must have:
    "id": A unique random string
    "date": The exact date string this post goes live (FORMAT: YYYY-MM-DD). It MUST fall strictly between ${startDate} and ${endDate}.
    "platform": The specific platform this post is destined for. Use "Meta (Instagram & Facebook)" for Instagram/Facebook, or name the specific platform (LinkedIn, X (Twitter), etc).
    "format": Must match the platform constraint (e.g. 'Reel', 'Carousel', 'Static', 'Story' for Meta; 'Text', 'Thread' for Linkedin/X, 'Short' for Youtube).
    "pillar": Which content pillar does this fit into (use the exact pillar name provided above)
    "topic": A hyper-engaging, viral 2-3 sentence description of what the post will actually be about. Be DETAILED and SPECIFIC. Not just a hook — describe the full concept, angle, and narrative arc. (e.g. "POV: you finally found the skincare routine that clears hormonal acne. Open on a frustrated morning mirror check, then reveal the 3-step ritual. End with the 'glowing skin' payoff shot.")
    "eventContext": (Optional) If this post is related to a custom event or a detected cultural holiday/trend on that day, name the event here. Otherwise leave it blank.
    "psychTrigger": A 1-sentence analysis of which psychological lever this post pulls (Status, Nostalgia, FOMO, Belonging, Survival, Curiosity, Scarcity) and HOW it does it. Be specific to THIS post's concept.
    "usageStory": A 1-sentence description of how/when/where the product or brand appears in the narrative of THIS specific post. Not generic — tied to the concept.

    === STORY FORMAT RULES (CRITICAL FOR format: 'Story') ===
    When format is "Story", you MUST also include:
    "storyMediaType": Either "video" (a 5-15 sec clip) or "static" (a single designed frame). Choose based on the concept.
    "storyFeature": Which Instagram interactive sticker/feature to use. Pick ONE: "Poll", "Quiz", "Question Box", "Countdown", "Emoji Slider", "Link Sticker", "Music", "Mention". Match it to the concept's intent.
    "storyCopy": The exact text overlay copy that appears on the Story frame (keep it under 15 words, punchy and native).
    ============================================================

    Return the payload strictly with { "posts": [ ... ] } without any markdown backticks or wrappers.
  `

  try {
     // Enable Stage 2 (Boss Review) for high-reasoning strategic oversight
     const res = await askExpertAgent(prompt, false) 
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
