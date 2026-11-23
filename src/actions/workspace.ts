'use server'

/**
 * Workspaces, team, brand state, change log and undo.
 *
 * Every function verifies the caller (requireUser) and then acts through a
 * Supabase client bound to that user, so Postgres row-level security decides
 * what they may read or change. Nothing here uses the service-role key.
 */

import { requireUser, AuthError } from '@/lib/auth/session'
import type { BrandData } from '@/stores/brand'

export type Role = 'admin' | 'marketer' | 'client' | 'read_only'

export interface WorkspaceSummary {
  id: string
  name: string
  role: Role
  canEditBrain: boolean
  canPublish: boolean
}

export interface ServerBrand {
  id: string
  workspaceId: string
  name: string
  data: Partial<BrandData>
  version: number
}

export interface ChangeEntry {
  id: string
  brandId: string | null
  actorUserId: string | null
  actorEmail: string | null
  actorKind: 'user' | 'ai' | 'system'
  entityType: string
  entityId: string
  action: string
  summary: string | null
  changedKeys: string[] | null
  reversible: boolean
  revertedBy: string | null
  createdAt: string
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string; conflict?: boolean }

const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof AuthError ? e.message : e instanceof Error ? e.message : 'Something went wrong.',
})

// High-churn bookkeeping keys: logged as "changed" but their values aren't
// copied into the log, and undo leaves them alone.
const NOISY_KEYS = new Set(['generationEvents', 'editEvents', 'dismissedPatterns'])

const stable = (v: unknown) => JSON.stringify(v ?? null)

function diffKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...keys].filter(k => stable(before[k]) !== stable(after[k]))
}

function pick(obj: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {}
  for (const k of keys) if (!NOISY_KEYS.has(k)) out[k] = obj[k] ?? null
  return out
}

function brandName(data: Partial<BrandData>): string {
  return data?.brandInfo?.name?.trim() || 'Untitled brand'
}

// ─── Workspaces and team ────────────────────────────────────────────

/** Accept pending invites, create a first workspace if needed, list memberships. */
export async function ensureWorkspace(): Promise<Result<WorkspaceSummary[]>> {
  try {
    const { supabase, user } = await requireUser()
    await supabase.rpc('accept_my_invites')

    const load = () => supabase
      .from('workspace_members')
      .select('role, can_edit_brain, can_publish, workspaces ( id, name )')
      .eq('user_id', user.id)

    let { data, error } = await load()
    if (error) throw error

    if (!data || data.length === 0) {
      const label = (user.email?.split('@')[0] || 'My') + "'s workspace"
      const { error: createError } = await supabase.rpc('create_workspace', { ws_name: label })
      if (createError) throw createError
      ;({ data, error } = await load())
      if (error) throw error
    }

    return {
      ok: true,
      data: (data || []).map((m: any) => ({
        id: m.workspaces.id,
        name: m.workspaces.name,
        role: m.role,
        canEditBrain: m.role === 'admin' || (m.role === 'marketer' && m.can_edit_brain),
        canPublish: m.role === 'admin' || (m.role === 'marketer' && m.can_publish),
      })),
    }
  } catch (e) {
    return fail(e)
  }
}

export async function listMembers(workspaceId: string): Promise<Result<Array<{
  userId: string; email: string | null; role: Role; canEditBrain: boolean; canPublish: boolean; createdAt: string
}>>> {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('workspace_members')
      .select('user_id, email, role, can_edit_brain, can_publish, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at')
    if (error) throw error
    return {
      ok: true,
      data: (data || []).map(m => ({
        userId: m.user_id, email: m.email, role: m.role as Role,
        canEditBrain: m.can_edit_brain, canPublish: m.can_publish, createdAt: m.created_at,
      })),
    }
  } catch (e) {
    return fail(e)
  }
}

/** Admin only (enforced by RLS). The invite turns into a seat when that email signs in. */
export async function inviteMember(
  workspaceId: string,
  email: string,
  role: Role,
  switches: { canEditBrain?: boolean; canPublish?: boolean } = {}
): Promise<Result<{ id: string }>> {
  try {
    const { supabase, user } = await requireUser()
    const clean = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: 'That email address looks wrong.' }
    const { data, error } = await supabase
      .from('workspace_invites')
      .upsert({
        workspace_id: workspaceId, email: clean, role,
        can_edit_brain: !!switches.canEditBrain, can_publish: !!switches.canPublish,
        invited_by: user.id, accepted_at: null,
      }, { onConflict: 'workspace_id,email' })
      .select('id')
      .single()
    if (error) throw error
    await logChange(supabase, {
      workspace_id: workspaceId, actor_user_id: user.id, entity_type: 'invite', entity_id: data.id,
      action: 'create', summary: `Invited ${clean} as ${role}`,
    })
    return { ok: true, data: { id: data.id } }
  } catch (e) {
    return fail(e)
  }
}

