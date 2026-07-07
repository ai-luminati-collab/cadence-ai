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
import { BrandInfo, ContentDraft } from '@/stores/brand'

/**
 * Feature 1: Edit Learning
 * When a user manually edits a concept or refines a draft, we diff the before/after
 * and extract a learning rule about what the user actually wanted.
 */
export async function extractEditLearning(
  brandInfo: BrandInfo,
  originalText: string,
  editedText: string,
  fieldName: string // e.g. "topic", "caption", "hookScript"
): Promise<{ success: boolean; data?: { insight: string; explanation: string }; error?: string }> {
  
  // Don't learn from trivial edits (typo fixes, etc.)
  if (Math.abs(originalText.length - editedText.length) < 10 && 
      levenshteinSimilarity(originalText, editedText) > 0.85) {
    return { success: true, data: undefined }
  }

  const prompt = `
You are an AI Learning Engine. A human just manually edited AI-generated content.
Your job: figure out WHAT they changed and WHY, then distill it into a permanent rule.

Brand: ${brandInfo.name} (${brandInfo.industry})
Field Edited: ${fieldName}

ORIGINAL (AI wrote this):
"${originalText}"

EDITED (Human changed it to):
"${editedText}"

Analyze the diff. What pattern did the human correct?
- Did they shorten it? → Rule about brevity
- Did they change the tone? → Rule about voice
- Did they add specific details? → Rule about specificity
- Did they remove AI-sounding words? → Rule about banned language
- Did they restructure it? → Rule about format

Return strictly as JSON (no markdown):
{
  "insight": "RULE: [specific, enforceable rule the AI should follow next time]",
  "explanation": "One sentence explaining what the human was correcting"
}

If the edit is just a typo or formatting fix with no meaningful pattern, return:
{ "insight": null, "explanation": "Minor edit, no pattern detected" }
`

  try {
    const res = await withRetry(() => askExpertAgent(prompt, false, '')) // Boss Review (Stage 2) enabled (maxDuration is 300s)
    if (!res.success || !res.data) throw new Error("Learning engine failed")
    
    const parsed = requireParseJSON(res.data)
    if (!parsed.insight) return { success: true }
    
    return { success: true, data: parsed }
  } catch (error: any) {
    return { success: false, error: sanitizeActionError(error.message) }
  }
}

// Simple similarity check to filter trivial edits
function levenshteinSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a
  if (longer.length === 0) return 1.0
  
  // Quick approximation using common character ratio
  const set1 = new Set(a.toLowerCase().split(' '))
  const set2 = new Set(b.toLowerCase().split(' '))
  const intersection = [...set1].filter(w => set2.has(w)).length
  const union = new Set([...set1, ...set2]).size
  return intersection / union
}
