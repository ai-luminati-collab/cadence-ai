'use server'
export const maxDuration = 60;

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
    const res = await askExpertAgent(prompt, true, '') // Fast mode + skip KB
    if (!res.success) throw new Error("Clarify agent failed.")

    let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    return { success: true, questions: JSON.parse(resultText) }
  } catch (error: any) {
    console.error("Clarifying Questions Failed:", error)
    return { success: false, error: error.message || "Failed to generate questions" }
  }
}
