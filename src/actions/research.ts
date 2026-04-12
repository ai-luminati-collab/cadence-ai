'use server'

import { askExpertAgent } from '@/lib/openai-agent'
import { extractWebsiteContent } from '@/lib/jina'
import { startDeepResearch, checkDeepResearchStatus } from '@/lib/deep-research'

export interface ToneSample {
  tone: string
  caption: string
  description: string
}

export interface BrandResearch {
  summary: string
  discoveredAudiences: string[]
  audienceInsight: string
  discoveredGoals: string[]
  suggestedTone: string[]
  suggestedPlatforms: string[]
  competitorAnalysis: string
  uspHypothesis: string
  psychographicTriggers: string
  industryContext: string
  toneSamples: ToneSample[]
}

/* ═══════════════════════════════════════════════════════
   DEEP RESEARCH FLOW (Google Interactions API)
   Used for comprehensive brand intelligence gathering
   Takes 2-10 minutes in the background
   ═══════════════════════════════════════════════════════ */

/** Step 1: Start a deep research job. Returns an interaction ID to poll. */
export async function startBrandDeepResearch(
  name: string,
  industry: string,
  website?: string,
  brandDescription?: string
): Promise<{ success: boolean; interactionId?: string; error?: string }> {
  
  const query = `You are an elite brand intelligence analyst. Conduct an exhaustive deep research on the brand "${name}".

BRAND CONTEXT:
- Brand Name: ${name}
- Industry: ${industry || 'Unknown — determine from research'}
- Website: ${website || 'Not provided'}
${brandDescription ? `- Description from founder: ${brandDescription}` : ''}

RESEARCH OBJECTIVES — investigate ALL of the following with REAL data:

1. **Brand Identity & History**: What is this brand? When was it founded? What's their mission, vision, values? What is their origin story?

2. **Product/Service Analysis**: What exactly do they sell? What are their best-selling or flagship offerings? Price points? Value proposition?

3. **Target Audience Deep Dive**: Who actually buys from them? Age, income, location, lifestyle. What psychographic triggers drive their customers? Go beyond demographics — find the EMOTIONAL reasons people choose this brand.

4. **Competitive Landscape**: Who are their top 3-5 direct competitors? How does this brand differentiate? What are competitors doing on social media that's working?

5. **Social Media Presence**: Analyze their current social media (if any). What platforms are they on? What's their posting frequency? What content performs best? What's their engagement rate?

6. **Industry Trends**: What are the 3-5 hottest trends in their specific industry right now? What macro trends (cultural, technological, economic) affect their market?

7. **Brand Voice Assessment**: Based on their website copy, social posts, and marketing materials — what is their current tone of voice? Is it formal/casual? Witty/serious?

8. **Customer Sentiment**: What do customers say about them? Look at reviews, social mentions, any public sentiment.

9. **Content Opportunities**: Based on all the above, what are 5 content strategies that would resonate with their audience and differentiate them from competitors?

10. **Cultural Context**: What cultural moments, holidays, events, or community topics could they leverage for authentic content?

Be SPECIFIC. Use data, numbers, and real examples. Do NOT write generic marketing advice. Every insight must be anchored to THIS specific brand and their actual market position.`

  return startDeepResearch(query)
}

/** Step 2: Poll the status of an ongoing deep research job */
export async function pollDeepResearch(interactionId: string) {
  return checkDeepResearchStatus(interactionId)
}

