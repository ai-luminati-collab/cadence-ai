/**
 * Edit Pattern Detector
 *
 * Heuristic-based edit classification + pattern detection.
 * No AI calls — runs instantly on the client after every edit.
 *
 * Flow:
 * 1. User edits content → classifyEdit() tags it with an editType
 * 2. After tagging, detectPattern() checks recent edits for recurring types
 * 3. If pattern found → returns a prompt for the user
 */

export interface EditEvent {
  id: string
  postId: string
  platform: string
  format: string
  fieldName: string        // 'topic', 'caption', 'hookScript', 'copilot_instruction', etc.
  editType: EditType       // heuristic classification
  originalText: string
  editedText: string
  timestamp: string        // ISO
  similarity: number       // 0-1 (word overlap ratio)
}

export type EditType =
  | 'removed_opening_question'
  | 'shortened_text'
  | 'lengthened_text'
  | 'removed_emojis'
  | 'added_emojis'
  | 'removed_exclamations'
  | 'removed_hashtags'
  | 'tone_shift'
  | 'removed_ai_smog'
  | 'added_specificity'
  | 'restructured'
  | 'cta_changed'
  | 'copilot_instruction'   // from chat copilot — the instruction itself is the signal
  | 'unclassified'

export interface DetectedPattern {
  editType: EditType
  platform: string
  format: string | null        // null = cross-format pattern
  fieldName: string | null     // null = cross-field pattern
  occurrences: number
  totalEditsInScope: number
  ratio: number                // occurrences / totalEditsInScope
  suggestedRule: string        // human-readable rule suggestion
  evidence: string[]           // sample edit descriptions
}

// ─── HEURISTIC CLASSIFIERS ───

function wordOverlap(a: string, b: string): number {
  const set1 = new Set(a.toLowerCase().split(/\s+/).filter(Boolean))
  const set2 = new Set(b.toLowerCase().split(/\s+/).filter(Boolean))
  if (set1.size === 0 && set2.size === 0) return 1
  const intersection = [...set1].filter(w => set2.has(w)).length
  const union = new Set([...set1, ...set2]).size
  return union === 0 ? 1 : intersection / union
}

function countEmojis(text: string): number {
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu
  return (text.match(emojiRegex) || []).length
}

const AI_SMOG_WORDS = [
  'elevate', 'unlock', 'supercharge', 'transform', 'revolutionary',
  'game-changer', 'dive-in', 'journey', 'delight', 'experience',
  'seamless', 'empower', 'leverage', 'synergy', 'curate',
  'paradigm', 'disrupt', 'innovative', 'cutting-edge', 'next-level'
]

function countSmogWords(text: string): number {
  const lower = text.toLowerCase()
  return AI_SMOG_WORDS.filter(w => lower.includes(w)).length
}

/**
 * Classify an edit using fast heuristics. No AI call needed for 80% of cases.
 */
