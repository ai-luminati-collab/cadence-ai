/**
 * useBrandOSSignals — Client-side hook for the Brand OS Evolution Engine
 *
 * Drop this into any component that creates signals (content edits,
 * regenerations, strategy changes, profile updates). It handles:
 *   - Logging events to the server (Supabase)
 *   - Respecting the current learning phase's confidence gate
 *   - Batching low-priority signals to avoid spamming the API
 *
 * Usage:
 *   const signals = useBrandOSSignals()
 *   signals.logContentEdit(postId, platform, format, editType, original, edited)
 *   signals.logRegeneration(platform, format, count)
 *   signals.logStrategyEdit(fieldName, oldValue, newValue)
 *   signals.logProfileChange(fieldName, description)
 */

'use client'

import { useCallback, useRef } from 'react'
import { useBrandStore } from '@/stores/brand'
import {
  logContentEditSignal,
  logGenerationRejection,
  logStrategyEdit,
  logProfileChange,
} from '@/actions/brandOSEvolution'
import type { LearningPhase } from '@/lib/brand-os-evolution'

export function useBrandOSSignals() {
  const { brands, activeBrandId } = useBrandStore()
  const pendingSignals = useRef<Array<() => Promise<any>>>([])
  const flushTimer = useRef<NodeJS.Timeout | null>(null)

  const activeBrand = activeBrandId ? brands[activeBrandId] : null
  const brandInfo = activeBrand?.brandInfo
  const brandId = activeBrandId || ''
  const phase: LearningPhase = brandInfo?.learningPhase || 'calibration'

  // Get user ID from Supabase session (best-effort, non-blocking)
  const getUserId = useCallback(async (): Promise<string | undefined> => {
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      return data?.user?.id
    } catch {
      return undefined
    }
  }, [])

  // Batch flush — sends queued signals in the background
  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) return
    flushTimer.current = setTimeout(async () => {
      flushTimer.current = null
      const batch = pendingSignals.current.splice(0)
      for (const fn of batch) {
        try { await fn() } catch (e) { console.warn('Signal flush failed:', e) }
      }
    }, 2000) // 2-second debounce
  }, [])

  const enqueueSignal = useCallback((fn: () => Promise<any>) => {
    pendingSignals.current.push(fn)
    scheduleFlush()
  }, [scheduleFlush])

  /**
   * Log a content edit (user modified AI-generated text)
   */
  const logContentEdit = useCallback((
    postId: string,
    platform: string,
    format: string,
    editType: string,
    originalText: string,
    editedText: string
  ) => {
    if (!brandId) return

    enqueueSignal(async () => {
      const userId = await getUserId()
      await logContentEditSignal(
        brandId, userId || '', editType, platform, format,
        originalText, editedText, phase
      )
    })
  }, [brandId, phase, enqueueSignal, getUserId])

  /**
   * Log a generation rejection (user hit regenerate)
   */
  const logRegeneration = useCallback((
    platform: string,
    format: string,
    regenerationCount: number
  ) => {
    if (!brandId) return

    enqueueSignal(async () => {
      const userId = await getUserId()
      await logGenerationRejection(brandId, userId || '', platform, format, regenerationCount)
    })
  }, [brandId, enqueueSignal, getUserId])

  /**
   * Log a strategy field edit
   */
  const logStrategyFieldEdit = useCallback((
    fieldName: string,
    originalValue: string,
    newValue: string
  ) => {
    if (!brandId) return

    enqueueSignal(async () => {
      const userId = await getUserId()
      await logStrategyEdit(brandId, userId || '', fieldName, originalValue, newValue)
    })
  }, [brandId, enqueueSignal, getUserId])

  /**
   * Log a brand profile change
   */
  const logProfileFieldChange = useCallback((
    fieldName: string,
    changeDescription: string
  ) => {
    if (!brandId) return

    enqueueSignal(async () => {
      const userId = await getUserId()
      await logProfileChange(brandId, userId || '', fieldName, changeDescription)
    })
  }, [brandId, enqueueSignal, getUserId])

  return {
    logContentEdit,
    logRegeneration,
    logStrategyFieldEdit,
    logProfileFieldChange,
    phase,
    brandId,
  }
}
