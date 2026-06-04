'use client'

import { useState } from 'react'
import { useBrandStore, type CompetitorHandle } from '@/stores/brand'
import {
  Plus, Trash2, Radar, RefreshCw, Globe, ExternalLink,
  TrendingUp, Users, BarChart3, Zap, ChevronDown, ChevronUp, Search
} from 'lucide-react'

// Platform icons as simple colored badges
const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500',
  linkedin: 'bg-blue-600',
  x: 'bg-neutral-800',
  tiktok: 'bg-black',
  youtube: 'bg-red-600',
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  tiktok: 'TikTok',
  youtube: 'YouTube',
}

export function CompetitorIntel() {
  const { brandInfo, setBrandInfo, addCompetitor, removeCompetitor } = useBrandStore(s => {
    const brand = s.activeBrandId ? s.brands[s.activeBrandId] : null
    return {
      brandInfo: brand?.brandInfo || null,
      setBrandInfo: s.setBrandInfo,
      addCompetitor: s.addCompetitor,
      removeCompetitor: s.removeCompetitor,
    }
  })

  const [showAddForm, setShowAddForm] = useState(false)
  const [newCompName, setNewCompName] = useState('')
  const [newCompHandles, setNewCompHandles] = useState<Record<string, string>>({})
  const [scrapingIds, setScrapingIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [scrapeResults, setScrapeResults] = useState<Record<string, any>>({})

  const competitors = brandInfo?.competitorHandles || []
  const brandPlatforms = (brandInfo?.platforms || []).map(p =>
    p.toLowerCase().replace(' (instagram & facebook)', '').replace('twitter', 'x')
  )

  const handleAddCompetitor = () => {
    if (!newCompName.trim()) return
    const handles: Record<string, string> = {}
    for (const [platform, handle] of Object.entries(newCompHandles)) {
      if (handle.trim()) handles[platform] = handle.trim().replace(/^@/, '')
    }
    if (Object.keys(handles).length === 0) return

    addCompetitor({
      id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newCompName.trim(),
      handles,
      addedAt: new Date().toISOString(),
    })

    setNewCompName('')
    setNewCompHandles({})
    setShowAddForm(false)
  }

  const handleScrapeCompetitor = async (comp: CompetitorHandle) => {
    setScrapingIds(s => new Set([...s, comp.id]))

    try {
      const results: any[] = []
      for (const [platform, handle] of Object.entries(comp.handles)) {
        try {
          const res = await fetch('/api/apify/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brandId: brandInfo?.name || 'unknown',
              platform,
              handle,
              profileType: 'competitor',
              postsLimit: 30,
            }),
          })
          const data = await res.json()
          results.push({ platform, handle, ...data })
        } catch (err) {
          results.push({ platform, handle, error: 'Failed to trigger' })
        }
      }

      setScrapeResults(prev => ({ ...prev, [comp.id]: results }))
    } finally {
      setScrapingIds(s => {
        const next = new Set(s)
        next.delete(comp.id)
        return next
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center">
            <Radar className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-wider">Competitor Intelligence</h3>
            <p className="text-[10px] text-[var(--color-text-muted)]">{competitors.length} competitors tracked • Powered by Apify</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent-600)] text-white text-xs font-bold rounded-xl hover:bg-[var(--color-accent-500)] transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Competitor
        </button>
      </div>

      {/* Add Competitor Form */}
      {showAddForm && (
        <div className="bg-[var(--color-bg-surface)] border-2 border-[var(--color-accent-500)]/30 rounded-2xl p-6 space-y-4 animate-in fade-in duration-200">
          <div>
            <label className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Competitor Name</label>
            <input
              value={newCompName}
              onChange={e => setNewCompName(e.target.value)}
              placeholder="e.g. Nike, Apple, Zomato..."
              className="mt-1 w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-500)]"
            />
          </div>

          <div>
            <label className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-2 block">Platform Handles</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {['instagram', 'linkedin', 'x', 'tiktok', 'youtube'].map(platform => (
                <div key={platform} className="flex items-center gap-2">
                  <span className={`w-7 h-7 rounded-lg ${PLATFORM_COLORS[platform]} flex items-center justify-center text-white text-[8px] font-black uppercase flex-shrink-0`}>
                    {platform.charAt(0).toUpperCase()}
                  </span>
                  <input
                    value={newCompHandles[platform] || ''}
                    onChange={e => setNewCompHandles(prev => ({ ...prev, [platform]: e.target.value }))}
                    placeholder={`@${platform === 'linkedin' ? 'company-slug' : 'handle'}`}
                    className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-500)]"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleAddCompetitor}
              disabled={!newCompName.trim() || Object.values(newCompHandles).every(h => !h.trim())}
              className="px-5 py-2.5 bg-[var(--color-accent-600)] text-white text-xs font-bold rounded-xl hover:bg-[var(--color-accent-500)] transition-all disabled:opacity-40"
            >
              Add Competitor
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewCompName(''); setNewCompHandles({}) }}
              className="px-5 py-2.5 bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] text-xs font-bold rounded-xl hover:bg-[var(--color-border-default)] transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Competitors List */}
      {competitors.length === 0 ? (
        <div className="text-center py-12 bg-[var(--color-bg-surface)] rounded-2xl border border-[var(--color-border-default)]">
          <Search className="w-10 h-10 text-[var(--color-text-muted)] mx-auto mb-3 opacity-30" />
          <p className="text-sm font-bold text-[var(--color-text-tertiary)]">No competitors tracked yet</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Add competitor handles to start collecting intelligence</p>
        </div>
      ) : (
        <div className="space-y-3">
          {competitors.map(comp => {
            const isScraping = scrapingIds.has(comp.id)
            const isExpanded = expandedId === comp.id
            const results = scrapeResults[comp.id]

            return (
              <div key={comp.id} className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl overflow-hidden hover:border-[var(--color-border-hover)] transition-all">
                <div className="px-5 py-4 flex items-center gap-4">
                  {/* Name + Handles */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-[var(--color-text-primary)]">{comp.name}</span>
                      <div className="flex gap-1">
                        {Object.entries(comp.handles).map(([platform, handle]) => (
                          <span
                            key={platform}
                            className={`px-2 py-0.5 rounded-full text-[8px] font-bold text-white ${PLATFORM_COLORS[platform] || 'bg-gray-500'}`}
                            title={`${PLATFORM_LABELS[platform]}: @${handle}`}
                          >
                            @{handle}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        Added {new Date(comp.addedAt).toLocaleDateString()}
                      </span>
                      {comp.lastScrapedAt && (
                        <span className="text-[10px] text-emerald-400">
                          Last scraped {new Date(comp.lastScrapedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleScrapeCompetitor(comp)}
                      disabled={isScraping}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-xl hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                    >
                      {isScraping ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Radar className="w-3 h-3" />}
                      {isScraping ? 'Scraping...' : 'Scrape Now'}
                    </button>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : comp.id)}
                      className="p-2 rounded-xl hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] transition-all"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => removeCompetitor(comp.id)}
                      className="p-2 rounded-xl hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-5 pb-4 pt-0 border-t border-[var(--color-border-subtle)]">
                    {results ? (
                      <div className="pt-3 space-y-2">
                        <p className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Scrape Results</p>
                        {results.map((r: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 text-xs">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold text-white ${PLATFORM_COLORS[r.platform] || 'bg-gray-500'}`}>
                              {r.platform}
                            </span>
                            <span className="text-[var(--color-text-secondary)]">@{r.handle}</span>
                            {r.success ? (
                              <span className="text-emerald-400 text-[10px] font-bold">✓ Scrape triggered (runId: {r.runId?.slice(0, 8)}...)</span>
                            ) : (
                              <span className="text-red-400 text-[10px] font-bold">✗ {r.error || 'Failed'}</span>
                            )}
                          </div>
                        ))}
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-2">Results will arrive via webhook and appear in the Competitor Dashboard once processed.</p>
                      </div>
                    ) : (
                      <div className="pt-3">
                        <p className="text-xs text-[var(--color-text-muted)]">Click &quot;Scrape Now&quot; to collect data for this competitor. Results typically arrive within 1-2 minutes.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Brand's Own Handles */}
      <BrandHandlesSection />
    </div>
  )
}

// ── Brand's Own Platform Handles ──

function BrandHandlesSection() {
  const { brandInfo, setPlatformHandles } = useBrandStore(s => {
    const brand = s.activeBrandId ? s.brands[s.activeBrandId] : null
    return {
      brandInfo: brand?.brandInfo || null,
      setPlatformHandles: s.setPlatformHandles,
    }
  })

  const [editing, setEditing] = useState(false)
  const [handles, setHandles] = useState<Record<string, string>>(brandInfo?.platformHandles || {})

  const brandPlatforms = (brandInfo?.platforms || []).map(p =>
    p.toLowerCase().replace(' (instagram & facebook)', '').replace('meta (instagram & facebook)', 'instagram').replace('twitter', 'x')
  )

  const handleSave = () => {
    const cleaned: Record<string, string> = {}
    for (const [k, v] of Object.entries(handles)) {
      if (v.trim()) cleaned[k] = v.trim().replace(/^@/, '')
    }
    setPlatformHandles(cleaned)
    setEditing(false)
  }

  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-[var(--color-accent-400)]" />
          <span className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider">Your Platform Handles</span>
        </div>
        <button
          onClick={() => editing ? handleSave() : setEditing(true)}
          className="text-[10px] font-bold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)] transition-colors"
        >
          {editing ? 'Save' : 'Edit'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {['instagram', 'linkedin', 'x', 'tiktok', 'youtube'].map(platform => {
          const currentHandle = handles[platform] || brandInfo?.platformHandles?.[platform] || ''
          return (
            <div key={platform} className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-lg ${PLATFORM_COLORS[platform]} flex items-center justify-center text-white text-[7px] font-black uppercase flex-shrink-0`}>
                {platform.charAt(0).toUpperCase()}
              </span>
              {editing ? (
                <input
                  value={handles[platform] || ''}
                  onChange={e => setHandles(prev => ({ ...prev, [platform]: e.target.value }))}
                  placeholder={`@handle`}
                  className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-2 py-1.5 text-[10px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-500)]"
                />
              ) : (
                <span className="text-[10px] font-bold text-[var(--color-text-secondary)]">
                  {currentHandle ? `@${currentHandle}` : <span className="text-[var(--color-text-muted)] italic">not set</span>}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
