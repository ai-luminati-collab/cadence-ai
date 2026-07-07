'use server'

// Server-side error message sanitizer for action return values
function sanitizeActionError(msg: any): string {
  if (!msg || typeof msg !== 'string') return 'An unexpected error occurred.';
  const patterns = [
    [/credit balance is too low/i, 'AI service temporarily unavailable.'],
    [/insufficient.?funds/i, 'AI service temporarily unavailable.'],
    [/billing/i, 'AI service temporarily unavailable.'],
    [/rate.?limit|too many requests|overloaded/i, 'AI engine is busy. Please try again.'],
    [/invalid.?api.?key|authentication|permission/i, 'AI service configuration error.'],
    [/context.?length|too.?long|token.?limit/i, 'Content too large for AI processing.'],
    [/timeout|timed.?out|ETIMEDOUT/i, 'Request timed out. Please try again.'],
    [/ECONNREFUSED|ENOTFOUND|network/i, 'Network error. Please try again.'],
    [/not valid JSON|Unexpected token/i, 'AI returned unexpected response. Please try again.'],
    [/sk-[a-zA-Z0-9]/i, 'An unexpected error occurred.'],
  ];
  for (const [pat, safe] of (patterns as [RegExp, string][])) {
    if (pat.test(msg)) return safe;
  }
  if (msg.startsWith('{') || msg.startsWith('4') || msg.startsWith('5') || msg.length > 200) {
    return 'An unexpected error occurred.';
  }
  return msg;
}

import { safeParseJSON, requireParseJSON, withRetry } from '@/lib/ai-resilience'

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
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, error: "Missing valid OPENAI_API_KEY in environment variables." }
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

    const res = await withRetry(() => askExpertAgent(prompt, true, '')) // skipReview + skip KB
    if (!res.success) return { success: false, error: "Topicals agent failed execution." }

    let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = requireParseJSON(resultText)
    
    return { success: true, data: parsed }
  } catch (error: any) {
    console.error("AI Topicals Generation Failed:", error)
    return { success: false, error: sanitizeActionError(error.message) || "Failed to generate Topicals" }
  }
}
