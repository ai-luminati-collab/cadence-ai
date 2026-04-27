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
import { BrandInfo, ContentDraft, ToneFingerprint } from '@/stores/brand'

/**
 * Feature 6: Tone Fingerprinting
 * Analyzes all approved drafts to build a statistical "voice fingerprint".
 * This fingerprint gets injected into content generation prompts to ensure
 * consistency with the brand's established voice.
 */
export async function analyzeToneFingerprint(
  brandInfo: BrandInfo,
  drafts: Record<string, ContentDraft>
): Promise<{ success: boolean; data?: ToneFingerprint; error?: string }> {
  
  const draftEntries = Object.values(drafts)
  
  if (draftEntries.length < 3) {
    return { success: false, error: "Need at least 3 approved drafts to build a fingerprint. Generate more content first." }
  }

  // Extract all text content from drafts (captions, platform fields, hooks)
  const allTexts = draftEntries.map(d => {
    const parts = [d.caption]
    if (d.hooks) parts.push(...d.hooks)
    if (d.platformFields) parts.push(...Object.values(d.platformFields))
    return parts.filter(Boolean).join(' ')
  })

  // Client-side statistical analysis
  const stats = computeTextStats(allTexts)

  // AI analysis for the subjective parts (punchiness, top patterns)
  const sampleTexts = allTexts.slice(0, 8).map((t, i) => `Draft ${i+1}: "${t.substring(0, 200)}..."`).join('\n')
  
  const prompt = `
You are a Linguistic Fingerprint Analyst. Analyze these content drafts and extract the brand's voice DNA.

Brand: ${brandInfo.name} (${brandInfo.industry})

SAMPLE DRAFTS:
${sampleTexts}

COMPUTED STATS (from ${draftEntries.length} drafts):
- Average sentence length: ${stats.avgSentenceLength.toFixed(1)} words
- Emoji frequency: ${stats.emojiFrequency.toFixed(1)} per 100 words
- Questions per post: ${stats.questionFrequency.toFixed(1)}

Analyze and return as JSON (no markdown):
{
  "punchiness": [1-10 score. 1=long-winded corporate prose, 10=ultra-punchy one-liners],
  "hinglishRatio": [0-1 ratio. 0=pure English, 1=heavy Hinglish/code-switching],
  "topWords": ["word1", "word2", "word3", "word4", "word5"] // Most distinctive non-stop-words used across drafts,
  "voiceSummary": "A 2-sentence description of this brand's writing voice that can be injected into AI prompts for consistency"
}
`

  try {
    const res = await withRetry(() => askExpertAgent(prompt, false, '')) // Boss Review (Stage 2) enabled (maxDuration is 300s)
    if (!res.success || !res.data) throw new Error("Fingerprint analysis failed")
    
    const parsed = requireParseJSON(res.data)
    
    const fingerprint: ToneFingerprint = {
      avgSentenceLength: stats.avgSentenceLength,
      emojiFrequency: stats.emojiFrequency,
      hinglishRatio: parsed.hinglishRatio || 0,
      questionFrequency: stats.questionFrequency,
      hashtagDensity: stats.hashtagDensity,
      topWords: parsed.topWords || [],
      punchiness: parsed.punchiness || 5,
      analyzedAt: new Date().toISOString(),
      sampleSize: draftEntries.length
    }

    return { success: true, data: fingerprint }
  } catch (error: any) {
    return { success: false, error: sanitizeActionError(error.message) }
  }
}

function computeTextStats(texts: string[]) {
  let totalSentences = 0
  let totalWords = 0
  let totalEmojis = 0
  let totalQuestions = 0
  let totalHashtags = 0

  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu

  for (const text of texts) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    const words = text.split(/\s+/).filter(w => w.length > 0)
    const emojis = text.match(emojiRegex) || []
    const questions = (text.match(/\?/g) || []).length
    const hashtags = (text.match(/#\w+/g) || []).length

    totalSentences += sentences.length
    totalWords += words.length
    totalEmojis += emojis.length
    totalQuestions += questions
    totalHashtags += hashtags
  }

  const postCount = texts.length || 1

  return {
    avgSentenceLength: totalSentences > 0 ? totalWords / totalSentences : 0,
    emojiFrequency: totalWords > 0 ? (totalEmojis / totalWords) * 100 : 0,
    questionFrequency: totalQuestions / postCount,
    hashtagDensity: totalHashtags / postCount
  }
}
