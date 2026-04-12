'use client'

import { useBrandStore } from '@/stores/brand'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { 
  Calendar, ArrowRight, Sparkles, Image, Film, LayoutGrid, 
  FileCheck2, FileClock, Star, CalendarDays, Zap,
  Infinity, Briefcase, MessageSquare, Play, Camera, Globe, Music, Search, Activity, Users, MessageCircle
} from 'lucide-react'

const PLATFORM_ICONS: Record<string, { icon: any, color: string }> = {
  "Meta (Instagram & Facebook)": { icon: Infinity, color: "text-blue-400" },
  "LinkedIn": { icon: Briefcase, color: "text-[#0077B5]" },
  "X (Twitter)": { icon: MessageSquare, color: "text-[#E1E1E1]" },
  "TikTok": { icon: Music, color: "text-[#ff0050]" },
  "YouTube": { icon: Play, color: "text-[#FF0000]" },
  "Pinterest": { icon: Camera, color: "text-[#E60023]" },
  "Google Search (SEO)": { icon: Search, color: "text-blue-500" },
  "Google Ads": { icon: Activity, color: "text-emerald-500" },
  "Amazon": { icon: Globe, color: "text-orange-400" },
  "Swiggy/Zomato": { icon: Globe, color: "text-red-400" },
  "Discord": { icon: Users, color: "text-[#5865F2]" },
  "Reddit": { icon: MessageCircle, color: "text-[#FF4500]" },
  "default": { icon: Globe, color: "text-slate-400" }
}