export function classifyEdit(original: string, edited: string, fieldName: string): EditType {
  const origLen = original.trim().length
  const editLen = edited.trim().length
  const origWords = original.trim().split(/\s+/).length
  const editWords = edited.trim().split(/\s+/).length

  // 1. Removed opening question
  const origStartsWithQ = /^(do|does|are|is|have|has|can|could|would|will|what|why|how|who|where|when|ever|did)\b/i.test(original.trim())
  const origHasEarlyQ = original.trim().slice(0, 80).includes('?')
  const editHasEarlyQ = edited.trim().slice(0, 80).includes('?')
  if (origStartsWithQ && origHasEarlyQ && !editHasEarlyQ) {
    return 'removed_opening_question'
  }

  // 2. Shortened significantly (>25% word reduction)
  if (editWords < origWords * 0.75 && origWords >= 5) {
    return 'shortened_text'
  }

  // 3. Lengthened significantly (>40% word increase)
  if (editWords > origWords * 1.4 && origWords >= 3) {
    return 'lengthened_text'
  }

  // 4. Emoji changes
  const origEmojis = countEmojis(original)
  const editEmojis = countEmojis(edited)
  if (origEmojis > editEmojis + 1) return 'removed_emojis'
  if (editEmojis > origEmojis + 1) return 'added_emojis'

  // 5. Exclamation mark removal
  const origBangs = (original.match(/!/g) || []).length
  const editBangs = (edited.match(/!/g) || []).length
  if (origBangs >= 2 && editBangs < origBangs - 1) return 'removed_exclamations'

  // 6. AI smog removal
  const origSmog = countSmogWords(original)
  const editSmog = countSmogWords(edited)
  if (origSmog >= 2 && editSmog < origSmog) return 'removed_ai_smog'

  // 7. Hashtag removal
  const origTags = (original.match(/#\w+/g) || []).length
  const editTags = (edited.match(/#\w+/g) || []).length
  if (origTags >= 2 && editTags < origTags - 1) return 'removed_hashtags'

  // 8. CTA changed (last sentence is different)
  const origLastLine = original.trim().split(/[.\n]/).filter(Boolean).pop()?.trim() || ''
  const editLastLine = edited.trim().split(/[.\n]/).filter(Boolean).pop()?.trim() || ''
  if (origLastLine && editLastLine && wordOverlap(origLastLine, editLastLine) < 0.3) {
    return 'cta_changed'
  }

  // 9. Low word overlap = major restructure
  const overlap = wordOverlap(original, edited)
  if (overlap < 0.4) return 'restructured'

  return 'unclassified'
}

/**
 * Classify a copilot chat instruction into an edit type.
 * The instruction itself IS the signal (e.g., "make it shorter", "remove the question").
 */
export function classifyCopilotInstruction(instruction: string): EditType {
  const lower = instruction.toLowerCase()

  if (/\b(short|shorter|brief|concise|punchy|trim|cut|less words)\b/.test(lower)) return 'shortened_text'
  if (/\b(long|longer|expand|elaborate|more detail|add more)\b/.test(lower)) return 'lengthened_text'
  if (/\b(remove|no|drop|kill|delete).{0,15}(question|asking|\?)/i.test(lower)) return 'removed_opening_question'
  if (/\b(remove|no|drop|kill|delete).{0,15}(emoji|emojis|smiley)/i.test(lower)) return 'removed_emojis'
  if (/\b(add|more|use).{0,15}(emoji|emojis)/i.test(lower)) return 'added_emojis'
  if (/\b(remove|no|drop).{0,15}(exclamation|!)/i.test(lower)) return 'removed_exclamations'
  if (/\b(remove|no|less).{0,15}(hashtag|tag|#)/i.test(lower)) return 'removed_hashtags'
  if (/\b(tone|voice|sound|feel).{0,15}(like|more|less)/i.test(lower)) return 'tone_shift'
  if (/\b(specific|real|actual|exact|concrete)\b/.test(lower)) return 'added_specificity'
  if (/\b(cta|call to action|ending|close|sign.?off)\b/.test(lower)) return 'cta_changed'

  return 'copilot_instruction' // generic instruction, still worth tracking
}

// ─── PATTERN DETECTION ───

const EDIT_TYPE_LABELS: Record<EditType, string> = {
  removed_opening_question: 'removing opening questions',
  shortened_text: 'shortening the text',
  lengthened_text: 'adding more detail',
  removed_emojis: 'removing emojis',
  added_emojis: 'adding emojis',
  removed_exclamations: 'removing exclamation marks',
  removed_hashtags: 'removing hashtags',
  tone_shift: 'changing the tone',
  removed_ai_smog: 'removing AI-sounding words',
  added_specificity: 'making content more specific',
  restructured: 'rewriting the structure',
  cta_changed: 'changing the call-to-action',
  copilot_instruction: 'giving a copilot instruction',
  unclassified: 'making changes',
}

function buildSuggestedRule(editType: EditType, platform: string, format: string | null, fieldName: string | null): string {
  const label = EDIT_TYPE_LABELS[editType]
  const scope = format ? `${platform} ${format}` : platform
  const field = fieldName ? ` in the ${fieldName}` : ''

  switch (editType) {
    case 'removed_opening_question':
      return `RULE: Never start ${scope} content${field} with a question. Use a bold statement or declaration instead.`
    case 'shortened_text':
      return `RULE: Keep ${scope} content${field} significantly shorter. Aim for 30-40% fewer words than default.`
    case 'lengthened_text':
      return `RULE: ${scope} content${field} needs more depth and detail. Don't be too brief.`
    case 'removed_emojis':
      return `RULE: Do not use emojis in ${scope} content${field}. Keep it clean and text-only.`
    case 'added_emojis':
      return `RULE: Use emojis liberally in ${scope} content${field}. They're part of the brand voice.`
    case 'removed_exclamations':
      return `RULE: Avoid exclamation marks in ${scope} content. Use periods for a calmer, more confident tone.`
    case 'removed_ai_smog':
      return `RULE: Never use generic marketing buzzwords in ${scope} content. Use specific, human, gritty language only.`
    case 'removed_hashtags':
      return `RULE: Use fewer hashtags (max 2-3) in ${scope} content, or skip them entirely.`
    case 'cta_changed':
      return `RULE: The default CTA style for ${scope} is not working. Match the brand's actual CTA voice.`
    case 'added_specificity':
      return `RULE: ${scope} content must reference specific products, details, or scenarios — never stay generic.`
    default:
      return `RULE: Adjust ${scope} content generation based on repeated user corrections to ${label}.`
  }
}

/**
 * Detect patterns in recent edit events.
 *
 * Rules:
 * - pattern_ratio >= 25% AND sample_size >= 3 (early prompt at 3, strong at 5+)
 * - Groups by platform, then checks within format and cross-format
 * - Returns the strongest pattern found, or null
 */
export function detectPattern(
  editEvents: EditEvent[],
  currentPlatform?: string
): DetectedPattern | null {
  if (editEvents.length < 3) return null

  // Only look at last 30 days of edits
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const recentEdits = editEvents.filter(e => e.timestamp >= cutoff && e.editType !== 'unclassified')

  if (recentEdits.length < 3) return null

  // Group by: editType + platform
  const groups = new Map<string, EditEvent[]>()
  for (const edit of recentEdits) {
    const key = `${edit.editType}::${edit.platform}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(edit)
  }

  // Find the strongest pattern
  let bestPattern: DetectedPattern | null = null
  let bestScore = 0

  for (const [key, edits] of groups.entries()) {
    const [editType, platform] = key.split('::') as [EditType, string]

    // If we have a current platform focus, prioritize it
    if (currentPlatform && platform !== currentPlatform) continue

    // Count total edits for this platform to calculate ratio
    const platformEdits = recentEdits.filter(e => e.platform === platform)
    const ratio = edits.length / platformEdits.length

    // Must have at least 3 occurrences AND 25% ratio
    if (edits.length < 3 || ratio < 0.25) continue

    // Check if pattern is format-specific or cross-format
    const formats = new Set(edits.map(e => e.format))
    const format = formats.size === 1 ? edits[0].format : null

    // Check if pattern is field-specific
    const fields = new Set(edits.map(e => e.fieldName))
    const fieldName = fields.size === 1 ? edits[0].fieldName : null

    // Score: occurrences * ratio (higher = more confident)
    const score = edits.length * ratio
    if (score > bestScore) {
      bestScore = score
      bestPattern = {
        editType: editType,
        platform,
        format,
        fieldName,
        occurrences: edits.length,
        totalEditsInScope: platformEdits.length,
        ratio,
        suggestedRule: buildSuggestedRule(editType, platform, format, fieldName),
        evidence: edits.slice(-3).map(e =>
          `${e.fieldName}: "${e.originalText.slice(0, 50)}..." → "${e.editedText.slice(0, 50)}..."`
        )
      }
    }
  }

  return bestPattern
}

/**
 * Check if a pattern has already been prompted to the user (to avoid nagging).
 * Uses a simple key based on editType + platform.
 */
export function getPatternKey(pattern: DetectedPattern): string {
  return `${pattern.editType}::${pattern.platform}::${pattern.format || 'all'}::${pattern.fieldName || 'all'}`
}
