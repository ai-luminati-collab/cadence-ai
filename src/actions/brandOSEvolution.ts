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

import { createClient } from '@supabase/supabase-js'
import { requireParseJSON, withRetry } from '@/lib/ai-resilience'
import { askExpertAgentPremium } from '@/lib/openai-agent'
import {
  BrandOSEvent,
  BrandOSSnapshot,
  ConvergenceMetrics,
  KnowledgeRule,
  KnowledgeCategory,
  LearningPhase,
  getConfidenceGate,
  generateRuleId,
  editTypeToCategory,
} from '@/lib/brand-os-evolution'
import { BrandInfo, Strategy } from '@/stores/brand'

// ─── SUPABASE CLIENT ───────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase configuration')
  return createClient(url, key)
}

// ─── EVENT LOGGING ─────────────────────────────────────────────

/**
 * Log a Brand OS event (signal detected from user behavior).
 * Called from the client whenever a relevant action occurs.
 */
export async function logBrandOSEvent(
  event: Omit<BrandOSEvent, 'id' | 'createdAt'>
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('brand_os_events')
      .insert({
        brand_id: event.brandId,
        user_id: event.userId,
        event_type: event.eventType,
        category: event.category,
        platform: event.platform || null,
        format: event.format || null,
        signal_data: event.signalData,
        proposed_change: event.proposedChange || null,
        status: event.status,
        confidence: event.confidence,
        evidence: event.evidence,
      })
      .select('id')
      .single()

    if (error) throw error
    return { success: true, id: data?.id }
  } catch (err: any) {
    console.error('Failed to log Brand OS event:', err)
    return { success: false, error: sanitizeActionError(err.message) }
  }
}

/**
 * Log a content edit event and optionally generate a proposed change.
 * Called after edit-pattern-detector classifies an edit.
 */
export async function logContentEditSignal(
  brandId: string,
  userId: string,
  editType: string,
  platform: string,
  format: string,
  originalText: string,
  editedText: string,
  phase: LearningPhase
): Promise<{ success: boolean; proposedChange?: string; error?: string }> {
  const category = editTypeToCategory(editType)

  // Log the raw event first
  const eventResult = await logBrandOSEvent({
    brandId,
    userId,
    eventType: 'content_edit',
    category,
    platform,
    format,
    signalData: {
      editType,
      originalLength: originalText.length,
      editedLength: editedText.length,
      originalPreview: originalText.substring(0, 200),
      editedPreview: editedText.substring(0, 200),
    },
    status: 'detected',
    confidence: 0,
    evidence: [`User ${editType} on ${platform} ${format}`],
  })

  // Check if we should generate a proposal (based on pattern detection)
  // In calibration phase, generate proposals more aggressively
  if (phase === 'calibration' || Math.random() < 0.3) {
    // We'll batch-generate proposals in the daily cron job
    // to avoid making expensive AI calls on every edit
  }

  return { success: eventResult.success, error: eventResult.error }
}

/**
 * Log a generation rejection (user hit "regenerate")
 */
export async function logGenerationRejection(
  brandId: string,
  userId: string,
  platform: string,
  format: string,
  regenerationCount: number
): Promise<{ success: boolean; error?: string }> {
  return logBrandOSEvent({
    brandId,
    userId,
    eventType: 'generation_rejection',
    category: 'general',
    platform,
    format,
    signalData: { regenerationCount },
    status: 'detected',
    confidence: regenerationCount >= 3 ? 0.8 : 0.4,
    evidence: [`User regenerated ${platform} ${format} content ${regenerationCount} times`],
  })
}

/**
 * Log a strategy field edit
 */
