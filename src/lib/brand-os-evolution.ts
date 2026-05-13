/**
 * Brand OS Evolution Engine
 *
 * The self-learning system that makes the Brand OS smarter over time.
 * Monitors 7 signal categories, detects patterns, proposes changes,
 * and tracks convergence toward a stable Brand OS.
 *
 * Model: Claude 4.7 Opus (Tier 1 — Brain)
 *
 * Three adaptive phases:
 *   1. Calibration (Days 1-7) — high learning rate, every signal matters
 *   2. Active Learning (Day 8 → convergence) — medium rate, >60% confidence only
 *   3. Stabilized (composite > 0.85 for 5 days, min 14 days) — low rate, >85% only
 */

// ─── TYPES ─────────────────────────────────────────────────────

export type EventType =
  | 'content_edit'
  | 'generation_rejection'
  | 'strategy_edit'
  | 'copilot_instruction'
  | 'profile_change'
  | 'visual_drift'
  | 'tone_drift'

export type KnowledgeCategory =
  | 'tone'
  | 'visual'
  | 'audience'
  | 'platform'
  | 'product'
  | 'format'
  | 'cta'
  | 'narrative'
  | 'general'

export type EventStatus =
  | 'detected'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'edited'
  | 'auto_applied'
  | 'expired'

export type LearningPhase = 'calibration' | 'active_learning' | 'stabilized'

export interface KnowledgeRule {
  id: string
  category: KnowledgeCategory
  platform?: string       // null = cross-platform
  format?: string         // null = cross-format
  rule: string
  source: 'onboarding' | 'edit_pattern' | 'blanc_mode' | 'manual' | 'audit' | 'research'
  confidence: number      // 0.0 to 1.0
  createdAt: string       // ISO date
  lastValidated: string   // ISO date
  evidence: string[]      // what signals led to this rule
}

export interface BrandOSEvent {
  id?: string
  brandId: string
  userId?: string
  eventType: EventType
  category: KnowledgeCategory
  platform?: string
  format?: string
  signalData: Record<string, any>
  proposedChange?: string
  status: EventStatus
  confidence: number
  evidence: string[]
  createdAt?: string
  resolvedAt?: string
  resolvedBy?: 'user' | 'auto' | 'blanc'
}

export interface ConvergenceMetrics {
  windowDay: number
  measuredAt: string
  editRate: number          // 0-1, higher = more stable
  rejectionRate: number     // 0-1
  ruleChurn: number         // 0-1
  toneStability: number     // 0-1
  strategyStability: number // 0-1
  compositeScore: number    // weighted average
  phase: LearningPhase
  blancTriggered: boolean
}

export interface BrandOSSnapshot {
  id?: string
  brandId: string
  snapshotData: Record<string, any>
  trigger: 'onboarding' | 'manual_save' | 'rule_batch' | 'daily_auto' | 'blanc_diagnostic' | 'rollback'
  ruleCount: number
  phase: LearningPhase
  convergenceScore: number
  createdAt?: string
}

// ─── CONVERGENCE CALCULATION ───────────────────────────────────

const WEIGHTS = {
  editRate: 0.30,
  rejectionRate: 0.25,
  ruleChurn: 0.20,
  toneStability: 0.15,
  strategyStability: 0.10,
} as const

/** Convergence thresholds */
export const CONVERGENCE = {
  STABILIZED_THRESHOLD: 0.85,       // composite > this for 5 consecutive days = stabilized
  STABILIZED_STREAK_DAYS: 5,        // consecutive days above threshold needed
  MINIMUM_LEARNING_DAYS: 14,        // won't declare stabilized before this
  CALIBRATION_DAYS: 7,              // first N days are always calibration
  DIVERGENCE_THRESHOLD: 0.65,       // composite drops below this after stabilization → divergence
  DIVERGENCE_STREAK_DAYS: 3,        // consecutive days below threshold → trigger Blanc

  // Confidence gates per phase
  CALIBRATION_MIN_CONFIDENCE: 0.0,  // everything gets through
  ACTIVE_LEARNING_MIN_CONFIDENCE: 0.6,
  STABILIZED_MIN_CONFIDENCE: 0.85,
} as const

export function computeCompositeScore(metrics: Omit<ConvergenceMetrics, 'compositeScore' | 'phase' | 'blancTriggered' | 'windowDay' | 'measuredAt'>): number {
  return (
    metrics.editRate * WEIGHTS.editRate +
    metrics.rejectionRate * WEIGHTS.rejectionRate +
    metrics.ruleChurn * WEIGHTS.ruleChurn +
    metrics.toneStability * WEIGHTS.toneStability +
    metrics.strategyStability * WEIGHTS.strategyStability
  )
}

export function determinePhase(
  windowDay: number,
  compositeScore: number,
  recentScores: number[] // last N days of composite scores (newest first)
): LearningPhase {
  // Days 1-7 are always calibration
  if (windowDay <= CONVERGENCE.CALIBRATION_DAYS) return 'calibration'

  // Need minimum learning days before stabilization
  if (windowDay < CONVERGENCE.MINIMUM_LEARNING_DAYS) return 'active_learning'

  // Check if we've been above threshold for enough consecutive days
  const streakDays = CONVERGENCE.STABILIZED_STREAK_DAYS
  if (recentScores.length >= streakDays) {
    const lastN = recentScores.slice(0, streakDays)
    const allAboveThreshold = lastN.every(s => s >= CONVERGENCE.STABILIZED_THRESHOLD)
    if (allAboveThreshold) return 'stabilized'
  }

  return 'active_learning'
}

