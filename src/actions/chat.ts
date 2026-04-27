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
    const res = await withRetry(() => askExpertAgent(prompt, true, '')) // skipReview + skip KB
    if (!res.success) throw new Error("Agent failed execution.")

    let resultText = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    const data = requireParseJSON(resultText) as ContentDraft
    return { success: true, data }
  } catch (error: any) {
    console.error("AI Chat Generation Failed:", error)
    return { success: false, error: sanitizeActionError(error.message) || "Failed to update draft via Chat" }
  }
}
