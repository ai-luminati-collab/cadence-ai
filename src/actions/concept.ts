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
import { BrandData } from '@/stores/brand'
import { CalendarPost } from '@/stores/brand'

export async function rerollConcept(brandData: BrandData, post: CalendarPost): Promise<{ success: boolean; data?: string; error?: string }> {
  if (!brandData.brandInfo || !brandData.strategy) {
    return { success: false, error: "Missing brand info." }
  }

  const prompt = `
    You are an elite Social Media Strategist.
    You originally generated this content concept for a post:
    Pillar: ${post.pillar}
    Topic/Hook: "${post.topic}"
    Target Platform: ${post.platform}

    The user HATED this idea and clicked "Re-Roll". 
    Your job is to generate a completely new, vastly different, but still highly strategic concept/hook for this same pillar and platform.
    
    Make it sound like an elite digital native wrote it. NEVER use em dashes (--- or -- or \u2014).
    
    Return ONLY a single sentence representing the new 'topic'. Do NOT wrap in quotes.
  `

  try {
    const res = await withRetry(() => askExpertAgent(prompt, false, ''))
    if (!res.success || !res.data) throw new Error("Failed to generate new concept")
    
    // Clean any wrapping quotes or markdown the model might add
    let cleaned = res.data.trim()
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) cleaned = cleaned.slice(1, -1)
    if (cleaned.startsWith("'") && cleaned.endsWith("'")) cleaned = cleaned.slice(1, -1)
    // Strip em dashes
    cleaned = cleaned.replace(/[—–]/g, '-').replace(/--+/g, '-')
    
    return { success: true, data: cleaned }
  } catch (error: any) {
    return { success: false, error: sanitizeActionError(error.message) || "Failed to re-roll." }
  }
}

export interface SparringResponse {
  approved: boolean
  feedback: string
  newTopic: string
  epiphany?: string
}

export async function chatWithConcept(brandData: BrandData, post: CalendarPost, userPrompt: string): Promise<{ success: boolean; data?: SparringResponse; error?: string }> {
  const coreProducts = brandData.brandInfo?.coreProducts || []
  const productListStr = coreProducts.length > 0 
    ? `\n\nCORE PRODUCTS (GROUND TRUTH — the brand ACTUALLY sells these):\n${coreProducts.map((p, i) => `  ${i+1}. ${p}`).join('\n')}\n`
    : ''

  const prompt = `
    You are an elite, $20k/month Social Media Director paired with a client.
    The current content concept slated for ${post.platform} is:
    Pillar: ${post.pillar}
    Topic/Hook: "${post.topic}"
    ${productListStr}

    The User just gave you this directive to edit the concept:
    "${userPrompt}"

    YOUR JOB IS TO BE A CREATIVE SPARRING PARTNER — BUT YOU MUST RESPECT FACTUAL CORRECTIONS.

    === CRITICAL DISTINCTION ===
    There are TWO types of user edits:
    
    TYPE A — FACTUAL CORRECTION: The user is correcting a hallucination or factual error.
    Examples: "We don't sell wraps", "Our brand name is X not Y", "We are vegetarian only", "Change wrap to sandwich"
    → You MUST auto-approve these. Do NOT push back on factual corrections. Say "Got it, fixing that."
    
    TYPE B — CREATIVE/STRATEGIC PREFERENCE: The user is changing the angle, tone, or approach.
    Examples: "Make it funnier", "Focus on the price point", "Make it more formal"
    → Evaluate against ${post.platform}'s algorithm reality. Push back ONLY if it would genuinely hurt performance.
    ========================

    RULES:
    1. If the user is correcting a product/factual mistake (TYPE A) → approved: true, no debate.
    2. If their creative idea softens the hook, sounds corporate, or will fail algorithmically (TYPE B) → push back. (approved: false, feedback: "For ${post.platform}, this may hurt because...")
    3. If their idea is brilliant or acceptable → accept it. (approved: true, feedback: "Great angle.")
    4. If their idea reveals a breakthrough about brand communication → extract it as an 'epiphany'.
    5. NEVER USE EM DASHES (--- or -- or \\u2014).

    Respond STRICTLY in this JSON format:
    {
      "approved": boolean,
      "feedback": "Your honest marketing rationale",
      "newTopic": "The revised highly-native single-sentence topic hook based on their instruction",
      "epiphany": "A 1-sentence deduction about the brand's creative DNA based on their edit (optional, only if profound)"
    }
  `

  try {
    const res = await withRetry(() => askExpertAgent(prompt, false, '')) // Boss Review (Stage 2) enabled (maxDuration is 300s)
    if (!res.success || !res.data) throw new Error("Chat failed")
    
    // Clean potential markdown blocks
    let cleanStr = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    const firstBrace = cleanStr.indexOf('{')
    const lastBrace = cleanStr.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanStr = cleanStr.substring(firstBrace, lastBrace + 1)
    }
    const parsed = requireParseJSON(cleanStr) as SparringResponse
    
    return { success: true, data: parsed }
  } catch (error: any) {
    return { success: false, error: "Sparring Matrix failed to evaluate directive." }
  }
}
