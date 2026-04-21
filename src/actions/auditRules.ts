'use server'
export const maxDuration = 60;

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
    const res = await askExpertAgent(prompt, false, '')
    if (!res.success || !res.data) throw new Error("Audit engine failed")
    
    const parsed = JSON.parse(res.data.replace(/```json/g, '').replace(/```/g, '').trim())
    return { success: true, data: parsed }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function getSeason(dateStr: string): string {
  const month = new Date(dateStr).getMonth()
  if (month >= 2 && month <= 4) return 'Spring (March-May)'
  if (month >= 5 && month <= 7) return 'Summer (June-August)'
  if (month >= 8 && month <= 10) return 'Autumn/Festival Season (September-November)'
  return 'Winter (December-February)'
}