/** Admin only (enforced by RLS). Change a member's role or switches. */
export async function updateMember(
  workspaceId: string,
  userId: string,
  patch: { role?: Role; canEditBrain?: boolean; canPublish?: boolean }
): Promise<Result<null>> {
  try {
    const { supabase, user } = await requireUser()
    const { data: before, error: readError } = await supabase
      .from('workspace_members').select('email, role, can_edit_brain, can_publish')
      .eq('workspace_id', workspaceId).eq('user_id', userId).single()
    if (readError) throw readError

    if (patch.role && patch.role !== 'admin' && before.role === 'admin') {
      const { count } = await supabase.from('workspace_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('role', 'admin')
      if ((count ?? 0) <= 1) return { ok: false, error: 'A workspace needs at least one admin.' }
    }

    const update: Record<string, unknown> = {}
    if (patch.role) update.role = patch.role
    if (patch.canEditBrain !== undefined) update.can_edit_brain = patch.canEditBrain
    if (patch.canPublish !== undefined) update.can_publish = patch.canPublish
    const { data: rows, error } = await supabase.from('workspace_members').update(update)
      .eq('workspace_id', workspaceId).eq('user_id', userId).select('user_id')
    if (error) throw error
    if (!rows?.length) return { ok: false, error: 'Only admins can change the team.' }

    await logChange(supabase, {
      workspace_id: workspaceId, actor_user_id: user.id, entity_type: 'member', entity_id: userId,
      action: 'update', summary: `Changed access for ${before.email ?? 'a member'}`,
      before: { role: before.role, can_edit_brain: before.can_edit_brain, can_publish: before.can_publish },
      after: update,
    })
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

export async function removeMember(workspaceId: string, userId: string): Promise<Result<null>> {
  try {
    const { supabase, user } = await requireUser()
    const { data: target } = await supabase.from('workspace_members')
      .select('email, role').eq('workspace_id', workspaceId).eq('user_id', userId).single()
    if (target?.role === 'admin') {
      const { count } = await supabase.from('workspace_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('role', 'admin')
      if ((count ?? 0) <= 1) return { ok: false, error: 'A workspace needs at least one admin.' }
    }
    const { data: rows, error } = await supabase.from('workspace_members').delete()
      .eq('workspace_id', workspaceId).eq('user_id', userId).select('user_id')
    if (error) throw error
    if (!rows?.length) return { ok: false, error: 'Only admins can change the team.' }
    await logChange(supabase, {
      workspace_id: workspaceId, actor_user_id: user.id, entity_type: 'member', entity_id: userId,
      action: 'delete', summary: `Removed ${target?.email ?? 'a member'}`, reversible: false,
    })
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

// ─── Brands and their state ─────────────────────────────────────────

/** Every non-archived brand the caller can see, with its current state. */
export async function listBrands(): Promise<Result<ServerBrand[]>> {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('brands')
      .select('id, workspace_id, name, brand_documents ( data, version )')
      .is('archived_at', null)
      .order('created_at')
    if (error) throw error
    return {
      ok: true,
      data: (data || []).map((b: any) => {
        const doc = Array.isArray(b.brand_documents) ? b.brand_documents[0] : b.brand_documents
        return { id: b.id, workspaceId: b.workspace_id, name: b.name, data: doc?.data ?? {}, version: doc?.version ?? 0 }
      }),
    }
  } catch (e) {
    return fail(e)
  }
}

/** Create a brand (or adopt one that only existed in this browser) with its initial state. */
export async function createBrandRecord(
  brandId: string,
  data: Partial<BrandData>,
  opts: { workspaceId?: string; imported?: boolean } = {}
): Promise<Result<{ version: number }>> {
  try {
    const { supabase, user } = await requireUser()
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(brandId)) return { ok: false, error: 'Invalid brand id.' }

    let workspaceId: string | undefined = opts.workspaceId
    if (!workspaceId) {
      const { data: m, error } = await supabase.from('workspace_members')
        .select('workspace_id').eq('user_id', user.id).in('role', ['admin', 'marketer'])
        .order('created_at').limit(1).single()
      if (error || !m) return { ok: false, error: 'You need edit access to a workspace to create a brand.' }
      workspaceId = m.workspace_id as string
    }
    const ws: string = workspaceId

    const { error: brandError } = await supabase.from('brands')
      .insert({ id: brandId, workspace_id: ws, name: brandName(data), created_by: user.id })
    if (brandError) {
      if (brandError.code === '23505') return { ok: false, error: 'This brand already exists.', conflict: true }
      throw brandError
    }
    const { error: docError } = await supabase.from('brand_documents')
      .insert({ brand_id: brandId, data, version: 1, updated_by: user.id })
    if (docError) throw docError

    await logChange(supabase, {
      workspace_id: ws, brand_id: brandId, actor_user_id: user.id,
      entity_type: 'brand', entity_id: brandId, action: opts.imported ? 'import' : 'create',
      summary: opts.imported ? `Moved "${brandName(data)}" from this browser to the server` : `Created "${brandName(data)}"`,
      reversible: false,
    })
    return { ok: true, data: { version: 1 } }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Save a brand's state. `baseVersion` must be the version the caller last
 * read; if someone else saved in between, nothing is written and the current
 * server copy comes back so the caller can merge.
 */
export async function saveBrandState(
  brandId: string,
  data: Partial<BrandData>,
  baseVersion: number,
  summary?: string
): Promise<Result<{ version: number; changedKeys: string[]; changeId: string | null }> & { server?: { data: Partial<BrandData>; version: number } }> {
  try {
    const { supabase, user } = await requireUser()
    const { data: current, error: readError } = await supabase
      .from('brand_documents').select('data, version, brands ( workspace_id, name )')
      .eq('brand_id', brandId).single()
    if (readError || !current) return { ok: false, error: 'Brand not found, or you do not have access.' }

    if (current.version !== baseVersion) {
      return { ok: false, error: 'Someone else changed this brand.', conflict: true,
               server: { data: current.data, version: current.version } }
    }

    const before = (current.data || {}) as Record<string, unknown>
    const after = (data || {}) as Record<string, unknown>
    const changedKeys = diffKeys(before, after)
    if (changedKeys.length === 0) return { ok: true, data: { version: current.version, changedKeys, changeId: null } }

    const nextVersion = current.version + 1
    const { data: rows, error } = await supabase.from('brand_documents')
      .update({ data: after, version: nextVersion, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('brand_id', brandId).eq('version', baseVersion)
      .select('version')
    if (error) throw error
    if (!rows?.length) {
      // Either a concurrent save won the race or the caller lacks edit rights.
      const { data: latest } = await supabase.from('brand_documents').select('data, version').eq('brand_id', brandId).single()
      if (latest && latest.version !== baseVersion) {
        return { ok: false, error: 'Someone else changed this brand.', conflict: true, server: latest }
      }
      return { ok: false, error: 'You have read-only access to this brand.' }
    }

    const ws = (current as any).brands?.workspace_id
    const newName = brandName(after as Partial<BrandData>)
    if (newName !== (current as any).brands?.name) {
      await supabase.from('brands').update({ name: newName }).eq('id', brandId)
    }
    const changeId = await logChange(supabase, {
      workspace_id: ws, brand_id: brandId, actor_user_id: user.id,
      entity_type: 'brand_document', entity_id: brandId, action: 'update',
      summary: summary || `Updated ${changedKeys.filter(k => !NOISY_KEYS.has(k)).join(', ') || 'activity history'}`,
      changed_keys: changedKeys, before: pick(before, changedKeys), after: pick(after, changedKeys),
      reversible: changedKeys.some(k => !NOISY_KEYS.has(k)),
    })
    return { ok: true, data: { version: nextVersion, changedKeys, changeId } }
  } catch (e) {
    return fail(e)
  }
}

/** Archive rather than delete, so a removed brand can be brought back. */
export async function archiveBrand(brandId: string): Promise<Result<null>> {
  try {
    const { supabase, user } = await requireUser()
    const { data: rows, error } = await supabase.from('brands')
      .update({ archived_at: new Date().toISOString() }).eq('id', brandId)
      .select('workspace_id, name')
    if (error) throw error
    if (!rows?.length) return { ok: false, error: 'You cannot archive this brand.' }
    await logChange(supabase, {
      workspace_id: rows[0].workspace_id, brand_id: brandId, actor_user_id: user.id,
      entity_type: 'brand', entity_id: brandId, action: 'delete', summary: `Archived "${rows[0].name}"`,
    })
    return { ok: true, data: null }
  } catch (e) {
    return fail(e)
  }
}

// ─── Change log and undo ────────────────────────────────────────────

export async function listChanges(brandId: string, limit = 50): Promise<Result<ChangeEntry[]>> {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('change_log')
      .select('id, workspace_id, brand_id, actor_user_id, actor_kind, entity_type, entity_id, action, summary, changed_keys, reversible, reverted_by, created_at')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200))
    if (error) throw error

    const wsIds = [...new Set((data || []).map(d => d.workspace_id))]
    const { data: members } = wsIds.length
      ? await supabase.from('workspace_members').select('user_id, email').in('workspace_id', wsIds)
      : { data: [] as { user_id: string; email: string | null }[] }
    const emailOf = new Map((members || []).map(m => [m.user_id, m.email]))

    return {
      ok: true,
      data: (data || []).map(d => ({
        id: d.id, brandId: d.brand_id, actorUserId: d.actor_user_id,
        actorEmail: d.actor_user_id ? emailOf.get(d.actor_user_id) ?? null : null,
        actorKind: d.actor_kind, entityType: d.entity_type, entityId: d.entity_id, action: d.action,
        summary: d.summary, changedKeys: d.changed_keys, reversible: d.reversible,
        revertedBy: d.reverted_by, createdAt: d.created_at,
      })),
    }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Undo one brand-state change. Each field goes back to its earlier value
 * unless someone has changed that field again since — those fields are left
 * alone and reported, so an undo never silently destroys later work.
 */
export async function revertChange(changeId: string): Promise<Result<{ version: number; restored: string[]; skipped: string[] }>> {
  try {
    const { supabase } = await requireUser()
    const { data: change, error } = await supabase.from('change_log')
      .select('id, workspace_id, brand_id, entity_type, before, after, changed_keys, reversible, reverted_by')
      .eq('id', changeId).single()
    if (error || !change) return { ok: false, error: 'Change not found.' }
    if (change.entity_type !== 'brand_document' || !change.brand_id) return { ok: false, error: 'This kind of change cannot be undone here.' }
    if (!change.reversible) return { ok: false, error: 'This change cannot be undone.' }
    if (change.reverted_by) return { ok: false, error: 'This change was already undone.' }

    const { data: current, error: readError } = await supabase.from('brand_documents')
      .select('data, version').eq('brand_id', change.brand_id).single()
    if (readError || !current) return { ok: false, error: 'Brand not found.' }

    const before = (change.before || {}) as Record<string, unknown>
    const after = (change.after || {}) as Record<string, unknown>
    const next = { ...(current.data as Record<string, unknown>) }
    const restored: string[] = []
    const skipped: string[] = []
    for (const key of Object.keys(before)) {
      if (stable(next[key]) === stable(after[key])) {
        next[key] = before[key]
        restored.push(key)
      } else {
        skipped.push(key)
      }
    }
    if (restored.length === 0) return { ok: false, error: 'Everything in this change has been edited again since, so there is nothing safe to undo.' }

    const saved = await saveBrandState(change.brand_id, next as Partial<BrandData>, current.version,
      `Undid a change (${restored.join(', ')})`)
    if (!saved.ok) return { ok: false, error: saved.error, conflict: saved.conflict }

    if (saved.data.changeId) {
      await supabase.from('change_log').update({ action: 'revert' }).eq('id', saved.data.changeId)
      await supabase.from('change_log').update({ reverted_by: saved.data.changeId }).eq('id', change.id)
    }
    return { ok: true, data: { version: saved.data.version, restored, skipped } }
  } catch (e) {
    return fail(e)
  }
}

// ─── Internal ───────────────────────────────────────────────────────

async function logChange(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
  entry: {
    workspace_id: string; brand_id?: string | null; actor_user_id: string; actor_kind?: 'user' | 'ai' | 'system'
    entity_type: string; entity_id: string; action: 'create' | 'update' | 'delete' | 'revert' | 'import'
    summary?: string; changed_keys?: string[]; before?: unknown; after?: unknown; reversible?: boolean
  }
): Promise<string | null> {
  const { data, error } = await supabase.from('change_log')
    .insert({ actor_kind: 'user', reversible: true, ...entry }).select('id').single()
  if (error) {
    console.error('Change log write failed:', error.message)
    return null
  }
  return data.id
}