export async function logStrategyEdit(
  brandId: string,
  userId: string,
  fieldName: string,
  originalValue: string,
  newValue: string
): Promise<{ success: boolean; error?: string }> {
  // Map strategy fields to categories
  const fieldCategoryMap: Record<string, KnowledgeCategory> = {
    targetAudience: 'audience',
    persona: 'tone',
    coreNarratives: 'narrative',
    psychographicTriggers: 'audience',
    competitorAnalysis: 'general',
    oneLineStrategy: 'narrative',
  }

  return logBrandOSEvent({
    brandId,
    userId,
    eventType: 'strategy_edit',
    category: fieldCategoryMap[fieldName] || 'general',
    signalData: {
      fieldName,
      originalPreview: originalValue.substring(0, 300),
      newPreview: newValue.substring(0, 300),
    },
    status: 'detected',
    confidence: 0.7, // strategy edits are high-signal
    evidence: [`User manually edited strategy field: ${fieldName}`],
  })
}

/**
 * Log a brand profile change (audience, products, platforms modified)
 */
export async function logProfileChange(
  brandId: string,
  userId: string,
  fieldName: string,
  changeDescription: string
): Promise<{ success: boolean; error?: string }> {
  const fieldCategoryMap: Record<string, KnowledgeCategory> = {
    primaryAudiences: 'audience',
    tone: 'tone',
    platforms: 'platform',
    coreProducts: 'product',
    communicationStyle: 'tone',
    visualDirective: 'visual',
    referenceUrls: 'visual',
  }

  return logBrandOSEvent({
    brandId,
    userId,
    eventType: 'profile_change',
    category: fieldCategoryMap[fieldName] || 'general',
    signalData: { fieldName, changeDescription },
    status: 'detected',
    confidence: 0.9, // explicit user changes are very high confidence
    evidence: [changeDescription],
  })
}

// ─── CHANGE PROPOSAL GENERATION ────────────────────────────────

/**
 * Batch-process detected events into proposed Brand OS changes.
 * Uses Claude 4.7 Opus (Tier 1 Brain) for maximum reasoning quality.
 *
 * Called by the daily cron job or after accumulating enough events.
 */
export async function generateChangeProposals(
  brandId: string,
  brandInfo: BrandInfo,
  currentRules: KnowledgeRule[],
  phase: LearningPhase
): Promise<{ success: boolean; proposals?: Array<{ eventId: string; change: string; confidence: number; category: KnowledgeCategory }>; error?: string }> {
  try {
    const supabase = getSupabase()
    const confidenceGate = getConfidenceGate(phase)

    // Get unprocessed events
    const { data: events, error } = await supabase
      .from('brand_os_events')
      .select('*')
      .eq('brand_id', brandId)
      .eq('status', 'detected')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    if (!events || events.length === 0) {
      return { success: true, proposals: [] }
    }

    // Group events by category for batch processing
    const grouped: Record<string, typeof events> = {}
    for (const event of events) {
      const key = event.category
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(event)
    }

    const prompt = `You are the Brand OS Evolution Engine for "${brandInfo.name}" (${brandInfo.industry}).

You are analyzing recent user behavior signals to propose PERMANENT knowledge base rule changes.

CURRENT BRAND OS RULES:
${currentRules.map(r => `[${r.category}${r.platform ? '/' + r.platform : ''}] ${r.rule}`).join('\n') || 'No rules yet.'}

RECENT USER BEHAVIOR SIGNALS (grouped by category):
${Object.entries(grouped).map(([cat, evts]) =>
  `\n=== ${cat.toUpperCase()} (${evts.length} signals) ===\n${
    evts.map(e => `- [${e.event_type}] ${JSON.stringify(e.signal_data).substring(0, 200)} | Evidence: ${e.evidence?.join(', ')}`).join('\n')
  }`
).join('\n')}

YOUR MISSION:
1. Analyze these signals for PATTERNS (not individual events)
2. For each pattern found, propose a specific, enforceable RULE change
3. Rate your confidence in each proposal (0.0 to 1.0)
4. Only propose changes you're at least ${(confidenceGate * 100).toFixed(0)}% confident about (current phase: ${phase})

RULES FOR PROPOSALS:
- Be SPECIFIC: "Never start Instagram captions with a question" not "Adjust tone"
- Be ACTIONABLE: The AI must be able to follow this rule mechanically
- Reference the EVIDENCE: Why are you proposing this?
- Check for CONFLICTS with existing rules

Return STRICTLY as JSON (no markdown):
{
  "proposals": [
    {
      "category": "tone|visual|audience|platform|product|format|cta|narrative|general",
      "platform": "Instagram|LinkedIn|null (if cross-platform)",
      "rule": "The specific rule to add/modify",
      "confidence": 0.0-1.0,
      "evidence": "Why — reference the specific signals",
      "conflictsWithExisting": true/false,
      "conflictDetails": "Which existing rule this conflicts with, if any"
    }
  ]
}

If no meaningful patterns are found, return: { "proposals": [] }`

    const res = await withRetry(() => askExpertAgentPremium(prompt, ''))
    if (!res.success) throw new Error('Proposal generation failed')

    const parsed = requireParseJSON(res.data)
    const proposals: Array<{ eventId: string; change: string; confidence: number; category: KnowledgeCategory }> = []

    // Update events with proposals
    for (const proposal of (parsed.proposals || [])) {
      if (proposal.confidence < confidenceGate) continue

      // Find the most relevant event for this proposal
      const relevantEvents = grouped[proposal.category] || events
      const eventId = relevantEvents[0]?.id

      if (eventId) {
        await supabase
          .from('brand_os_events')
          .update({
            status: 'pending',
            proposed_change: proposal.rule,
            confidence: proposal.confidence,
            evidence: [proposal.evidence],
          })
          .eq('id', eventId)

        proposals.push({
          eventId,
          change: proposal.rule,
          confidence: proposal.confidence,
          category: proposal.category as KnowledgeCategory,
        })
      }
    }

    // Mark remaining unmatched events as expired
    const proposedEventIds = proposals.map(p => p.eventId)
    const expireIds = events
      .filter(e => !proposedEventIds.includes(e.id))
      .map(e => e.id)

    if (expireIds.length > 0) {
      await supabase
        .from('brand_os_events')
        .update({ status: 'expired' })
        .in('id', expireIds)
    }

    return { success: true, proposals }
  } catch (err: any) {
    console.error('Change proposal generation failed:', err)
    return { success: false, error: sanitizeActionError(err.message) }
  }
}

