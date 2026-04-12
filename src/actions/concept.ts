'use server'

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
    const res = await askExpertAgent(prompt, true)
    if (!res.success || !res.data) throw new Error("Failed to generate new concept")
    
    // Clean any wrapping quotes or markdown the model might add
    let cleaned = res.data.trim()
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) cleaned = cleaned.slice(1, -1)
    if (cleaned.startsWith("'") && cleaned.endsWith("'")) cleaned = cleaned.slice(1, -1)
    // Strip em dashes
    cleaned = cleaned.replace(/[—–]/g, '-').replace(/--+/g, '-')
    
    return { success: true, data: cleaned }
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to re-roll." }
  }
}

export interface SparringResponse {
  approved: boolean
  feedback: string
  newTopic: string
  epiphany?: string
}

export async function chatWithConcept(brandData: BrandData, post: CalendarPost, userPrompt: string): Promise<{ success: boolean; data?: SparringResponse; error?: string }> {
  const prompt = `
    You are an elite, $20k/month Social Media Director paired with a client.
    The current content concept slated for ${post.platform} is:
    Pillar: ${post.pillar}
    Topic/Hook: "${post.topic}"

    The User just gave you this directive to edit the concept:
    "${userPrompt}"

    YOUR JOB IS TO BE A CREATIVE SPARRING PARTNER. DO NOT BE A "YES-MAN".
    Evaluate their directive against the reality of algorithms on ${post.platform}.
    
    1. If their idea softens the hook, sounds too corporate, or will fail algorithmically, push back. (approved: false, feedback: "We can do this, but for ${post.platform}, this hurts early retention because...")
    2. If their idea is brilliant or acceptable, accept it. (approved: true, feedback: "Great angle. Applying this.")
    3. If their idea reveals a fundamental breakthrough about how the brand should communicate, extract it as an 'epiphany' string.

    Respond STRICTLY in this JSON format:
    {
      "approved": boolean,
      "feedback": "Your honest marketing rationale",
      "newTopic": "The revised highly-native single-sentence topic hook based on their instruction",
      "epiphany": "A 1-sentence deduction about the brand's creative DNA based on their edit (optional, only if profound)"
    }
  `

  try {
    const res = await askExpertAgent(prompt)
    if (!res.success || !res.data) throw new Error("Chat failed")
    
    // Clean potential markdown blocks
    const cleanStr = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleanStr) as SparringResponse
    
    return { success: true, data: parsed }
  } catch (error: any) {
    return { success: false, error: "Sparring Matrix failed to evaluate directive." }
  }
}
