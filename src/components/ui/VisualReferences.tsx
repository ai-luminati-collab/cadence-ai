'use client'

import { useState } from 'react'
import {
  Search, ExternalLink, Check, RefreshCw, Plus, X, Sparkles,
  Image as ImageIcon, ChevronDown, ChevronUp, Link2
} from 'lucide-react'
import { CalendarPost, VisualRef } from '@/stores/brand'

interface VisualReferencesProps {
  post: CalendarPost
  onFindReferences: () => void
  onResearch: (query: string) => void
  onApproveReference: (refId: string) => void
  onRemoveReference: (refId: string) => void
  onAddCustomReference: (url: string) => void
  isSearching: boolean
}

const PLATFORM_COLORS: Record<string, string> = {
  pinterest: 'text-[#E60023] bg-[#E60023]/10 border-[#E60023]/20',
  instagram: 'text-[#E1306C] bg-[#E1306C]/10 border-[#E1306C]/20',
  behance: 'text-[#1769FF] bg-[#1769FF]/10 border-[#1769FF]/20',
  dribbble: 'text-[#EA4C89] bg-[#EA4C89]/10 border-[#EA4C89]/20',
  other: 'text-[var(--color-text-tertiary)] bg-[var(--color-bg-hover)] border-[var(--color-border-default)]'
}