// ─── USER REVIEW ACTIONS ───────────────────────────────────────

/**
 * Accept a proposed change — adds it to the knowledge base
 */
export async function acceptChange(
  eventId: string,
  brandId: string,
  ruleText?: string // optional override if user edited the proposal
): Promise<{ success: boolean; rule?: KnowledgeRule; error?: string }> {
  try {
    const supabase = getSupabase()

    // Get the event
    const { data: event, error } = await supabase
      .from('brand_os_events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (error || !event) throw new Error('Event not found')

    const finalRule = ruleText || event.proposed_change
    if (!finalRule) throw new Error('No rule text available')

    // Create the knowledge rule
    const rule: KnowledgeRule = {
      id: generateRuleId(),
      category: event.category as KnowledgeCategory,
      platform: event.platform || undefined,
      format: event.format || undefined,
      rule: finalRule,
      source: 'edit_pattern',
      confidence: event.confidence,
      createdAt: new Date().toISOString(),
      lastValidated: new Date().toISOString(),
      evidence: event.evidence || [],
    }

    // Mark event as accepted
    await supabase
      .from('brand_os_events')
      .update({
        status: ruleText ? 'edited' : 'accepted',
        proposed_change: finalRule,
        resolved_at: new Date().toISOString(),
        resolved_by: 'user',
      })
      .eq('id', eventId)

    return { success: true, rule }
  } catch (err: any) {
    console.error('Accept change failed:', err)
    return { success: false, error: sanitizeActionError(err.message) }
  }
}

/**
 * Reject a proposed change
 */
export async function rejectChange(
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase()

    await supabase
      .from('brand_os_events')
      .update({
        status: 'rejected',
        resolved_at: new Date().toISOString(),
        resolved_by: 'user',
      })
      .eq('id', eventId)

    return { success: true }
  } catch (err: any) {
    return { success: false, error: sanitizeActionError(err.message) }
  }
}

