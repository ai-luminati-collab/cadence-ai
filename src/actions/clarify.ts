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

export interface ClarifyingQuestion {
  id: string
  question: string
  why: string
  placeholder: string
}

export async function generateClarifyingQuestions(
  context: {
    brandName: string
    industry: string
    website?: string
    audiences?: string[]
    goals?: string[]
    tone?: string[]
    platforms?: string[]
    usp?: string
    competitors?: string
    psychographics?: string
    extraNotes?: string
  }
): Promise<{ success: boolean; questions?: ClarifyingQuestion[]; error?: string }> {

  const prompt = `You are the Legendary Marketer — a world-class brand strategist preparing to build a comprehensive brand strategy.

You've received this intake brief from a founder:

Brand: ${context.brandName}
Industry: ${context.industry}
Website: ${context.website || 'Not provided'}
Target Audiences: ${context.audiences?.join(', ') || 'Not specified'}
Goals: ${context.goals?.join(', ') || 'Not specified'}
Tone: ${context.tone?.join(', ') || 'Not specified'}
Platforms: ${context.platforms?.join(', ') || 'Not specified'}
USP: ${context.usp || 'Not provided'}
Competitors: ${context.competitors || 'Not specified'}
Psychographics: ${context.psychographics || 'Not provided'}
Additional Notes: ${context.extraNotes || 'None'}

Now, identify the GAPS in this brief. What critical information is missing that would make the difference between a generic strategy and a legendary one?

Generate exactly 4 clarifying questions. Each should:
- Target a specific gap (not ask what they've already answered)
- Be conversational and warm (not clinical)
- Help you build a sharper, more distinctive strategy
- Include a hint of why this matters

Return STRICTLY as JSON (no markdown):
[
  {
    "id": "q1",
    "question": "The question itself — conversational, direct.",
    "why": "A 1-sentence explanation of why this matters for the strategy.",
    "placeholder": "A helpful placeholder hint for the answer field."
  }
]`

  try {
    const res = await withRetry(() => askExpertAgent(prompt, true, '')) // Fast mode + skip KB
    if (!res.success) throw new Error("Clarify agent failed.")

    let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    return { success: true, questions: requireParseJSON(resultText) }
  } catch (error: any) {
    console.error("Clarifying Questions Failed:", error)
    return { success: false, error: sanitizeActionError(error.message) || "Failed to generate questions" }
  }
}
