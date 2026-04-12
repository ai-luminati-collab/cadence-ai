'use server'

import { askExpertAgent } from '@/lib/openai-agent'
import { BrandInfo } from '@/stores/brand'

export interface TopicalEvent {
  id: string
  dateStr: string // "YYYY-MM-DD"
  name: string
  relevance: string
  suggestedFormat?: 'Reel' | 'Carousel' | 'Static'
  selected?: boolean
}

export async function generateTopicals(
  brandDetails: BrandInfo,
  targetMonths: string[] // e.g. ["2026-04", "2026-05"]
): Promise<{ success: boolean; data?: TopicalEvent[]; error?: string }> {
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing valid OPENAI_API_KEY in environment variables.")
  }

  const prompt = `You are a viral social media strategist.
Your task is to identify key cultural moments, holidays, trending topical dates, or industry-specific occurrences that this brand MUST capitalize on for the requested months.

Brand: ${brandDetails.name}
Industry: ${brandDetails.industry}
Target Audience: ${brandDetails.primaryAudiences?.join(', ') || 'General'}

Target Months (YYYY-MM Format): ${targetMonths.join(', ')}

Please identify 3 to 6 major dates across these months that provide incredible contextual marketing opportunities (e.g. World Earth Day, Mother's Day, Superbowl, Industry Specific Days).
ONLY pick days that make sense for their specific target audience and industry.

Return STRICTLY as a JSON array of objects, with no markdown:
[
  {
    "id": "event_1",
    "dateStr": "YYYY-MM-DD", 
    "name": "Name of the Event",
    "relevance": "Why this specific brand should post on this day (1 sentence)"
  }
]
`

  try {
    const res = await askExpertAgent(prompt, true) // skipReview for speed
    if (!res.success) throw new Error("Topicals agent failed execution.")

    let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(resultText)
    
    return { success: true, data: parsed }
  } catch (error: any) {
    console.error("AI Topicals Generation Failed:", error)
    return { success: false, error: error.message || "Failed to generate Topicals" }
  }
}
