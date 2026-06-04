'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useBrandStore } from '@/stores/brand'
import {
  getPendingChanges,
  acceptChange,
  rejectChange,
  getConvergenceHistory,
} from '@/actions/brandOSEvolution'
import type {
  BrandOSEvent,
  ConvergenceMetrics,
  LearningPhase,
  KnowledgeCategory,
} from '@/lib/brand-os-evolution'
import { CONVERGENCE } from '@/lib/brand-os-evolution'
import {
  Brain, Check, X, Edit3, ChevronDown, ChevronUp,
  Activity, Shield, Zap, Target, History, AlertTriangle,
  BarChart3, Sparkles, Eye
} from 'lucide-react'

// ─── CATEGORY STYLING ──────────────────────────────────────────

const CATEGORY_CONFIG: Record<KnowledgeCategory, { label: string; color: string; bgColor: string }> = {
  tone: { label: 'Tone & Voice', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  visual: { label: 'Visual Direction', color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
  audience: { label: 'Audience', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  platform: { label: 'Platform Rules', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  product: { label: 'Product', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  format: { label: 'Content Format', color: 'text-pink-600', bgColor: 'bg-pink-50' },
  cta: { label: 'CTA', color: 'text-red-600', bgColor: 'bg-red-50' },
  narrative: { label: 'Narrative', color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
  general: { label: 'General', color: 'text-slate-600', bgColor: 'bg-slate-50' },
}

const PHASE_CONFIG: Record<LearningPhase, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  calibration: {
    label: 'Calibrating',
    color: 'text-amber-500',
    icon: <Zap className="w-4 h-4 text-amber-500 animate-pulse" />,
    description: 'AI is observing every signal. High learning rate.'
  },
  active_learning: {
    label: 'Learning',
    color: 'text-blue-500',
    icon: <Brain className="w-4 h-4 text-blue-500" />,
    description: 'AI is refining its understanding. Medium confidence gate.'
  },
  stabilized: {
    label: 'Stable',
    color: 'text-emerald-500',
    icon: <Shield className="w-4 h-4 text-emerald-500" />,
    description: 'Brand OS has converged. Only high-confidence changes surface.'
  },
}

// ─── CONVERGENCE SPARKLINE ─────────────────────────────────────

function ConvergenceSparkline({ metrics }: { metrics: ConvergenceMetrics[] }) {
  if (metrics.length === 0) return null

  const scores = [...metrics].reverse().map(m => m.compositeScore)
  const max = 1
  const min = 0
  const width = 200
  const height = 40
  const padding = 2

  const points = scores.map((score, i) => {
    const x = padding + (i / Math.max(scores.length - 1, 1)) * (width - 2 * padding)
    const y = height - padding - ((score - min) / (max - min)) * (height - 2 * padding)
    return `${x},${y}`
  }).join(' ')

  const latestScore = scores[scores.length - 1] || 0
  const lineColor = latestScore >= CONVERGENCE.STABILIZED_THRESHOLD
    ? '#10b981' // emerald
    : latestScore >= CONVERGENCE.DIVERGENCE_THRESHOLD
      ? '#3b82f6' // blue
      : '#ef4444' // red

  // Threshold line
  const thresholdY = height - padding - ((CONVERGENCE.STABILIZED_THRESHOLD - min) / (max - min)) * (height - 2 * padding)

  return (
    <div className="relative">
      <svg width={width} height={height} className="overflow-visible">
        {/* Threshold line */}
        <line
          x1={padding} y1={thresholdY} x2={width - padding} y2={thresholdY}
          stroke="#10b981" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4"
        />
        {/* Score line */}
        {scores.length > 1 && (
          <polyline
            fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            points={points}
          />
        )}
        {/* Current point */}
        {scores.length > 0 && (
          <circle
            cx={padding + ((scores.length - 1) / Math.max(scores.length - 1, 1)) * (width - 2 * padding)}
            cy={height - padding - ((latestScore - min) / (max - min)) * (height - 2 * padding)}
            r="3" fill={lineColor}
          />
        )}
      </svg>
    </div>
  )
}

// ─── CHANGE CARD ───────────────────────────────────────────────

function ChangeCard({
  event,
  onAccept,
  onReject,
  onEdit,
  isProcessing,
}: {
  event: BrandOSEvent
  onAccept: () => void
  onReject: () => void
  onEdit: (text: string) => void
  isProcessing: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(event.proposedChange || '')
  const catConfig = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.general

  return (
    <div className="bg-[var(--color-bg-base)] p-4 rounded-xl border border-[var(--color-border-default)] group hover:border-blue-200 transition-all">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${catConfig.bgColor} ${catConfig.color} shrink-0`}>
          {catConfig.label}
          {event.platform && <span className="ml-1 opacity-70">/ {event.platform}</span>}
        </div>
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <div className={`w-2 h-2 rounded-full ${
            event.confidence >= 0.85 ? 'bg-emerald-400' :
            event.confidence >= 0.6 ? 'bg-amber-400' : 'bg-red-400'
          }`} />
          <span className="text-[9px] font-bold text-[var(--color-text-muted)]">
            {(event.confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Rule Text */}
      {isEditing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            rows={3}
            className="w-full text-xs font-medium text-[var(--color-text-primary)] bg-[var(--color-bg-surface)] border border-blue-200 rounded-lg p-3 outline-none focus:border-blue-400 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { onEdit(editText); setIsEditing(false) }}
              className="px-3 py-1.5 bg-blue-500 text-white text-[10px] font-black rounded-lg hover:bg-blue-400"
            >
              Save & Accept
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 text-[10px] font-black text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[11px] font-bold text-[var(--color-text-primary)] leading-relaxed">
          {event.proposedChange}
        </p>
      )}

      {/* Evidence */}
      {event.evidence?.length > 0 && !isEditing && (
        <p className="mt-2 text-[9px] text-[var(--color-text-muted)] leading-tight">
          <Eye className="w-3 h-3 inline mr-1 opacity-50" />
          {event.evidence[0]}
        </p>
      )}

      {/* Actions */}
      {!isEditing && (
        <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onAccept}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-black rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-50"
          >
            <Check className="w-3 h-3" /> Accept
          </button>
          <button
            onClick={() => setIsEditing(true)}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-black rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            <Edit3 className="w-3 h-3" /> Edit
          </button>
          <button
            onClick={onReject}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[var(--color-text-muted)] text-[10px] font-black rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            <X className="w-3 h-3" /> Reject
          </button>
        </div>
      )}
    </div>
  )
}

// ─── MAIN COMPONENT ────────────────────────────────────────────

export function BrandOSEvolution() {
  const { brands, activeBrandId, addKnowledgeRule } = useBrandStore()
  const activeBrand = activeBrandId ? brands[activeBrandId] : null
  const brandInfo = activeBrand?.brandInfo

  const [pendingChanges, setPendingChanges] = useState<BrandOSEvent[]>([])
  const [convergenceHistory, setConvergenceHistory] = useState<ConvergenceMetrics[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const phase: LearningPhase = brandInfo?.learningPhase || 'calibration'
  const phaseConfig = PHASE_CONFIG[phase]

  // Calculate days since onboarding
  const onboardedAt = brandInfo?.onboardedAt
  const daysSinceOnboarding = onboardedAt
    ? Math.floor((Date.now() - new Date(onboardedAt).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0

  // Fetch pending changes and convergence data
  const loadData = useCallback(async () => {
    if (!activeBrandId) return
    setIsLoading(true)
    try {
      const [changesRes, metricsRes] = await Promise.all([
        getPendingChanges(activeBrandId),
        getConvergenceHistory(activeBrandId, 30),
      ])
      if (changesRes.success) setPendingChanges(changesRes.changes || [])
      if (metricsRes.success) setConvergenceHistory(metricsRes.metrics || [])
    } catch (e) {
      console.warn('Failed to load Brand OS Evolution data:', e)
    } finally {
      setIsLoading(false)
    }
  }, [activeBrandId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle accept
  const handleAccept = async (event: BrandOSEvent, editedText?: string) => {
    if (!event.id) return
    setProcessingId(event.id)
    try {
      const res = await acceptChange(event.id, activeBrandId || '', editedText)
      if (res.success && res.rule) {
        // Add to local store
        addKnowledgeRule(res.rule)
        // Remove from pending
        setPendingChanges(prev => prev.filter(c => c.id !== event.id))
      }
    } catch (e) {
      console.warn('Accept failed:', e)
    } finally {
      setProcessingId(null)
    }
  }

  // Handle reject
  const handleReject = async (event: BrandOSEvent) => {
    if (!event.id) return
    setProcessingId(event.id)
    try {
      const res = await rejectChange(event.id)
      if (res.success) {
        setPendingChanges(prev => prev.filter(c => c.id !== event.id))
      }
    } catch (e) {
      console.warn('Reject failed:', e)
    } finally {
      setProcessingId(null)
    }
  }

  // Accept all high-confidence changes
  const handleAcceptAllHighConfidence = async () => {
    const highConfidence = pendingChanges.filter(c => c.confidence >= 0.85)
    for (const change of highConfidence) {
      await handleAccept(change)
    }
  }

  const latestScore = convergenceHistory[0]?.compositeScore || 0
  const knowledgeRules = brandInfo?.knowledgeRules || []
  const highConfidenceCount = pendingChanges.filter(c => c.confidence >= 0.85).length

  if (!brandInfo || !onboardedAt) return null

  return (
    <div className="space-y-6 mt-12">
      {/* ═══ HEADER: Phase Indicator + Convergence ═══ */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-wider">
              Brand OS Evolution
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              {phaseConfig.icon}
              <span className={`text-[10px] font-black uppercase tracking-widest ${phaseConfig.color}`}>
                {phaseConfig.label}
              </span>
              <span className="text-[9px] text-[var(--color-text-muted)]">
                Day {daysSinceOnboarding}
              </span>
            </div>
          </div>
        </div>

        {/* Convergence Score */}
        <div className="text-right">
          <div className="flex items-center gap-3">
            <ConvergenceSparkline metrics={convergenceHistory} />
            <div>
              <p className="text-2xl font-black text-[var(--color-text-primary)]">
                {convergenceHistory.length > 0 ? `${(latestScore * 100).toFixed(0)}%` : '—'}
              </p>
              <p className="text-[8px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                Stability
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Phase Description Bar */}
      <div className={`px-4 py-2.5 rounded-xl border ${
        phase === 'calibration' ? 'bg-amber-50/50 border-amber-200' :
        phase === 'active_learning' ? 'bg-blue-50/50 border-blue-200' :
        'bg-emerald-50/50 border-emerald-200'
      }`}>
        <p className="text-[10px] font-medium text-[var(--color-text-secondary)]">
          {phaseConfig.description}
          {phase === 'calibration' && daysSinceOnboarding <= 7 && (
            <span className="ml-2 font-black">
              {7 - daysSinceOnboarding} days of calibration remaining.
            </span>
          )}
        </p>
      </div>

      {/* ═══ PENDING CHANGES QUEUE ═══ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-black text-[var(--color-text-muted)] uppercase tracking-widest">
              Proposed Changes ({pendingChanges.length})
            </h3>
          </div>
          {highConfidenceCount > 0 && (
            <button
              onClick={handleAcceptAllHighConfidence}
              className="px-3 py-1.5 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-wider rounded-lg hover:bg-emerald-400 transition-colors"
            >
              Accept All High-Confidence ({highConfidenceCount})
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 opacity-50">
            <Activity className="w-5 h-5 animate-spin text-[var(--color-text-muted)]" />
            <span className="ml-2 text-xs text-[var(--color-text-muted)]">Loading...</span>
          </div>
        ) : pendingChanges.length > 0 ? (
          <div className="space-y-3">
            {pendingChanges.map(change => (
              <ChangeCard
                key={change.id}
                event={change}
                onAccept={() => handleAccept(change)}
                onReject={() => handleReject(change)}
                onEdit={(text) => handleAccept(change, text)}
                isProcessing={processingId === change.id}
              />
            ))}
          </div>
        ) : (
          <div className="bg-[var(--color-bg-surface)] rounded-xl p-6 border border-[var(--color-border-default)] text-center">
            <Sparkles className="w-6 h-6 text-[var(--color-text-muted)] mx-auto mb-2 opacity-30" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] opacity-50">
              No pending changes. AI is observing.
            </p>
          </div>
        )}
      </div>

      {/* ═══ STRUCTURED KNOWLEDGE BASE ═══ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" />
            <h3 className="text-xs font-black text-[var(--color-text-muted)] uppercase tracking-widest">
              Active Knowledge Rules ({knowledgeRules.length})
            </h3>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex items-center gap-1"
          >
            <History className="w-3 h-3" />
            {showHistory ? 'Hide' : 'History'}
          </button>
        </div>

        {knowledgeRules.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {knowledgeRules.map(rule => {
              const catConfig = CATEGORY_CONFIG[rule.category] || CATEGORY_CONFIG.general
              return (
                <div
                  key={rule.id}
                  className="flex items-start gap-2.5 px-3 py-2.5 bg-[var(--color-bg-surface)] rounded-lg border border-emerald-200/50 group"
                >
                  <div className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider ${catConfig.bgColor} ${catConfig.color} shrink-0 mt-0.5`}>
                    {catConfig.label.split(' ')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium text-[var(--color-text-secondary)] leading-tight">
                      {rule.rule}
                    </p>
                    {rule.platform && (
                      <p className="text-[8px] text-[var(--color-text-muted)] mt-0.5">
                        {rule.platform}
                      </p>
                    )}
                  </div>
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    rule.confidence >= 0.85 ? 'bg-emerald-400' :
                    rule.confidence >= 0.6 ? 'bg-amber-400' : 'bg-slate-300'
                  }`} />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-emerald-50/30 rounded-xl p-6 border border-emerald-100 text-center">
            <Target className="w-6 h-6 text-emerald-400 mx-auto mb-2 opacity-30" />
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 opacity-50">
              Knowledge base is empty. Rules will appear as the AI learns.
            </p>
          </div>
        )}
      </div>

      {/* ═══ CONVERGENCE SUB-METRICS (expandable) ═══ */}
      {convergenceHistory.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <BarChart3 className="w-3 h-3" />
            Convergence Breakdown
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showHistory && (
            <div className="grid grid-cols-5 gap-3 animate-in slide-in-from-top-2">
              {[
                { label: 'Edit Rate', value: convergenceHistory[0]?.editRate, weight: '30%' },
                { label: 'Rejection Rate', value: convergenceHistory[0]?.rejectionRate, weight: '25%' },
                { label: 'Rule Churn', value: convergenceHistory[0]?.ruleChurn, weight: '20%' },
                { label: 'Tone Stability', value: convergenceHistory[0]?.toneStability, weight: '15%' },
                { label: 'Strategy Stability', value: convergenceHistory[0]?.strategyStability, weight: '10%' },
              ].map(metric => (
                <div key={metric.label} className="bg-[var(--color-bg-surface)] rounded-lg p-3 border border-[var(--color-border-default)] text-center">
                  <p className="text-lg font-black text-[var(--color-text-primary)]">
                    {metric.value !== undefined ? `${(metric.value * 100).toFixed(0)}%` : '—'}
                  </p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mt-1">
                    {metric.label}
                  </p>
                  <p className="text-[7px] text-[var(--color-text-muted)] opacity-50">
                    Weight: {metric.weight}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