/** Step 3: Take the raw research report and synthesize it into structured Brand OS data */
export async function synthesizeResearchReport(
  rawReport: string,
  brandName: string,
  industry: string,
): Promise<{ success: boolean; data?: BrandResearch; error?: string }> {

  const prompt = `You have just received an exhaustive deep research report on the brand "${brandName}" in the ${industry} industry.

RAW RESEARCH REPORT:
${rawReport.substring(0, 50000)}

Your job is to synthesize this massive research into a structured brand intelligence dossier.

CRITICAL: For the toneSamples array, write 8 sample social media captions in DIFFERENT tones, each specifically about this brand "${brandName}". Each caption should feel like a real Instagram/LinkedIn post. Use REAL insight from the research to make them hyper-specific.

Return STRICTLY as JSON (no markdown wrappers):
{
  "summary": "A 3-5 sentence executive summary synthesizing the brand's position, market context, and opportunity. Be specific with numbers and facts from the research.",
  "discoveredAudiences": ["Specific audience 1 with detail", "Specific audience 2", "Specific audience 3"],
  "audienceInsight": "A 80-120 word deep analysis of who their ideal customer is — use REAL psychographic data from the research. Demographics, behaviors, pain points, aspirations.",
  "discoveredGoals": ["Most strategic goal 1 based on research", "Goal 2"],
  "suggestedTone": ["Tone 1", "Tone 2"],
  "suggestedPlatforms": ["Platform 1", "Platform 2", "Platform 3"],
  "competitorAnalysis": "A 80-120 word analysis of the competitive landscape with SPECIFIC competitor names and their strengths/weaknesses from the research.",
  "uspHypothesis": "A 2-3 sentence hypothesis of what makes this brand unique — grounded in REAL differentiators found in the research.",
  "psychographicTriggers": "A 60-100 word analysis of the psychological triggers that drive their audience — based on actual customer behavior/sentiment from the research.",
  "industryContext": "A 60-100 word snapshot of current industry trends with specific data points from the research.",
  "toneSamples": [
    { "tone": "Playful", "caption": "A hyper-specific caption using real brand details.", "description": "Light, witty, and approachable." },
    { "tone": "Serious", "caption": "A caption grounded in real brand facts.", "description": "Professional, authoritative." },
    { "tone": "Disruptive", "caption": "A bold caption that challenges their industry.", "description": "Provocative and unapologetic." },
    { "tone": "Safe/Corporate", "caption": "A polished caption for brand safety.", "description": "Reliable and corporate-friendly." },
    { "tone": "Authoritative", "caption": "An expert-level caption with real data.", "description": "Thought leader voice." },
    { "tone": "Peer-like", "caption": "A casual, relatable caption.", "description": "Talks like a friend." },
    { "tone": "Educational", "caption": "A value-adding caption with real insight.", "description": "Teaches and guides." },
    { "tone": "Inspirational", "caption": "An emotionally resonant caption.", "description": "Uplifts and connects." }
  ]
}

Make EVERY field specific to "${brandName}" — reference their actual products, competitors, and market position. NOT generic marketing copy.`

  try {
    const res = await askExpertAgent(prompt)
    if (!res.success) throw new Error("Synthesis failed")
    
    let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    return { success: true, data: JSON.parse(resultText) }
  } catch (error: any) {
    console.error("Research synthesis failed:", error)
    return { success: false, error: error.message || "Failed to synthesize research" }
  }
}

/* ═══════════════════════════════════════════════════════
   FALLBACK: Quick Research (if Deep Research fails)
   Uses standard GPT pipeline — fast but less comprehensive
   ═══════════════════════════════════════════════════════ */

