'use server'

/**
 * Reasons Graph — Law 1: everything the brain thinks is a belief with reasons.
 *
 * A belief carries evidence (what supports it), dependencies (other beliefs it
 * rests on), scope, a confidence and a full version history. Changing a belief
 * flags everything built on it for re-checking (the forward half of Law 3),
 * through the mark_belief_dependents() database function.
 *
 * Permissions are enforced by row-level security: writing lessons, facts and
 * rules needs the "edit the brain" switch; anyone may hold preferences about
 * themselves; read-only members can only read.
 */

import { requireUser, AuthError } from '@/lib/auth/session'
import type { KnowledgeRule } from '@/lib/brand-os-evolution'

export type BeliefKind = 'fact' | 'lesson' | 'audience_trait' | 'user_preference' | 'plan_rationale' | 'rule' | 'constitution'
export type Polarity = 'do' | 'avoid' | 'neutral'
export type BeliefStatus = 'proposed' | 'active' | 'retired'
export type BeliefOrigin = 'user' | 'ai' | 'blanc' | 'edit_pattern' | 'research' | 'migration' | 'results'
export type EvidenceSource = 'episode' | 'post' | 'reaction' | 'conversation' | 'upload' | 'research' | 'edit' | 'result' | 'user'
export type LinkedEntity = 'post' | 'plan' | 'calendar' | 'campaign' | 'strategy'

export interface Belief {
  id: string
  brandId: string
  kind: BeliefKind
  polarity: Polarity
  statement: string
  scope: Record<string, unknown>
  confidence: number
  status: BeliefStatus
  needsReview: boolean
  reviewReason: string | null
  subjectUserId: string | null
  origin: BeliefOrigin
  version: number
  validFrom: string
  validTo: string | null
  createdAt: string
  updatedAt: string
}

export interface BeliefInput {
  kind: BeliefKind
  statement: string
  polarity?: Polarity
  scope?: Record<string, unknown>
  confidence?: number
  status?: BeliefStatus
  origin?: BeliefOrigin
  originKey?: string
  /** For user_preference: who the preference is about (defaults to the caller). */
  subjectUserId?: string
  evidence?: Array<{ sourceType: EvidenceSource; sourceRef?: string; note?: string; weight?: number }>
  dependsOn?: string[]
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const fail = (e: unknown): { ok: false; error: string } => {
  if (e instanceof AuthError) return { ok: false, error: e.message }
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as any).message) : ''
  if (/row-level security|permission denied/i.test(msg)) {
    return { ok: false, error: 'You do not have permission to change the brain for this brand.' }
  }
  return { ok: false, error: msg || 'Something went wrong.' }
}

const COLUMNS = 'id, brand_id, kind, polarity, statement, scope, confidence, status, needs_review, review_reason, subject_user_id, origin, current_version, valid_from, valid_to, created_at, updated_at'