// ─── PENDING CHANGES QUERY ─────────────────────────────────────

/**
 * Get all pending proposed changes for a brand
 */
export async function getPendingChanges(
  brandId: string
): Promise<{ success: boolean; changes?: BrandOSEvent[]; error?: string }> {
  try {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('brand_os_events')
      .select('*')
      .eq('brand_id', brandId)
      .eq('status', 'pending')
      .order('confidence', { ascending: false })

    if (error) throw error

    const changes: BrandOSEvent[] = (data || []).map(row => ({
      id: row.id,
      brandId: row.brand_id,
      userId: row.user_id,
      eventType: row.event_type,
      category: row.category,
      platform: row.platform,
      format: row.format,
      signalData: row.signal_data,
      proposedChange: row.proposed_change,
      status: row.status,
      confidence: row.confidence,
      evidence: row.evidence || [],
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
    }))

    return { success: true, changes }
  } catch (err: any) {
    return { success: false, error: sanitizeActionError(err.message) }
  }
}

// ─── SNAPSHOT MANAGEMENT ───────────────────────────────────────

/**
 * Save a Brand OS snapshot for versioning/rollback
 */
export async function saveBrandOSSnapshot(
  snapshot: Omit<BrandOSSnapshot, 'id' | 'createdAt'>
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('brand_os_snapshots')
      .insert({
        brand_id: snapshot.brandId,
        snapshot_data: snapshot.snapshotData,
        trigger: snapshot.trigger,
        rule_count: snapshot.ruleCount,
        phase: snapshot.phase,
        convergence_score: snapshot.convergenceScore,
      })
      .select('id')
      .single()

    if (error) throw error
    return { success: true, id: data?.id }
  } catch (err: any) {
    console.error('Snapshot save failed:', err)
    return { success: false, error: sanitizeActionError(err.message) }
  }
}

/**
 * Get snapshot history for rollback UI
 */
export async function getSnapshotHistory(
  brandId: string,
  limit = 20
): Promise<{ success: boolean; snapshots?: BrandOSSnapshot[]; error?: string }> {
  try {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('brand_os_snapshots')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return {
      success: true,
      snapshots: (data || []).map(row => ({
        id: row.id,
        brandId: row.brand_id,
        snapshotData: row.snapshot_data,
        trigger: row.trigger,
        ruleCount: row.rule_count,
        phase: row.phase,
        convergenceScore: row.convergence_score,
        createdAt: row.created_at,
      }))
    }
  } catch (err: any) {
    return { success: false, error: sanitizeActionError(err.message) }
  }
}

// ─── CONVERGENCE METRICS ───────────────────────────────────────

/**
 * Save daily convergence metrics
 */
export async function saveConvergenceMetrics(
  brandId: string,
  userId: string,
  metrics: ConvergenceMetrics
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabase()

    const { error } = await supabase
      .from('convergence_metrics')
      .upsert({
        brand_id: brandId,
        user_id: userId,
        window_day: metrics.windowDay,
        measured_at: metrics.measuredAt,
        edit_rate: metrics.editRate,
        rejection_rate: metrics.rejectionRate,
        rule_churn: metrics.ruleChurn,
        tone_stability: metrics.toneStability,
        strategy_stability: metrics.strategyStability,
        composite_score: metrics.compositeScore,
        phase: metrics.phase,
        blanc_triggered: metrics.blancTriggered,
      }, {
        onConflict: 'brand_id,window_day'
      })

    if (error) throw error
    return { success: true }
  } catch (err: any) {
    console.error('Convergence metrics save failed:', err)
    return { success: false, error: sanitizeActionError(err.message) }
  }
}

/**
 * Get recent convergence metrics for a brand
 */
