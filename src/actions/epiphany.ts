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

import { withRetry } from '@/lib/ai-resilience'

import { askExpertAgent } from '@/lib/openai-agent'
import { extractWebsiteContent } from '@/lib/jina'

interface EpiphanyContext {
  brandName?: string
  industry?: string
  websiteContext?: string // Markdown from Jina, if any
}

/**
 * Derives a deep, non-obvious psychological marketing fact based on a user's single form input.
 */
export async function extractEpiphany(
  fieldName: string, 
  value: string, 
  context: EpiphanyContext
): Promise<{ success: boolean; insight?: string; error?: string }> {
  
  if (!value || value.trim() === '') return { success: false, error: 'Empty value' }

  let scrapedWebsiteContext = ''
  if (context.websiteContext) {
    scrapedWebsiteContext = `Live Website Context: ${context.websiteContext.substring(0, 3000)}`
  }

  const prompt = `You are a world-class Consumer Psychologist and Brand Strategist.
Your goal is to deduce ONE brilliant, non-obvious marketing fact based on a small piece of client data.

The brand "${context.brandName || 'Unknown'}" (Industry: ${context.industry || 'Unknown'}) just defined their "${fieldName}" as:
"${value}"

${scrapedWebsiteContext}

Task: Formulate a single, deeply insightful 1-sentence psychological marketing fact or structural truth about this that the brand MUST internalize in their strategy. Focus on human behavior, status, vulnerability, or cultural leverage.
DO NOT use generic marketing jargon. Make it sound like a profound realization.

Format: "Insight: [Your 1 sentence realization]"
Output ONLY this format, nothing else.`

  try {
    const res = await withRetry(() => askExpertAgent(prompt, true, '')) // skipReview + skip KB
    if (!res.success) throw new Error("Epiphany agent failed")

    const text = res.data.trim()
    const insight = text.replace(/^Insight:\s*/i, '')
    
    return { success: true, insight }
  } catch (error: any) {
    console.error("Epiphany Extraction Failed:", error)
    return { success: false, error: sanitizeActionError(error.message) || "Failed to extract epiphany" }
  }
}