export function shouldTriggerBlanc(
  currentPhase: LearningPhase,
  recentScores: number[] // last N days (newest first)
): boolean {
  // Only trigger after we've been stabilized and then diverged
  if (currentPhase !== 'stabilized') return false

  const streakDays = CONVERGENCE.DIVERGENCE_STREAK_DAYS
  if (recentScores.length < streakDays) return false

  const lastN = recentScores.slice(0, streakDays)
  return lastN.every(s => s < CONVERGENCE.DIVERGENCE_THRESHOLD)
}

export function getConfidenceGate(phase: LearningPhase): number {
  switch (phase) {
    case 'calibration': return CONVERGENCE.CALIBRATION_MIN_CONFIDENCE
    case 'active_learning': return CONVERGENCE.ACTIVE_LEARNING_MIN_CONFIDENCE
    case 'stabilized': return CONVERGENCE.STABILIZED_MIN_CONFIDENCE
  }
}

// ─── KNOWLEDGE RULE HELPERS ────────────────────────────────────

let _ruleIdCounter = 0
export function generateRuleId(): string {
  _ruleIdCounter++
  return `kr_${Date.now()}_${_ruleIdCounter}`
}

/**
 * Migrate flat string[] knowledge base to structured KnowledgeRule[]
 * Preserves all existing rules with sensible defaults.
 */
export function migrateFromFlatKB(flatRules: string[]): KnowledgeRule[] {
  return flatRules.map((rule, i) => ({
    id: `kr_migrated_${i}`,
    category: inferCategory(rule),
    rule,
    source: 'manual' as const,
    confidence: 1.0, // user-created rules are high confidence
    createdAt: new Date().toISOString(),
    lastValidated: new Date().toISOString(),
    evidence: ['Migrated from legacy knowledge base']
  }))
}

/** Best-effort category inference from rule text */
function inferCategory(rule: string): KnowledgeCategory {
  const lower = rule.toLowerCase()

  if (/tone|voice|casual|formal|witty|humor|playful|serious/.test(lower)) return 'tone'
  if (/visual|image|photo|color|lighting|aesthetic|design/.test(lower)) return 'visual'
  if (/audience|customer|user|demographic|psycho|target/.test(lower)) return 'audience'
  if (/instagram|linkedin|tiktok|twitter|youtube|platform|reel|carousel/.test(lower)) return 'platform'
  if (/product|menu|item|service|offering|catalog/.test(lower)) return 'product'
  if (/format|carousel|reel|static|story|thread/.test(lower)) return 'format'
  if (/cta|call.to.action|click|buy|sign.up|dm|link/.test(lower)) return 'cta'
  if (/story|narrative|pillar|theme|topic/.test(lower)) return 'narrative'

  return 'general'
}

/**
 * Detect potential conflicts between a new rule and existing rules.
 * Returns conflicting rules with similarity scores.
 */
export function detectConflicts(
  newRule: KnowledgeRule,
  existingRules: KnowledgeRule[]
): Array<{ rule: KnowledgeRule; similarity: number; reason: string }> {
  const conflicts: Array<{ rule: KnowledgeRule; similarity: number; reason: string }> = []

  for (const existing of existingRules) {
    // Only check within same category + platform scope
    if (existing.category !== newRule.category) continue
    if (newRule.platform && existing.platform && newRule.platform !== existing.platform) continue

    const sim = computeRuleSimilarity(newRule.rule, existing.rule)

    if (sim > 0.7) {
      conflicts.push({
        rule: existing,
        similarity: sim,
        reason: sim > 0.9
          ? 'Nearly identical rule already exists'
          : 'Similar rule in same category — may conflict'
      })
    }
  }

  return conflicts
}

function computeRuleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3))

  if (wordsA.size === 0 && wordsB.size === 0) return 1
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  return union === 0 ? 0 : intersection / union
}

// ─── SIGNAL-TO-CATEGORY MAPPING ────────────────────────────────

/** Map edit types from edit-pattern-detector to Brand OS categories */
export function editTypeToCategory(editType: string): KnowledgeCategory {
  const map: Record<string, KnowledgeCategory> = {
    'removed_opening_question': 'tone',
    'shortened_text': 'tone',
    'lengthened_text': 'tone',
    'removed_emojis': 'tone',
    'added_emojis': 'tone',
    'removed_exclamations': 'tone',
    'removed_hashtags': 'platform',
    'tone_shift': 'tone',
    'removed_ai_smog': 'tone',
    'added_specificity': 'narrative',
    'restructured': 'format',
    'cta_changed': 'cta',
    'copilot_instruction': 'general',
  }
  return map[editType] || 'general'
}

/** Determine which event type a particular user action falls under */
export function classifySignalType(action: string): EventType {
  const map: Record<string, EventType> = {
    'edit_content': 'content_edit',
    'regenerate': 'generation_rejection',
    'edit_strategy': 'strategy_edit',
    'copilot_chat': 'copilot_instruction',
    'edit_profile': 'profile_change',
    'change_reference': 'visual_drift',
  }
  return map[action] || 'content_edit'
}
