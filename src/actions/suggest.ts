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

export async function suggestFieldValue(
  fieldName: string,
  fieldDescription: string,
  context: {
    brandName: string
    industry: string
    website?: string
    researchSummary?: string
    previousAnswers?: Record<string, string>
  }
): Promise<{ success: boolean; suggestions?: string[]; error?: string }> {

  const contextBlock = [
    `Brand: ${context.brandName}`,
    `Industry: ${context.industry}`,
    context.website ? `Website: ${context.website}` : null,
    context.researchSummary ? `AI Research Summary: ${context.researchSummary}` : null,
    context.previousAnswers 
      ? `Previous answers:\n${Object.entries(context.previousAnswers).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
      : null,
  ].filter(Boolean).join('\n')

  const prompt = `You are helping a brand founder fill out their brand strategy form. They need help with this field:

Field: "${fieldName}"
Description: ${fieldDescription}

Context about the brand:
${contextBlock}

Generate exactly 3 concise, specific suggestions for this field. Each suggestion should be:
- Directly relevant to THIS specific brand (not generic)
- Actionable and specific (not vague platitudes)
- Different from each other (cover different angles)
- 1-3 sentences max each

Return STRICTLY as a JSON array of 3 strings (no markdown):
["suggestion 1", "suggestion 2", "suggestion 3"]

(Iteration seed to ensure uniqueness: ${Math.random()})`

  try {
    const res = await withRetry(() => askExpertAgent(prompt, true, '')) // Fast mode + skip KB
    if (!res.success) throw new Error("Suggest agent failed.")

    let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    return { success: true, suggestions: requireParseJSON(resultText) }
  } catch (error: any) {
    console.error("Field Suggestion Failed:", error)
    return { success: false, error: sanitizeActionError(error.message) || "Failed to generate suggestions" }
  }
}