export async function getConvergenceHistory(
  brandId: string,
  days = 30
): Promise<{ success: boolean; metrics?: ConvergenceMetrics[]; error?: string }> {
  try {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('convergence_metrics')
      .select('*')
      .eq('brand_id', brandId)
      .order('window_day', { ascending: false })
      .limit(days)

    if (error) throw error

    return {
      success: true,
      metrics: (data || []).map(row => ({
        windowDay: row.window_day,
        measuredAt: row.measured_at,
        editRate: row.edit_rate,
        rejectionRate: row.rejection_rate,
        ruleChurn: row.rule_churn,
        toneStability: row.tone_stability,
        strategyStability: row.strategy_stability,
        compositeScore: row.composite_score,
        phase: row.phase,
        blancTriggered: row.blanc_triggered,
      }))
    }
  } catch (err: any) {
    return { success: false, error: sanitizeActionError(err.message) }
  }
}

// ─── BLANC MODE DIAGNOSTIC ────────────────────────────────────

/**
 * Trigger a Blanc Mode diagnostic conversation.
 * Uses Claude 4.7 Opus (Tier 1 Brain) for maximum reasoning.
 *
 * Called when the convergence score drops after stabilization.
 */
export async function triggerBlancDiagnostic(
  brandInfo: BrandInfo,
  strategy: Strategy | null,
  currentRules: KnowledgeRule[],
  recentMetrics: ConvergenceMetrics[],
  recentEvents: BrandOSEvent[]
): Promise<{ success: boolean; data?: { diagnosis: string; proposedActions: string[]; conversationStarters: string[] }; error?: string }> {
  try {
    const prompt = `You are Blanc — the Creative Director at Cadence AI.

You're not an LLM right now. You're a senior creative director who's been watching this brand's content for weeks and something isn't working.

BRAND: ${brandInfo.name} (${brandInfo.industry})
AUDIENCE: ${brandInfo.primaryAudiences?.join(', ')}
TONE: ${brandInfo.tone?.join(', ')}

CURRENT KNOWLEDGE BASE:
${currentRules.map(r => `[${r.category}] ${r.rule} (confidence: ${r.confidence}, source: ${r.source})`).join('\n')}

CONVERGENCE METRICS (last 7 days, newest first):
${recentMetrics.slice(0, 7).map(m =>
  `Day ${m.windowDay}: composite=${m.compositeScore.toFixed(2)} | edits=${m.editRate.toFixed(2)} | rejections=${m.rejectionRate.toFixed(2)} | rule_churn=${m.ruleChurn.toFixed(2)} | tone=${m.toneStability.toFixed(2)}`
).join('\n')}

RECENT BEHAVIOR SIGNALS (what's been happening):
${recentEvents.slice(0, 20).map(e =>
  `- [${e.eventType}/${e.category}] ${JSON.stringify(e.signalData).substring(0, 150)}`
).join('\n')}

THE PROBLEM:
The convergence score has been dropping. The AI is NOT stabilizing on this brand — the user keeps making changes, which means our understanding is wrong somewhere.

YOUR MISSION:
1. DIAGNOSE: What specific aspect of the Brand OS is wrong? Look at which sub-metrics are diverging.
2. ROOT CAUSE: Why is it wrong? Reference specific signals.
3. PROPOSE: 3-5 specific action items to fix this.
4. CONVERSATION: Write 3 opening questions you'd ask the brand owner — as Blanc, the human creative director, NOT as an AI. Be direct, specific, slightly provocative.

Return as JSON:
{
  "diagnosis": "2-3 sentence diagnosis of what's going wrong",
  "rootCause": "The specific root cause",
  "proposedActions": ["Action 1", "Action 2", "Action 3"],
  "conversationStarters": [
    "A direct question to the brand owner",
    "Another probing question",
    "A provocative question that challenges assumptions"
  ]
}`

    const res = await withRetry(() => askExpertAgentPremium(prompt, ''))
    if (!res.success) throw new Error('Blanc diagnostic failed')

    const parsed = requireParseJSON(res.data)

    return { success: true, data: parsed }
  } catch (err: any) {
    console.error('Blanc diagnostic failed:', err)
    return { success: false, error: sanitizeActionError(err.message) }
  }
}