export async function researchBrand(
  name: string, 
  industry: string, 
  website?: string,
  brandDescription?: string
): Promise<{ success: boolean; data?: BrandResearch; error?: string }> {
  
  let scrapedWebsiteContext = ''
  if (website) {
    const scrapedText = await extractWebsiteContent(website)
    if (scrapedText) {
      const truncated = scrapedText.substring(0, 15000) 
      scrapedWebsiteContext = `
--- LIVE WEBSITE DATA START ---
We have scraped their live website. Here is the raw Markdown content of their homepage:
${truncated}
--- LIVE WEBSITE DATA END ---
      `
    }
  }

  const prompt = `You are an elite brand research analyst. Conduct a thorough research briefing on this brand.

Brand Name: ${name}
${industry ? `Industry (user-provided): ${industry}` : 'Industry: Not provided — you MUST infer it from the brand name, website, and description below.'}
Website: ${website || 'Not provided'}
${brandDescription ? `Brand Description (from founder): ${brandDescription}` : ''}

${scrapedWebsiteContext}

FIRST: If no industry was provided, determine the industry/category from the brand name, website URL, and description. Be specific (e.g. "QSR / Quick Service Restaurants" not just "Food").

Based on all available context (especially the scraped website data if provided), produce a comprehensive research dossier.
If website data is present, anchor your psychographics, tone, and USP tightly around their exact live copy and positioning.
If neither is provided, use your deep knowledge of the industry to make intelligent inferences.

CRITICAL: For the toneSamples array, write 8 sample social media captions in DIFFERENT tones, each specifically about this brand "${name}". Each caption should feel like a real Instagram/LinkedIn post. The user will pick the style that resonates.

Return STRICTLY as JSON (no markdown wrappers):
{
  "summary": "A 2-3 sentence executive summary of what this brand is and its market position.",
  "discoveredAudiences": ["Audience segment 1", "Audience segment 2", "Audience segment 3"],
  "audienceInsight": "A 50-80 word deep analysis of who their ideal customer likely is — demographics, psychographics, behaviors, pain points.",
  "discoveredGoals": ["Most likely goal 1", "Most likely goal 2"],
  "suggestedTone": ["Tone 1", "Tone 2"],
  "suggestedPlatforms": ["Platform 1", "Platform 2", "Platform 3"],
  "competitorAnalysis": "A 40-60 word analysis of the competitive landscape and 2-3 likely key competitors.",
  "uspHypothesis": "A 1-2 sentence hypothesis of what makes this brand unique based on available information.",
  "psychographicTriggers": "A 40-60 word analysis of the psychological triggers (status, FOMO, belonging, aspiration, etc.) that would resonate with their audience.",
  "industryContext": "A 30-50 word snapshot of current trends and opportunities in their specific industry.",
  "toneSamples": [
    { "tone": "Playful", "caption": "A 1-2 sentence social media caption in a playful, fun tone for this brand.", "description": "Light, witty, and approachable. Uses humor and personality." },
    { "tone": "Serious", "caption": "A 1-2 sentence social media caption in a serious, authoritative tone.", "description": "Professional, no-nonsense. Builds trust through gravitas." },
    { "tone": "Disruptive", "caption": "A 1-2 sentence social media caption in a bold, disruptive tone.", "description": "Challenges the status quo. Provocative and unapologetic." },
    { "tone": "Safe/Corporate", "caption": "A 1-2 sentence social media caption in a safe, corporate tone.", "description": "Polished, brand-safe. Reliable and corporate-friendly." },
    { "tone": "Authoritative", "caption": "A 1-2 sentence social media caption in an authoritative, expert tone.", "description": "Thought leader voice. Speaks from deep expertise." },
    { "tone": "Peer-like", "caption": "A 1-2 sentence caption in a peer-like, conversational tone.", "description": "Talks like a friend. Casual, relatable, real." },
    { "tone": "Educational", "caption": "A 1-2 sentence social media caption in an educational, informative tone.", "description": "Teaches and adds value. Positions as a helpful guide." },
    { "tone": "Inspirational", "caption": "A 1-2 sentence social media caption in an inspirational, motivational tone.", "description": "Uplifts and moves. Connects emotionally." }
  ]
}

Make EVERY caption specific to "${name}" — use the brand name, reference the product/service, and make it feel real. NOT generic marketing copy.
Be specific, not generic. Output must be 100% valid JSON.`

  try {
    const res = await askExpertAgent(prompt, true) // skipReview for speed
    if (!res.success) throw new Error("Research agent failed.")
    
    let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    return { success: true, data: JSON.parse(resultText) }
  } catch (error: any) {
    console.error("Brand Research Failed:", error)
    return { success: false, error: error.message || "Failed to research brand" }
  }
}
