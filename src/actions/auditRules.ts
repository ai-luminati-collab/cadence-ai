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
import { BrandInfo } from '@/stores/brand'

export interface AuditResult {
  ruleIndex: number
  rule: string
  status: 'active' | 'stale' | 'needs_update' | 'redundant'
  reason: string
  suggestedUpdate?: string
}

/**
 * Feature 5: Seasonal Drift Detection
 * Every 30 days (or on-demand), audit the entire knowledge base.
 * Check each rule against current date, trends, and platform changes.
 * Flag rules that are stale, redundant, or need updating.
 */
export async function auditKnowledgeBase(
  brandInfo: BrandInfo,
  currentDate: string
): Promise<{ success: boolean; data?: AuditResult[]; error?: string }> {
  
  const rules = brandInfo.aiKnowledgeBase || []
  
  if (rules.length === 0) {
    return { success: true, data: [] }
  }

  const prompt = `
You are an AI Knowledge Base Auditor. Your job is to review a brand's learned rules and identify which ones are still relevant, which are stale/outdated, and which are redundant.

Brand: ${brandInfo.name} (${brandInfo.industry})
Current Date: ${currentDate}
Current Season: ${getSeason(currentDate)}
Target Platforms: ${brandInfo.platforms?.join(', ') || 'General'}

=== KNOWLEDGE BASE RULES TO AUDIT ===
${rules.map((r, i) => `${i}. "${r}"`).join('\n')}
=====================================

For EACH rule, assess:
1. **ACTIVE**: Still relevant and enforceable. Platform algorithms haven't changed in a way that makes this obsolete.
2. **STALE**: Was relevant but may no longer apply. Seasonal content rules from a past season, trend-based rules that are no longer trending, etc.
3. **NEEDS_UPDATE**: The core principle is right but the execution needs refreshing (e.g., "Use trending audio X" — X is no longer trending).
4. **REDUNDANT**: This rule overlaps with another rule. Recommend merging.

Return as JSON array (no markdown):
[
  {
    "ruleIndex": 0,
    "rule": "the full rule text",
    "status": "active|stale|needs_update|redundant",
    "reason": "Why this status",
    "suggestedUpdate": "If needs_update, the new version of the rule. Otherwise null."
  }
]
`

  try {
    const res = await withRetry(() => askExpertAgent(prompt, false, '')) // Boss Review (Stage 2) enabled (maxDuration is 300s)
    if (!res.success || !res.data) throw new Error("Audit engine failed")
    
    const parsed = requireParseJSON(res.data)
    return { success: true, data: parsed }
  } catch (error: any) {
    return { success: false, error: sanitizeActionError(error.message) }
  }
}

function getSeason(dateStr: string): string {
  const month = new Date(dateStr).getMonth()
  if (month >= 2 && month <= 4) return 'Spring (March-May)'
  if (month >= 5 && month <= 7) return 'Summer (June-August)'
  if (month >= 8 && month <= 10) return 'Autumn/Festival Season (September-November)'
  return 'Winter (December-February)'
}