export function VisualReferences({
  post,
  onFindReferences,
  onResearch,
  onApproveReference,
  onRemoveReference,
  onAddCustomReference,
  isSearching
}: VisualReferencesProps) {
  const [customUrl, setCustomUrl] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [editQuery, setEditQuery] = useState(post.referenceSearchQuery || '')
  const [showQueryEditor, setShowQueryEditor] = useState(false)
  const [expanded, setExpanded] = useState(true)

  const refs = post.visualReferences || []
  const approvedRef = refs.find(r => r.id === post.activeReferenceId)
  const hasRefs = refs.length > 0

  const handleAddCustom = () => {
    if (!customUrl.trim()) return
    onAddCustomReference(customUrl.trim())
    setCustomUrl('')
    setShowCustomInput(false)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 group"
        >
          <label className="text-xs font-black text-cyan-500 uppercase tracking-[0.2em] flex items-center gap-2 cursor-pointer">
            <ImageIcon className="w-3.5 h-3.5" /> Visual Reference
          </label>
          {approvedRef && (
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Check className="w-2.5 h-2.5" /> Approved
            </span>
          )}
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />}
        </button>

        <div className="flex items-center gap-2">
          {/* Add Custom Link */}
          <button
            onClick={() => setShowCustomInput(!showCustomInput)}
            className="text-[10px] font-bold text-[var(--color-text-tertiary)] hover:text-cyan-400 uppercase tracking-widest flex items-center gap-1 transition-colors"
          >
            <Link2 className="w-3 h-3" /> Add Link
          </button>

          {/* Re-search */}
          {hasRefs && (
            <button
              onClick={() => setShowQueryEditor(!showQueryEditor)}
              className="text-[10px] font-bold text-[var(--color-text-tertiary)] hover:text-cyan-400 uppercase tracking-widest flex items-center gap-1 transition-colors"
            >
              <Search className="w-3 h-3" /> Re-search
            </button>
          )}

          {/* Find References (first time) */}
          {!hasRefs && (
            <button
              onClick={onFindReferences}
              disabled={isSearching}
              className="h-9 px-5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg disabled:opacity-50"
            >
              {isSearching ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              {isSearching ? 'Searching...' : 'Find References'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* Custom URL Input */}
          {showCustomInput && (
            <div className="flex gap-2 animate-in fade-in duration-200">
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustom() }}
                placeholder="Paste Pinterest, Instagram, or any image URL..."
                className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-xl py-2.5 px-4 text-sm text-[var(--color-text-primary)] outline-none focus:border-cyan-500 transition-all"
              />
              <button
                onClick={handleAddCustom}
                disabled={!customUrl.trim()}
                className="px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => { setShowCustomInput(false); setCustomUrl('') }}
                className="p-2.5 rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Query Editor (for re-searching) */}
          {showQueryEditor && (
            <div className="flex gap-2 animate-in fade-in duration-200">
              <input
                type="text"
                value={editQuery}
                onChange={(e) => setEditQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { onResearch(editQuery); setShowQueryEditor(false) } }}
                placeholder="Describe the visual vibe you want..."
                className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-xl py-2.5 px-4 text-sm text-[var(--color-text-primary)] outline-none focus:border-cyan-500 transition-all"
              />
              <button
                onClick={() => { onResearch(editQuery); setShowQueryEditor(false) }}
                disabled={!editQuery.trim() || isSearching}
                className="px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSearching ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                Search
              </button>
              <button
                onClick={() => setShowQueryEditor(false)}
                className="p-2.5 rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Search query display */}
          {post.referenceSearchQuery && hasRefs && !showQueryEditor && (
            <p className="text-[10px] text-[var(--color-text-muted)] italic">
              Searched: &quot;{post.referenceSearchQuery}&quot;
            </p>
          )}

          {/* Loading state */}
          {isSearching && !hasRefs && (
            <div className="py-12 flex flex-col items-center gap-3 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <Search className="w-5 h-5 text-cyan-400 animate-bounce" />
              </div>
              <p className="text-xs font-bold text-[var(--color-text-tertiary)]">Finding visual references...</p>
              <p className="text-[10px] text-[var(--color-text-muted)]">Searching Pinterest, Instagram & design sites</p>
            </div>
          )}

          {/* Reference Cards */}
          {hasRefs && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {refs.map((ref) => {
                const isApproved = ref.id === post.activeReferenceId
                const platformStyle = PLATFORM_COLORS[ref.sourcePlatform] || PLATFORM_COLORS.other

                return (
                  <div
                    key={ref.id}
                    className={`relative rounded-2xl border-2 overflow-hidden transition-all group ${
                      isApproved
                        ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30'
                        : 'border-[var(--color-border-default)] hover:border-cyan-500/40'
                    }`}
                  >
                    {/* Image Preview or Placeholder */}
                    <div className="relative h-36 bg-[var(--color-bg-hover)] overflow-hidden">
                      {ref.imageUrl ? (
                        <img
                          src={ref.imageUrl}
                          alt={ref.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // If image fails to load, show placeholder
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : null}
                      {/* Fallback: always show a clickable overlay to view source */}
                      <a
                        href={ref.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center"
                      >
                        <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                      </a>

                      {/* Platform Badge */}
                      <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider border ${platformStyle}`}>
                        {ref.sourcePlatform}
                      </div>

                      {/* Approved badge */}
                      {isApproved && (
                        <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}

                      {/* Remove button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveReference(ref.id) }}
                        className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/50 text-white/70 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Info */}
                    <div className="p-3 bg-[var(--color-bg-surface)] space-y-2">
                      <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{ref.title}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">{ref.description}</p>

                      <div className="flex items-center gap-2 pt-1">
                        {/* View Source */}
                        <a
                          href={ref.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-[9px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors truncate"
                        >
                          <ExternalLink className="w-3 h-3 flex-shrink-0" /> View Source
                        </a>

                        {/* Approve Button */}
                        {!isApproved ? (
                          <button
                            onClick={() => onApproveReference(ref.id)}
                            className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all"
                          >
                            Approve
                          </button>
                        ) : (
                          <span className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-white">
                            ✓ Approved
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Add More (mini card) */}
              <button
                onClick={() => setShowCustomInput(true)}
                className="h-full min-h-[200px] rounded-2xl border-2 border-dashed border-[var(--color-border-default)] hover:border-cyan-500 flex flex-col items-center justify-center gap-2 transition-all group/add"
              >
                <Plus className="w-6 h-6 text-[var(--color-text-muted)] group-hover/add:text-cyan-400 transition-colors" />
                <span className="text-[10px] font-bold text-[var(--color-text-muted)] group-hover/add:text-cyan-400 uppercase tracking-widest transition-colors">Add Your Own</span>
              </button>
            </div>
          )}

          {/* Empty state (no refs yet, not searching) */}
          {!hasRefs && !isSearching && (
            <div className="py-10 border-2 border-dashed border-[var(--color-border-default)] rounded-2xl flex flex-col items-center gap-3 bg-[var(--color-bg-hover)]/20">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-cyan-400" />
              </div>
              <h4 className="text-sm font-bold text-[var(--color-text-primary)]">No Visual Reference Yet</h4>
              <p className="text-xs text-[var(--color-text-muted)] max-w-xs text-center">
                Let AI find moodboard references from Pinterest & Instagram, or paste your own link.
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={onFindReferences}
                  disabled={isSearching}
                  className="h-10 px-6 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg"
                >
                  <Sparkles className="w-3.5 h-3.5" /> AI Find References
                </button>
                <button
                  onClick={() => setShowCustomInput(true)}
                  className="h-10 px-5 rounded-full border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-cyan-500 hover:text-cyan-400 text-xs font-bold flex items-center gap-2 transition-all"
                >
                  <Link2 className="w-3.5 h-3.5" /> Paste Link
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
