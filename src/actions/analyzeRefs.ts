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

import { GoogleGenAI } from '@google/genai'
import { BrandAsset, VisualGuardrail } from '@/stores/brand'

/**
 * Analyzes brand reference images and extracts visual Do's and Don'ts
 * Uses Gemini Pro for multi-modal analysis
 */
export async function analyzeReferenceImages(
  references: BrandAsset[],
  brandName?: string
): Promise<{ success: boolean; data?: VisualGuardrail[]; error?: string }> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    return { success: false, error: 'Missing Google AI API key' }
  }

  if (!references || references.length === 0) {
    return { success: false, error: 'No reference images provided' }
  }

  const genAI = new GoogleGenAI({ apiKey })

  // Take up to 8 images for analysis
  const imageRefs = references
    .filter(r => r.type === 'image' || r.type === 'webp')
    .slice(0, 8)

  if (imageRefs.length === 0) {
    return { success: false, error: 'No valid image references found' }
  }

  const prompt = `You are an elite Visual Brand Strategist analyzing reference images for ${brandName || 'a brand'}.

Study these ${imageRefs.length} reference images carefully. Extract precise visual rules that define THIS brand's visual DNA.

For each rule, classify it as either a "DO" (something to replicate) or a "DONT" (something to avoid based on what's NOT present or would clash with the aesthetic).

GENERATE 8-12 RULES TOTAL. Be extremely specific and actionable. Do NOT be generic.

BAD examples (too vague):
- "Use good lighting" 
- "Make it look professional"

GOOD examples (specific):
- "Use warm golden-hour side lighting with visible shadows"
- "Keep backgrounds desaturated and blurred to isolate the subject"
- "Never use flat overhead lighting or flash photography"
- "Use asymmetric compositions with subject placed at left or right third"
- "Include natural textures like wood grain, linen, or concrete in scenes"
- "Avoid pure white backgrounds; always add warm cream or beige tint"

Respond ONLY in this exact JSON format:
{
  "guardrails": [
    { "type": "do", "rule": "Specific actionable visual rule" },
    { "type": "dont", "rule": "Specific thing to avoid and why" }
  ]
}
`

  try {
    // Build parts array with images
    const parts: any[] = [{ text: prompt }]
    
    for (const ref of imageRefs) {
      // Extract base64 data from data URL
      if (ref.url.startsWith('data:')) {
        const [header, base64Data] = ref.url.split(',')
        const mimeMatch = header.match(/data:(.*?);/)
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg'
        parts.push({
          inlineData: {
            mimeType,
            data: base64Data
          }
        })
      }
    }

    if (parts.length < 2) {
      return { success: false, error: 'Could not process reference images' }
    }

    console.log(`🔍 Analyzing ${imageRefs.length} reference images for visual guardrails...`)
    const startTime = Date.now()

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [{ role: 'user', parts }],
    })

    const text = response.text || ''
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`✅ Visual analysis complete in ${elapsed}s`)

    // Parse JSON from response
    const cleanStr = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = requireParseJSON(cleanStr)

    if (!parsed.guardrails || !Array.isArray(parsed.guardrails)) {
      throw new Error('Invalid response structure')
    }

    const guardrails: VisualGuardrail[] = parsed.guardrails.map((g: any, i: number) => ({
      id: `vg-${Date.now()}-${i}`,
      type: g.type as 'do' | 'dont',
      rule: g.rule,
      source: 'ai' as const
    }))

    return { success: true, data: guardrails }
  } catch (error: any) {
    console.error('Reference analysis failed:', error)
    return { success: false, error: sanitizeActionError(error.message) || 'Failed to analyze references' }
  }
}