const FORMAT_CONFIG: Record<string, { icon: typeof Film, label: string, color: string, bg: string }> = {
  'Reel':      { icon: Film,       label: 'Reels',      color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-500/20' },
  'Carousel':  { icon: LayoutGrid, label: 'Carousels',  color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  'Static':    { icon: Image,      label: 'Statics',    color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  'Story':     { icon: Zap,        label: 'Stories',     color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
}

export default function WorkspaceDashboard() {
  const router = useRouter()
  const { brands, activeBrandId } = useBrandStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const activeBrand = activeBrandId ? brands[activeBrandId] : null
  const calendar = activeBrand?.calendar || []
  const drafts = activeBrand?.contentDrafts || {}

  // Derived data
  const stats = useMemo(() => {
    if (!calendar.length) return null

    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Upcoming posts (today and forward)
    const upcoming = calendar
      .filter(p => p.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))

    // Topicals — posts with eventContext
    const topicals = upcoming.filter(p => p.eventContext)

    // Format breakdown
    const formatCounts: Record<string, { total: number, drafted: number }> = {}
    for (const post of calendar) {
      const fmt = post.format || 'Static'
      if (!formatCounts[fmt]) formatCounts[fmt] = { total: 0, drafted: 0 }
      formatCounts[fmt].total++
      if (drafts[post.id]) formatCounts[fmt].drafted++
    }

    const totalPosts = calendar.length
    const totalDrafted = Object.keys(drafts).length
    const totalPending = totalPosts - totalDrafted

    return { upcoming, topicals, formatCounts, totalPosts, totalDrafted, totalPending }
  }, [calendar, drafts])

  if (!mounted) return null

  if (!activeBrand) {
    router.push('/dashboard')
    return null
  }

  const now = new Date()
  const monthName = now.toLocaleString('default', { month: 'long' })
  const year = now.getFullYear()

  return (
    <div className="flex flex-col min-h-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      
      {/* Month Header */}
      <div className="relative mb-10">
        <div className="absolute top-[-40%] left-[20%] w-[40%] h-[120%] bg-[var(--color-accent-700)] opacity-10 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative">
          <p className="text-sm font-bold text-[var(--color-accent-400)] uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            {monthName} {year}
          </p>
          <h1 className="text-4xl font-display font-bold text-[var(--color-text-primary)] tracking-tight mb-2">
            {activeBrand.brandInfo?.name || 'Brand'} Dashboard
          </h1>
          <p className="text-[var(--color-text-secondary)] text-lg">
            Your content command center. Pipeline status at a glance.
          </p>
        </div>
      </div>

      {!stats || calendar.length === 0 ? (
        /* Empty State — no calendar generated yet */
        <div className="flex flex-col items-center justify-center p-20 text-center border border-dashed border-[var(--color-border-default)] rounded-3xl bg-[var(--color-bg-surface)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-60 h-60 bg-[var(--color-accent-500)] opacity-5 blur-[80px] pointer-events-none" />
          <div className="w-20 h-20 rounded-full bg-[var(--color-accent-900)]/20 flex items-center justify-center mb-8 border border-[var(--color-accent-500)]/30">
            <Calendar className="w-10 h-10 text-[var(--color-accent-400)]" />
          </div>
          <h3 className="text-2xl font-bold text-[var(--color-text-primary)] mb-3">No Content Calendar Yet</h3>
          <p className="text-[var(--color-text-secondary)] mb-8 max-w-md">
            Generate your first content calendar to see pipeline stats, upcoming topicals, and format breakdowns.
          </p>
          <button 
            onClick={() => router.push('/calendar')}
            className="px-8 py-3.5 bg-[var(--color-accent-600)] text-white hover:bg-[var(--color-accent-500)] text-sm font-bold tracking-widest rounded-full transition-all shadow-[0_0_20px_var(--color-accent-glow)] uppercase flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Build Calendar
          </button>
        </div>
      ) : (
        <div className="space-y-8">

          {/* Row 1: Pipeline Stats */}
          <div className="grid grid-cols-3 gap-5">
            {/* Total Posts */}
            <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl p-6 relative overflow-hidden group hover:border-[var(--color-accent-500)]/30 transition-colors">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--color-accent-500)] opacity-5 blur-[40px] pointer-events-none group-hover:opacity-10 transition-opacity" />
              <p className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-[0.2em] mb-4">Total Pipeline</p>
              <p className="text-5xl font-display font-bold text-[var(--color-text-primary)] mb-1">{stats.totalPosts}</p>
              <p className="text-sm text-[var(--color-text-secondary)] font-medium">post ideas this cycle</p>
            </div>

            {/* Drafted */}
            <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl p-6 relative overflow-hidden group hover:border-[var(--color-success)]/30 transition-colors">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--color-success)] opacity-5 blur-[40px] pointer-events-none group-hover:opacity-10 transition-opacity" />
              <div className="flex items-center gap-2 mb-4">
                <FileCheck2 className="w-3.5 h-3.5 text-[var(--color-success)]" />
                <p className="text-[10px] font-black text-[var(--color-success)] uppercase tracking-[0.2em]">Drafts Written</p>
              </div>
              <p className="text-5xl font-display font-bold text-[var(--color-text-primary)] mb-1">{stats.totalDrafted}</p>
              <p className="text-sm text-[var(--color-text-secondary)] font-medium">content pieces ready</p>
            </div>

            {/* Pending */}
            <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl p-6 relative overflow-hidden group hover:border-amber-500/30 transition-colors">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500 opacity-5 blur-[40px] pointer-events-none group-hover:opacity-10 transition-opacity" />
              <div className="flex items-center gap-2 mb-4">
                <FileClock className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em]">Awaiting Draft</p>
              </div>
              <p className="text-5xl font-display font-bold text-[var(--color-text-primary)] mb-1">{stats.totalPending}</p>
              <p className="text-sm text-[var(--color-text-secondary)] font-medium">posts need content</p>
            </div>
          </div>

          {/* Row 2: Format Breakdown */}
          <div>
            <h2 className="text-xs font-black text-[var(--color-text-tertiary)] uppercase tracking-[0.2em] mb-4">Format Breakdown</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(FORMAT_CONFIG).map(([format, config]) => {
                const data = stats.formatCounts[format] || { total: 0, drafted: 0 }
                const Icon = config.icon
                const pct = data.total > 0 ? Math.round((data.drafted / data.total) * 100) : 0
                return (
                  <div key={format} className={`border rounded-2xl p-5 ${config.bg} relative overflow-hidden`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className={`w-4 h-4 ${config.color}`} />
                      <span className={`text-xs font-black uppercase tracking-widest ${config.color}`}>{config.label}</span>
                    </div>
                    <p className="text-3xl font-display font-bold text-[var(--color-text-primary)] mb-2">{data.total}</p>
                    
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-[var(--color-bg-base)] rounded-full overflow-hidden mb-1.5">
                      <div 
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: 'currentColor' }}
                      />
                    </div>
                    <p className="text-[10px] font-bold text-[var(--color-text-tertiary)]">{data.drafted}/{data.total} drafted</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Row 3: Two columns — Upcoming Topicals + Calendar Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Topicals / Special Days */}
            <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl p-6 relative overflow-hidden">
              <div className="flex items-center gap-2 mb-5">
                <Star className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-black text-[var(--color-text-tertiary)] uppercase tracking-[0.2em]">Upcoming Topicals</h2>
              </div>

              {stats.topicals.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-[var(--color-text-tertiary)] font-medium">No topical events in this cycle.</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">Add custom events when generating your calendar.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {stats.topicals.slice(0, 5).map((post) => {
                    const postDate = new Date(post.date)
                    const dayName = postDate.toLocaleDateString('default', { weekday: 'short' })
                    const dayNum = postDate.getDate()
                    const monthShort = postDate.toLocaleDateString('default', { month: 'short' })
                    return (
                      <div key={post.id} className="flex items-center gap-4 p-3 rounded-xl bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] hover:border-amber-500/30 transition-colors">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-black text-amber-400 uppercase">{dayName}</span>
                          <span className="text-lg font-bold text-[var(--color-text-primary)] leading-none">{dayNum}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">🎯 {post.eventContext}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1.5 truncate">
                            {(() => {
                               const config = PLATFORM_ICONS[post.platform] || PLATFORM_ICONS.default;
                               const Icon = config.icon;
                               return <Icon className={`w-3 h-3 ${config.color}`} />;
                            })()}
                            {post.platform.replace(' (Instagram & Facebook)', '')} · {post.format}
                          </p>
                        </div>
                        <span className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase">{monthShort} {dayNum}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Calendar Preview — Next Posts */}
            <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl p-6 relative overflow-hidden">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--color-accent-400)]" />
                  <h2 className="text-xs font-black text-[var(--color-text-tertiary)] uppercase tracking-[0.2em]">Next Up</h2>
                </div>
                <span className="text-[10px] font-bold text-[var(--color-text-muted)]">{stats.upcoming.length} upcoming</span>
              </div>

              {stats.upcoming.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-[var(--color-text-tertiary)] font-medium">All posts are in the past.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stats.upcoming.slice(0, 6).map((post) => {
                    const hasDraft = !!drafts[post.id]
                    const postDate = new Date(post.date)
                    const dayNum = postDate.getDate()
                    const monthShort = postDate.toLocaleDateString('default', { month: 'short' })
                    return (
                      <div key={post.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--color-bg-hover)] transition-colors group">
                        <div className="w-10 h-10 rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] flex flex-col items-center justify-center flex-shrink-0">
                          <span className="text-[8px] font-black text-[var(--color-text-muted)] uppercase">{monthShort}</span>
                          <span className="text-sm font-bold text-[var(--color-text-primary)] leading-none">{dayNum}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{post.topic}</p>
                          <p className="text-[10px] text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                            {(() => {
                               const config = PLATFORM_ICONS[post.platform] || PLATFORM_ICONS.default;
                               const Icon = config.icon;
                               return <Icon className={`w-2.5 h-2.5 ${config.color}`} />;
                            })()}
                            {post.platform.replace(' (Instagram & Facebook)', '')} · {post.format} · {post.pillar}
                          </p>
                        </div>
                        {hasDraft ? (
                          <span className="w-2 h-2 rounded-full bg-[var(--color-success)] shadow-[0_0_6px_var(--color-success)] flex-shrink-0" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-[var(--color-border-default)] flex-shrink-0" />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* CTA */}
              <button 
                onClick={() => router.push('/calendar')}
                className="w-full mt-5 h-12 rounded-xl bg-[var(--color-bg-base)] border border-[var(--color-border-default)] hover:border-[var(--color-accent-500)]/40 text-sm font-bold text-[var(--color-text-primary)] flex items-center justify-center gap-2 transition-all hover:shadow-lg"
              >
                Open Full Calendar <ArrowRight className="w-4 h-4 text-[var(--color-accent-400)]" />
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
