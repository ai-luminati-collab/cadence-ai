'use server'

import { askExpertAgent } from '@/lib/openai-agent'
import { ContentDraft } from '@/stores/brand'

export async function chatWithCopyCopilot(
  existingDraft: ContentDraft,
  userInstruction: string,
  postContext: string
): Promise<{ success: boolean; data?: ContentDraft; error?: string }> {
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing valid OPENAI_API_KEY in environment variables.")
  }

  const prompt = `You are a world-class Social Media Copywriter and Strategist.
A Creative Director (the user) is giving you feedback to iterate on a specific post draft.

--- Context of the Post ---
${postContext}

--- Current Draft ---
Hooks:
${existingDraft.hooks.map(h => `- ${h}`).join('\n')}

Caption:
${existingDraft.caption}

Visual Description:
${existingDraft.visualDescription}

Hashtags:
${existingDraft.hashtags}
-------------------

--- Creative Director's Feedback ---
"${userInstruction}"

--- TASK ---
Surgically edit the current draft to incorporate the Creative Director's feedback perfectly. Do not change aspects of the post that they did not ask you to change (e.g. if they just asked to change the hook, DO NOT rewrite the caption).
If they asked for translations, translations changes apply to the Hooks and Caption heavily.

Output your response EXACTLY as a JSON object matching this structure (no markdown wrappers):
{
  "hooks": ["Hook option 1", "Hook option 2", "Hook option 3"],
  "caption": "The main caption text",
  "visualDescription": "The visual/creative direction",
  "hashtags": "#hashtag1 #hashtag2"
}
`

  try {
    const res = await askExpertAgent(prompt, true) // skipReview for speed
    if (!res.success) throw new Error("Agent failed execution.")

    let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    const data = JSON.parse(resultText) as ContentDraft
    return { success: true, data }
  } catch (error: any) {
    console.error("AI Chat Generation Failed:", error)
    return { success: false, error: error.message || "Failed to update draft via Chat" }
  }
}
