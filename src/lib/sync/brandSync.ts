/**
 * Brand sync: the server is the source of truth for brand state; the browser's
 * IndexedDB copy is only a cache for when the server can't be reached.
 *
 *  - On load: accept invites / create a first workspace, fetch every brand the
 *    user can see, and move any brand that so far lived only in this browser
 *    up to the server (once), including its old rule lists → the brain.
 *  - On change: debounce, then save each changed brand with optimistic
 *    concurrency. If a teammate saved in between, merge field by field
 *    (their fields + our changed fields) and save again.
 *  - Removed brands are archived, never hard-deleted.
 *
 * Sync only switches on after a successful load, so an empty store during
 * start-up can never archive real brands.
 */

import { ensureWorkspace, listBrands, createBrandRecord, saveBrandState, archiveBrand } from '@/actions/workspace'
import { importLegacyRules } from '@/actions/beliefs'
import type { BrandData } from '@/stores/brand'

type BrandMap = Record<string, BrandData>
interface SyncedCopy { version: number; json: string; data: BrandData }

const synced = new Map<string, SyncedCopy>()
let enabled = false
let timer: ReturnType<typeof setTimeout> | null = null
let latest: BrandMap | null = null
let saving: Promise<void> | null = null
let applyRemote: ((id: string, data: BrandData) => void) | null = null

const SAVE_DELAY_MS = 1500
const stable = (v: unknown) => JSON.stringify(v ?? null)

/** The store registers how to apply a merged copy that came back from the server. */
export function onRemoteBrand(fn: (id: string, data: BrandData) => void) {
  applyRemote = fn
}

export function isServerSyncEnabled() {
  return enabled
}

/**
 * Load brands from the server, migrating local-only brands up.
 * Returns null when the server is unavailable (not signed in, offline,
 * migration not run yet): the caller then keeps using the local cache.
 */
export async function loadFromServer(localBrands: BrandMap): Promise<BrandMap | null> {
  try {
    const ws = await ensureWorkspace()
    if (!ws.ok || ws.data.length === 0) return null
    const listed = await listBrands()
    if (!listed.ok) return null

    const result: BrandMap = {}
    for (const b of listed.data) {
      const data = { ...(b.data as BrandData), id: b.id }
      result[b.id] = data
      synced.set(b.id, { version: b.version, json: stable(data), data })
    }

    // One-time move of brands that only exist in this browser.
    for (const [id, brand] of Object.entries(localBrands || {})) {
      if (result[id] || !brand) continue
      const created = await createBrandRecord(id, brand, { imported: true })
      if (!created.ok) continue // e.g. archived on the server, or no edit rights
      result[id] = brand
      synced.set(id, { version: created.data.version, json: stable(brand), data: brand })
      const info = brand.brandInfo
      if (info?.aiKnowledgeBase?.length || info?.knowledgeRules?.length) {
        await importLegacyRules(id, info.aiKnowledgeBase || [], info.knowledgeRules || [])
      }
    }

    enabled = true
    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void flush()
      })
    }
    return result
  } catch (e) {
    console.warn('Brand sync unavailable, using this browser’s copy:', e)
    return null
  }
}

/** Called on every store write. Debounced. */
export function scheduleSave(brands: BrandMap) {
  if (!enabled) return
  latest = brands
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flush(), SAVE_DELAY_MS)
}

async function flush(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null }
  if (saving) { await saving; if (!latest) return }
  const brands = latest
  latest = null
  if (!brands || !enabled) return
  saving = pushChanges(brands).finally(() => { saving = null })
  await saving
}

async function pushChanges(brands: BrandMap) {
  for (const [id, brand] of Object.entries(brands)) {
    if (!brand) continue
    const json = stable(brand)
    const copy = synced.get(id)
    if (!copy) {
      const created = await createBrandRecord(id, brand)
      if (created.ok) synced.set(id, { version: created.data.version, json, data: brand })
      else console.warn(`Could not create brand ${id} on the server:`, created.error)
      continue
    }
    if (copy.json === json) continue
    await saveWithMerge(id, brand, copy)
  }

  for (const id of [...synced.keys()]) {
    if (brands[id]) continue
    const res = await archiveBrand(id)
    if (res.ok) synced.delete(id)
    else console.warn(`Could not archive brand ${id}:`, res.error)
  }
}

async function saveWithMerge(id: string, local: BrandData, base: SyncedCopy, attempt = 0): Promise<void> {
  const res = await saveBrandState(id, local, base.version)
  if (res.ok) {
    synced.set(id, { version: res.data.version, json: stable(local), data: local })
    return
  }
  if (!res.conflict || !res.server || attempt >= 2) {
    console.warn(`Saving brand ${id} failed:`, res.error)
    return
  }

  // A teammate saved first. Keep their fields, re-apply only the fields we changed.
  const server = { ...(res.server.data as BrandData), id }
  const merged: Record<string, unknown> = { ...server }
  const baseData = base.data as unknown as Record<string, unknown>
  const localData = local as unknown as Record<string, unknown>
  for (const key of Object.keys(localData)) {
    if (stable(localData[key]) !== stable(baseData[key])) merged[key] = localData[key]
  }
  const mergedBrand = merged as unknown as BrandData
  const serverCopy: SyncedCopy = { version: res.server.version, json: stable(server), data: server }
  synced.set(id, serverCopy)
  applyRemote?.(id, mergedBrand)
  await saveWithMerge(id, mergedBrand, serverCopy, attempt + 1)
}
