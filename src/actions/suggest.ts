'use server'
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
    const res = await askExpertAgent(prompt, true, '') // Fast mode + skip KB
    if (!res.success) throw new Error("Suggest agent failed.")

    let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    return { success: true, suggestions: JSON.parse(resultText) }
  } catch (error: any) {
    console.error("Field Suggestion Failed:", error)
    return { success: false, error: error.message || "Failed to generate suggestions" }
  }
}
