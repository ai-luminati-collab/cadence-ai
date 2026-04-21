'use server'

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
    const res = await askExpertAgent(prompt, false, '')
    if (!res.success || !res.data) throw new Error("Fingerprint analysis failed")
    
    const parsed = JSON.parse(res.data.replace(/```json/g, '').replace(/```/g, '').trim())
    
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
    return { success: false, error: error.message }
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