function toBelief(r: any): Belief {
  return {
    id: r.id, brandId: r.brand_id, kind: r.kind, polarity: r.polarity, statement: r.statement,
    scope: r.scope ?? {}, confidence: r.confidence, status: r.status, needsReview: r.needs_review,
    reviewReason: r.review_reason, subjectUserId: r.subject_user_id, origin: r.origin,
    version: r.current_version, validFrom: r.valid_from, validTo: r.valid_to,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function clampConfidence(c: number | undefined) {
  if (c === undefined || Number.isNaN(c)) return 0.5
  return Math.min(1, Math.max(0, c))
}

// ─── Reading ────────────────────────────────────────────────────────

export async function listBeliefs(
  brandId: string,
  filter: { status?: BeliefStatus | 'all'; kind?: BeliefKind; needsReview?: boolean; currentOnly?: boolean } = {}
): Promise<Result<Belief[]>> {
  try {
    const { supabase } = await requireUser()
    let q = supabase.from('beliefs').select(COLUMNS).eq('brand_id', brandId)
    if (!filter.status) q = q.eq('status', 'active')
    else if (filter.status !== 'all') q = q.eq('status', filter.status)
    if (filter.kind) q = q.eq('kind', filter.kind)
    if (filter.needsReview !== undefined) q = q.eq('needs_review', filter.needsReview)
    // By default the brain reasons only over what is currently true (Law 1, two dates).
    if (filter.currentOnly !== false) q = q.or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`)
    const { data, error } = await q.order('kind').order('created_at')
    if (error) throw error
    return { ok: true, data: (data || []).map(toBelief) }
  } catch (e) {
    return fail(e)
  }
}

/** A belief with its full reasons: evidence, what it rests on, what rests on it, history. */
export async function getBeliefReasons(beliefId: string): Promise<Result<{
  belief: Belief
  evidence: Array<{ id: string; sourceType: EvidenceSource; sourceRef: string | null; note: string | null; weight: number; createdAt: string }>
  dependsOn: Belief[]
  dependents: Belief[]
  versions: Array<{ version: number; statement: string; polarity: Polarity; confidence: number; status: BeliefStatus; changeReason: string | null; createdAt: string }>
}>> {
  try {
    const { supabase } = await requireUser()
    const { data: b, error } = await supabase.from('beliefs').select(COLUMNS).eq('id', beliefId).single()
    if (error || !b) return { ok: false, error: 'Belief not found.' }

    const [ev, up, down, ver] = await Promise.all([
      supabase.from('belief_evidence').select('id, source_type, source_ref, note, weight, created_at').eq('belief_id', beliefId).order('created_at'),
      supabase.from('belief_dependencies').select('depends_on').eq('belief_id', beliefId),
      supabase.from('belief_dependencies').select('belief_id').eq('depends_on', beliefId),
      supabase.from('belief_versions').select('version, statement, polarity, confidence, status, change_reason, created_at').eq('belief_id', beliefId).order('version', { ascending: false }),
    ])
    const ids = [...(up.data || []).map(d => d.depends_on), ...(down.data || []).map(d => d.belief_id)]
    const { data: related } = ids.length
      ? await supabase.from('beliefs').select(COLUMNS).in('id', ids)
      : { data: [] as any[] }
    const byId = new Map((related || []).map(r => [r.id, toBelief(r)]))

    return {
      ok: true,
      data: {
        belief: toBelief(b),
        evidence: (ev.data || []).map(e => ({ id: e.id, sourceType: e.source_type, sourceRef: e.source_ref, note: e.note, weight: e.weight, createdAt: e.created_at })),
        dependsOn: (up.data || []).map(d => byId.get(d.depends_on)).filter(Boolean) as Belief[],
        dependents: (down.data || []).map(d => byId.get(d.belief_id)).filter(Boolean) as Belief[],
        versions: (ver.data || []).map(v => ({ version: v.version, statement: v.statement, polarity: v.polarity, confidence: v.confidence, status: v.status, changeReason: v.change_reason, createdAt: v.created_at })),
      },
    }
  } catch (e) {
    return fail(e)
  }
}

// ─── Writing ────────────────────────────────────────────────────────

export async function createBelief(brandId: string, input: BeliefInput): Promise<Result<Belief>> {
  try {
    const { supabase, user } = await requireUser()
    const statement = input.statement?.trim()
    if (!statement) return { ok: false, error: 'A belief needs a statement.' }

    const row = {
      brand_id: brandId,
      kind: input.kind,
      polarity: input.polarity ?? 'neutral',
      statement,
      scope: input.scope ?? {},
      confidence: clampConfidence(input.confidence),
      status: input.status ?? 'active',
      origin: input.origin ?? 'user',
      origin_key: input.originKey ?? null,
      subject_user_id: input.kind === 'user_preference' ? (input.subjectUserId ?? user.id) : null,
      created_by: user.id,
    }
    const { data, error } = await supabase.from('beliefs').insert(row).select(COLUMNS).single()
    if (error) throw error

    await supabase.from('belief_versions').insert({
      belief_id: data.id, version: 1, statement: data.statement, polarity: data.polarity, scope: data.scope,
      confidence: data.confidence, status: data.status, valid_from: data.valid_from, valid_to: data.valid_to,
      changed_by: user.id, change_reason: 'created',
    })
    if (input.evidence?.length) {
      await supabase.from('belief_evidence').insert(input.evidence.map(e => ({
        belief_id: data.id, source_type: e.sourceType, source_ref: e.sourceRef ?? null,
        note: e.note ?? null, weight: e.weight ?? 1, created_by: user.id,
      })))
    }
    if (input.dependsOn?.length) {
      const { error: depError } = await supabase.from('belief_dependencies')
        .insert(input.dependsOn.filter(d => d !== data.id).map(d => ({ belief_id: data.id, depends_on: d })))
      if (depError) throw depError
    }
    await logBeliefChange(supabase, brandId, user.id, data.id, 'create', `Brain learned: "${statement}"`, null, rowSnapshot(data))
    return { ok: true, data: toBelief(data) }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Change a belief. Every change is a new version. If what the belief says or
 * where it applies changes, everything resting on it is flagged for review.
 */
export async function updateBelief(
  beliefId: string,
  patch: Partial<Pick<BeliefInput, 'statement' | 'polarity' | 'scope' | 'confidence' | 'status'>> & { validTo?: string | null },
  reason: string
): Promise<Result<{ belief: Belief; flagged: number }>> {
  try {
    const { supabase, user } = await requireUser()
    const { data: cur, error: readError } = await supabase.from('beliefs').select(COLUMNS).eq('id', beliefId).single()
    if (readError || !cur) return { ok: false, error: 'Belief not found.' }

    const next = {
      statement: patch.statement?.trim() || cur.statement,
      polarity: patch.polarity ?? cur.polarity,
      scope: patch.scope ?? cur.scope,
      confidence: patch.confidence !== undefined ? clampConfidence(patch.confidence) : cur.confidence,
      status: patch.status ?? cur.status,
      valid_to: patch.validTo !== undefined ? patch.validTo : cur.valid_to,
    }
    const meaningChanged =
      next.statement !== cur.statement || next.polarity !== cur.polarity ||
      JSON.stringify(next.scope) !== JSON.stringify(cur.scope) || next.status !== cur.status || next.valid_to !== cur.valid_to
    const confidenceChanged = next.confidence !== cur.confidence
    if (!meaningChanged && !confidenceChanged) return { ok: true, data: { belief: toBelief(cur), flagged: 0 } }

    const version = cur.current_version + 1
    const { data: updated, error } = await supabase.from('beliefs')
      .update({ ...next, current_version: version, needs_review: false, review_reason: null, updated_at: new Date().toISOString() })
      .eq('id', beliefId).eq('current_version', cur.current_version)
      .select(COLUMNS)
    if (error) throw error
    if (!updated?.length) return { ok: false, error: 'This belief changed while you were editing it, or you lack permission. Reload and try again.' }

    await supabase.from('belief_versions').insert({
      belief_id: beliefId, version, statement: next.statement, polarity: next.polarity, scope: next.scope,
      confidence: next.confidence, status: next.status, valid_from: cur.valid_from, valid_to: next.valid_to,
      changed_by: user.id, change_reason: reason || null,
    })

    let flagged = 0
    if (meaningChanged) {
      const { data: n } = await supabase.rpc('mark_belief_dependents', {
        root: beliefId, reason: `"${cur.statement}" changed: ${reason || 'updated'}`,
      })
      flagged = typeof n === 'number' ? n : 0
    }
    await logBeliefChange(supabase, cur.brand_id, user.id, beliefId, 'update',
      `Brain updated: "${next.statement}"${reason ? ` (${reason})` : ''}${flagged ? `; ${flagged} dependent belief(s) flagged for review` : ''}`,
      rowSnapshot(cur), rowSnapshot({ ...cur, ...next, current_version: version }))
    return { ok: true, data: { belief: toBelief(updated[0]), flagged } }
  } catch (e) {
    return fail(e)
  }
}

/** Mark a fact as no longer true from now, keeping its history (two-date model). */
export async function endBelief(beliefId: string, reason: string) {
  return updateBelief(beliefId, { validTo: new Date().toISOString() }, reason || 'no longer true')
}

/** Restore an earlier version (as a new version, so history is never lost). */
export async function revertBelief(beliefId: string, toVersion: number): Promise<Result<{ belief: Belief; flagged: number }>> {
  try {
    const { supabase } = await requireUser()
    const { data: v, error } = await supabase.from('belief_versions')
      .select('statement, polarity, scope, confidence, status, valid_to')
      .eq('belief_id', beliefId).eq('version', toVersion).single()
    if (error || !v) return { ok: false, error: 'That version does not exist.' }
    return updateBelief(beliefId, {
      statement: v.statement, polarity: v.polarity, scope: v.scope, confidence: v.confidence, status: v.status, validTo: v.valid_to,
    }, `restored version ${toVersion}`)
  } catch (e) {
    return fail(e)
  }
}

/** After re-checking a flagged belief, clear the flag (optionally updating it first). */
export async function resolveReview(beliefId: string, note?: string): Promise<Result<null>> {
  try {
    const { supabase, user } = await requireUser()
    const { data, error } = await supabase.from('beliefs')
      .update({ needs_review: false, review_reason: null, updated_at: new Date().toISOString() })
      .eq('id', beliefId).select('brand_id, statement')
    if (error) throw error
    if (!data?.length) return { ok: false, error: 'You do not have permission to change the brain for this brand.' }
    await logBeliefChange(supabase, data[0].brand_id, user.id, beliefId, 'update',
      `Re-checked and kept: "${data[0].statement}"${note ? ` (${note})` : ''}`, null, null, false)
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

export async function addEvidence(
  beliefId: string,
  evidence: { sourceType: EvidenceSource; sourceRef?: string; note?: string; weight?: number }
): Promise<Result<null>> {
  try {
    const { supabase, user } = await requireUser()
    const { error } = await supabase.from('belief_evidence').insert({
      belief_id: beliefId, source_type: evidence.sourceType, source_ref: evidence.sourceRef ?? null,
      note: evidence.note ?? null, weight: evidence.weight ?? 1, created_by: user.id,
    })
    if (error) throw error
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

export async function linkDependency(beliefId: string, dependsOn: string): Promise<Result<null>> {
  try {
    const { supabase } = await requireUser()
    if (beliefId === dependsOn) return { ok: false, error: 'A belief cannot rest on itself.' }
    const { error } = await supabase.from('belief_dependencies').upsert({ belief_id: beliefId, depends_on: dependsOn })
    if (error) throw error
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

/** Record that a post, plan or the strategy rests on a belief, so it is flagged if the belief changes. */
export async function linkEntity(brandId: string, entityType: LinkedEntity, entityId: string, beliefIds: string[]): Promise<Result<null>> {
  try {
    const { supabase } = await requireUser()
    if (!beliefIds.length) return { ok: true, data: null }
    const { error } = await supabase.from('belief_links').upsert(
      beliefIds.map(belief_id => ({ brand_id: brandId, entity_type: entityType, entity_id: entityId, belief_id, needs_review: false }))
    )
    if (error) throw error
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

export async function listFlaggedEntities(brandId: string): Promise<Result<Array<{ entityType: LinkedEntity; entityId: string; beliefId: string }>>> {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase.from('belief_links')
      .select('entity_type, entity_id, belief_id').eq('brand_id', brandId).eq('needs_review', true)
    if (error) throw error
    return { ok: true, data: (data || []).map(d => ({ entityType: d.entity_type, entityId: d.entity_id, beliefId: d.belief_id })) }
  } catch (e) {
    return fail(e)
  }
}

/**
 * One-time move of the two old rule lists into the Reasons Graph:
 * Blanc-mode / edit-pattern rules (aiKnowledgeBase, capped at 20 in the old
 * store) and Brand OS evolution rules (knowledgeRules, never read by prompts).
 * Safe to call repeatedly: each rule has a stable origin key.
 */
export async function importLegacyRules(
  brandId: string,
  aiKnowledgeBase: string[] = [],
  knowledgeRules: KnowledgeRule[] = []
): Promise<Result<{ imported: number }>> {
  try {
    const { supabase, user } = await requireUser()
    const rows: Record<string, unknown>[] = []
    for (const text of aiKnowledgeBase) {
      const statement = String(text || '').replace(/^RULE:\s*/i, '').trim()
      if (!statement) continue
      rows.push({
        brand_id: brandId, kind: 'rule', polarity: 'neutral', statement, confidence: 0.6, status: 'active',
        origin: 'blanc', origin_key: `kb:${hash(statement)}`, created_by: user.id,
      })
    }
    for (const r of knowledgeRules) {
      if (!r?.rule) continue
      rows.push({
        brand_id: brandId, kind: 'lesson', polarity: 'neutral', statement: r.rule.trim(),
        scope: { category: r.category, platform: r.platform ?? null, format: r.format ?? null },
        confidence: clampConfidence(r.confidence), status: 'active', origin: 'migration',
        origin_key: `kr:${r.id || hash(r.rule)}`, created_by: user.id,
      })
    }
    if (!rows.length) return { ok: true, data: { imported: 0 } }

    const { data, error } = await supabase.from('beliefs')
      .upsert(rows, { onConflict: 'brand_id,origin_key', ignoreDuplicates: true })
      .select('id, statement, polarity, scope, confidence, status, valid_from, valid_to')
    if (error) throw error
    if (data?.length) {
      await supabase.from('belief_versions').insert(data.map(d => ({
        belief_id: d.id, version: 1, statement: d.statement, polarity: d.polarity, scope: d.scope,
        confidence: d.confidence, status: d.status, valid_from: d.valid_from, valid_to: d.valid_to,
        changed_by: user.id, change_reason: 'imported from the old rule lists',
      })))
      await logBeliefChange(supabase, brandId, user.id, brandId, 'import',
        `Moved ${data.length} learned rule(s) into the brain`, null, null, false)
    }
    return { ok: true, data: { imported: data?.length ?? 0 } }
  } catch (e) {
    return fail(e)
  }
}

// ─── Internal ───────────────────────────────────────────────────────

function rowSnapshot(r: any) {
  return { statement: r.statement, polarity: r.polarity, scope: r.scope, confidence: r.confidence, status: r.status, valid_to: r.valid_to, version: r.current_version }
}

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

async function logBeliefChange(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
  brandId: string, userId: string, entityId: string,
  action: 'create' | 'update' | 'import', summary: string,
  before: unknown, after: unknown, reversible = true
) {
  const { data: brand } = await supabase.from('brands').select('workspace_id').eq('id', brandId).single()
  if (!brand) return
  const { error } = await supabase.from('change_log').insert({
    workspace_id: brand.workspace_id, brand_id: brandId, actor_user_id: userId, actor_kind: 'user',
    entity_type: 'belief', entity_id: entityId, action, summary, before, after, reversible,
  })
  if (error) console.error('Change log write failed:', error.message)
}
