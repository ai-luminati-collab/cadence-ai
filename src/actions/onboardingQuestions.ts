'use server'

/**
 * Dynamic Onboarding Questions — powered by Claude Opus 4.8 directly.
 *
 * After the initial brand research completes, this action asks Anthropic's
 * strongest reasoning Opus model to rewrite the onboarding questions and
 * answer options so they are hyper-specific to THIS brand, instead of the
 * generic static lists. Called only once per onboarding, so the premium
 * model cost is contained.
 *
 * This deliberately bypasses the GPT worker/orchestrator pipeline: it is a
 * single high-stakes reasoning call, exactly what the CEO-model is for.
 */

import Anthropic from '@anthropic-ai/sdk'
import { withRetry } from '@/lib/ai-resilience'
import { BrandResearch } from './research'

// Swap to 'claude-fable-5' for Anthropic's most capable (pricier) tier.
const QUESTIONS_MODEL = 'claude-opus-4-8'

// These MUST stay in sync with the canonical lists in onboarding/page.tsx —
// platform names map to knowledge files and frequency strings map to the
// calendar engine, so the model picks from them rather than inventing.
const CANONICAL_PLATFORMS = [
  'Meta (Instagram & Facebook)', 'LinkedIn', 'X (Twitter)', 'TikTok', 'YouTube',
] as const
const CANONICAL_FREQUENCIES = ['Daily', '5x per week', '3x per week', '2x per week', 'Weekly'] as const

export interface PlatformRecommendation {
  platform: string
  rationale: string
  frequency: string
}

export interface DynamicOnboardingQuestions {
  audienceQuestion: string
  audienceOptions: string[]
  goalQuestion: string
  goalOptions: string[]
  voiceQuestion: string
  styleQuestion: string
  styleOptions: string[]
  platformQuestion: string
  platformRecommendations: PlatformRecommendation[]
}

const QUESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    audienceQuestion: {
      type: 'string',
      description: 'One conversational sentence asking the founder to confirm who they are really for, referencing something specific discovered in research.',
    },
    audienceOptions: {
      type: 'array', items: { type: 'string' },
      description: '8 audience archetypes tailored to this exact brand (5-9 words each, concrete and vivid, e.g. "Office-goers in Bandra ordering weekday lunch"). Ordered most-likely first.',
    },
    goalQuestion: { type: 'string', description: 'One sentence asking which strategic outcomes matter most, referencing the brand\'s current stage/position from research.' },
    goalOptions: {
      type: 'array', items: { type: 'string' },
      description: '6 strategic goals phrased for this brand specifically (e.g. "Turn foot traffic into a weekday lunch subscription"), ordered most-strategic first.',
    },
    voiceQuestion: { type: 'string', description: 'One sentence inviting them to pick the voice, referencing how the brand currently sounds per research.' },
    styleQuestion: { type: 'string', description: 'One sentence asking how content should be structured for their audience.' },
    styleOptions: {
      type: 'array', items: { type: 'string' },
      description: '4-5 communication style names (2-5 words each) tailored to this brand and its platforms. May refine the classics (Short & Punchy, Long-form Storytelling, Highly Data-Driven, Visual & Aesthetic-First) with brand-specific angles.',
    },
    platformQuestion: { type: 'string', description: 'One sentence framing the platform/cadence decision for this specific brand and audience.' },
    platformRecommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          platform: { type: 'string', enum: [...CANONICAL_PLATFORMS] },
          rationale: { type: 'string', description: 'One sentence: why this platform for THIS brand and audience.' },
          frequency: { type: 'string', enum: [...CANONICAL_FREQUENCIES], description: 'Recommended posting cadence on this platform for this brand.' },
        },
        required: ['platform', 'rationale', 'frequency'],
        additionalProperties: false,
      },
      description: '2-4 recommended platforms in priority order, each with rationale and cadence.',
    },
  },
  required: [
    'audienceQuestion', 'audienceOptions', 'goalQuestion', 'goalOptions',
    'voiceQuestion', 'styleQuestion', 'styleOptions', 'platformQuestion',
    'platformRecommendations',
  ],
  additionalProperties: false,
} as const

export async function generateOnboardingQuestions(
  research: BrandResearch,
  brandName: string,
  industry: string,
): Promise<{ success: boolean; data?: DynamicOnboardingQuestions; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { success: false, error: 'ANTHROPIC_API_KEY not configured' }
  }

  const dossier = JSON.stringify(
    {
      brandName: research.brandName || brandName,
      industry: research.industry || industry,
      summary: research.summary,
      audienceInsight: research.audienceInsight,
      discoveredAudiences: research.discoveredAudiences,
      discoveredGoals: research.discoveredGoals,
      uspHypothesis: research.uspHypothesis,
      psychographicTriggers: research.psychographicTriggers,
      competitorAnalysis: research.competitorAnalysis,
      industryContext: research.industryContext,
      coreProducts: research.coreProducts,
      suggestedPlatforms: research.suggestedPlatforms,
      communicationStyle: research.communicationStyle,
    },
    null,
    2,
  )

  const prompt = `You are the senior brand strategist onboarding "${research.brandName || brandName}" (${research.industry || industry}). The research phase just finished. Your job: rewrite the remaining onboarding questions and their answer options so every word is about THIS brand — no generic marketing labels.

RESEARCH DOSSIER:
${dossier}

Rules:
- Every option must be concrete enough that the founder thinks "they actually get my business".
- Audience archetypes: real segments this brand plausibly serves (draw from the dossier, expand beyond it where research implies more), not census categories.
- Goals: outcomes tied to their stage, products, and competitive position.
- Style options: how content should be built for their audience and platforms.
- Platform recommendations: pick only platforms that genuinely fit; rationale must reference the brand or its audience, and cadence must be realistic for a team of their likely size.
- Questions are single friendly sentences a strategist would ask, each referencing something specific from the research.`

  try {
    const result = await withRetry(async () => {
      const client = new Anthropic()
      const response = await client.messages.create({
        model: QUESTIONS_MODEL,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'high',
          format: { type: 'json_schema', schema: QUESTIONS_SCHEMA },
        },
        messages: [{ role: 'user', content: prompt }],
      } as any)

      if ((response as any).stop_reason === 'refusal') {
        throw new Error('Model declined the request')
      }
      const textBlock = (response as any).content?.find((b: any) => b.type === 'text')
      if (!textBlock?.text) throw new Error('Empty response from question generator')
      return JSON.parse(textBlock.text) as DynamicOnboardingQuestions
    })

    // Belt and braces: drop any recommendation whose platform/frequency
    // slipped outside the canonical lists (schema enum should prevent this).
    result.platformRecommendations = (result.platformRecommendations || []).filter(
      r =>
        (CANONICAL_PLATFORMS as readonly string[]).includes(r.platform) &&
        (CANONICAL_FREQUENCIES as readonly string[]).includes(r.frequency),
    )

    return { success: true, data: result }
  } catch (error: any) {
    console.error('Dynamic question generation failed:', error?.message)
    // Non-fatal by design — the onboarding page falls back to static options.
    return { success: false, error: 'Question customization unavailable' }
  }
}
