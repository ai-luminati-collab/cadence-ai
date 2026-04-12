'use server'

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
    const res = await askExpertAgent(prompt, true) // skipReview for speed (use 4.1-mini)
    if (!res.success) throw new Error("Epiphany agent failed")

    const text = res.data.trim()
    const insight = text.replace(/^Insight:\s*/i, '')
    
    return { success: true, insight }
  } catch (error: any) {
    console.error("Epiphany Extraction Failed:", error)
    return { success: false, error: error.message || "Failed to extract epiphany" }
  }
}
