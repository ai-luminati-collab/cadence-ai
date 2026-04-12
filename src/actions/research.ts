'use server'

import { askExpertAgent } from '@/lib/openai-agent'
import { extractWebsiteContent } from '@/lib/jina'

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
      // Truncate to avoid blowing up the prompt context window
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
