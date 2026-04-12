'use server'

import { BrandInfo, ContentDraft } from '@/stores/brand'

/**
 * Edit Tracker — Passive Learning Engine
 * 
 * Silently measures how much users modify AI output.
 * This data feeds the cross-brand intelligence system.
 * NO user-facing impact — pure data collection.
 */

// ── Edit Distance Calculation ──
export function calculateEditDistance(original: ContentDraft, edited: ContentDraft): number {
  // Compare all platform fields + legacy fields
  const fieldScores: number[] = []

  // Legacy fields
  if (original.caption || edited.caption) {
    fieldScores.push(wordSimilarity(original.caption || '', edited.caption || ''))
  }
  if (original.visualDescription || edited.visualDescription) {
    fieldScores.push(wordSimilarity(original.visualDescription || '', edited.visualDescription || ''))
  }
  if (original.hashtags || edited.hashtags) {
    fieldScores.push(wordSimilarity(original.hashtags || '', edited.hashtags || ''))
  }

  // Platform-specific fields
  if (original.platformFields && edited.platformFields) {
    const allKeys = new Set([
      ...Object.keys(original.platformFields),
      ...Object.keys(edited.platformFields)
    ])
    for (const key of allKeys) {
      const origVal = original.platformFields[key] || ''
      const editVal = edited.platformFields[key] || ''
      if (origVal || editVal) {
        fieldScores.push(wordSimilarity(origVal, editVal))
      }
    }
  }

  // Hooks
  if (original.hooks?.length || edited.hooks?.length) {
    const origHooks = (original.hooks || []).join(' ')
    const editHooks = (edited.hooks || []).join(' ')
    fieldScores.push(wordSimilarity(origHooks, editHooks))
  }

  // Average all field scores
  if (fieldScores.length === 0) return 1.0
  return fieldScores.reduce((a, b) => a + b, 0) / fieldScores.length
}

// ── Classify what changed ──
export interface EditClassification {
  fieldsChanged: string[]
  majorRewrites: string[]  // fields with similarity < 0.5
  minorTweaks: string[]    // fields with similarity 0.5-0.85
  untouched: string[]      // fields with similarity > 0.85
  overallScore: number
}

export function classifyEdits(original: ContentDraft, edited: ContentDraft): EditClassification {
  const result: EditClassification = {
    fieldsChanged: [],
    majorRewrites: [],
    minorTweaks: [],
    untouched: [],
    overallScore: 0
  }

  const comparisons: { field: string, score: number }[] = []

  // Compare legacy fields
  const legacyFields = ['caption', 'visualDescription', 'hashtags'] as const
  for (const field of legacyFields) {
    const origVal = original[field] || ''
    const editVal = edited[field] || ''
    if (origVal || editVal) {
      const score = wordSimilarity(origVal, editVal)
      comparisons.push({ field, score })
    }
  }

  // Compare platform fields
  if (original.platformFields || edited.platformFields) {
    const origPF = original.platformFields || {}
    const editPF = edited.platformFields || {}
    const allKeys = new Set([...Object.keys(origPF), ...Object.keys(editPF)])
    for (const key of allKeys) {
      const score = wordSimilarity(origPF[key] || '', editPF[key] || '')
      comparisons.push({ field: key, score })
    }
  }

  // Classify each field
  for (const { field, score } of comparisons) {
    if (score < 0.5) {
      result.majorRewrites.push(field)
      result.fieldsChanged.push(field)
    } else if (score < 0.85) {
      result.minorTweaks.push(field)
      result.fieldsChanged.push(field)
    } else {
      result.untouched.push(field)
    }
  }

  result.overallScore = comparisons.length > 0
    ? comparisons.reduce((a, b) => a + b.score, 0) / comparisons.length
    : 1.0

  return result
}

// ── Word-level Jaccard similarity (fast, no AI needed) ──
function wordSimilarity(a: string, b: string): number {
  if (!a && !b) return 1.0
  if (!a || !b) return 0.0

  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean))
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean))

  if (wordsA.size === 0 && wordsB.size === 0) return 1.0

  const intersection = [...wordsA].filter(w => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size

  return union === 0 ? 1.0 : intersection / union
}
