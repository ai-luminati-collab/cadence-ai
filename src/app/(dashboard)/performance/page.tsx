'use client'

import { useMemo, useState } from 'react'
import { useBrandStore, type CalendarPost, type PostPerformanceMetrics } from '@/stores/brand'
import { useRouter } from 'next/navigation'
import {
  BarChart3, TrendingUp, Heart, MessageCircle, Eye, Share2, Bookmark,
  ArrowUpRight, ArrowDownRight, Minus, Trophy, AlertTriangle, Target,
  Infinity, Briefcase, MessageSquare, Play, Camera, Globe, Music,
  Brain, Sparkles, RefreshCw, CheckCircle2, XCircle, Zap, Shield, Clock
} from 'lucide-react'

const PLATFORM_ICONS: Record<string, { icon: any, color: string }> = {
  "Meta (Instagram & Facebook)": { icon: Infinity, color: "text-blue-400" },
  "LinkedIn": { icon: Briefcase, color: "text-[#0077B5]" },
  "X (Twitter)": { icon: MessageSquare, color: "text-[var(--color-text-secondary)]" },
  "TikTok": { icon: Play, color: "text-pink-400" },
  "YouTube": { icon: Play, color: "text-red-500" },
}

export default function PerformancePage() {
  const router = useRouter()
  const { activeBrandId, brands } = useBrandStore()

  const activeBrand = activeBrandId ? brands[activeBrandId] : null
  const calendar = activeBrand?.calendar || []
  const brandInfo = activeBrand?.brandInfo

  // Filter to only published posts with metrics
  const publishedPosts = useMemo(() =>
    calendar.filter(p => (p.publishStatus === 'published' || p.publishStatus === 'tracking') && p.performanceMetrics),
    [calendar]
  )

  const postsWithMetrics = useMemo(() =>
    publishedPosts.filter(p => p.performanceMetrics && p.performanceMetrics.likes > 0),
    [publishedPosts]
  )

  // Aggregate stats
  const stats = useMemo(() => {
    if (postsWithMetrics.length === 0) return null

    const totalLikes = postsWithMetrics.reduce((a, p) => a + (p.performanceMetrics?.likes || 0), 0)
    const totalComments = postsWithMetrics.reduce((a, p) => a + (p.performanceMetrics?.comments || 0), 0)
    const totalViews = postsWithMetrics.reduce((a, p) => a + (p.performanceMetrics?.views || 0), 0)
    const totalShares = postsWithMetrics.reduce((a, p) => a + (p.performanceMetrics?.shares || 0), 0)
    const avgEngagement = postsWithMetrics.reduce((a, p) => a + (p.performanceMetrics?.engagementRate || 0), 0) / postsWithMetrics.length

    // Best and worst performing
    const sorted = [...postsWithMetrics].sort((a, b) =>
      (b.performanceMetrics?.engagementRate || 0) - (a.performanceMetrics?.engagementRate || 0)
    )

    // By platform
    const byPlatform: Record<string, { posts: number; avgEngagement: number; totalLikes: number }> = {}
    for (const post of postsWithMetrics) {
      if (!byPlatform[post.platform]) {
        byPlatform[post.platform] = { posts: 0, avgEngagement: 0, totalLikes: 0 }
      }
      byPlatform[post.platform].posts++
      byPlatform[post.platform].avgEngagement += (post.performanceMetrics?.engagementRate || 0)
      byPlatform[post.platform].totalLikes += (post.performanceMetrics?.likes || 0)
    }
    for (const key of Object.keys(byPlatform)) {
      byPlatform[key].avgEngagement /= byPlatform[key].posts
    }

    // By pillar
    const byPillar: Record<string, { posts: number; avgEngagement: number }> = {}
    for (const post of postsWithMetrics) {
      if (!byPillar[post.pillar]) byPillar[post.pillar] = { posts: 0, avgEngagement: 0 }
      byPillar[post.pillar].posts++
      byPillar[post.pillar].avgEngagement += (post.performanceMetrics?.engagementRate || 0)
    }
    for (const key of Object.keys(byPillar)) {
      byPillar[key].avgEngagement /= byPillar[key].posts
    }

    // By format
    const byFormat: Record<string, { posts: number; avgEngagement: number }> = {}
    for (const post of postsWithMetrics) {
      if (!byFormat[post.format]) byFormat[post.format] = { posts: 0, avgEngagement: 0 }
      byFormat[post.format].posts++
      byFormat[post.format].avgEngagement += (post.performanceMetrics?.engagementRate || 0)
    }
    for (const key of Object.keys(byFormat)) {
      byFormat[key].avgEngagement /= byFormat[key].posts
    }

    return {
      totalPosts: postsWithMetrics.length,
      totalLikes, totalComments, totalViews, totalShares,
      avgEngagement: Math.round(avgEngagement * 100) / 100,
      topPosts: sorted.slice(0, 3),
      bottomPosts: sorted.slice(-3).reverse(),
      byPlatform, byPillar, byFormat,
    }
  }, [postsWithMetrics])

  // ── AI Multi-Agent Analysis ──
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<any>(null)
  const [analysisError, setAnalysisError] = useState('')

  const handleRunAnalysis = async () => {
    if (!brandInfo || !activeBrand?.strategy) return
    setIsAnalyzing(true)
    setAnalysisError('')

    try {
      // Build context for agents
      const brandContext = `Brand: ${brandInfo.name}
Industry: ${brandInfo.industry}
Platforms: ${brandInfo.platforms?.join(', ')}
Strategy Summary: ${activeBrand.strategy.oneLineStrategy || activeBrand.strategy.targetAudience}
Total Published Posts: ${postsWithMetrics.length}
Avg Engagement Rate: ${stats?.avgEngagement || 'N/A'}%`

      const performanceData = postsWithMetrics.length > 0
        ? `PUBLISHED POST PERFORMANCE DATA:\n${postsWithMetrics.map(p => {
            const m = p.performanceMetrics!
            return `- "${p.topic}" (${p.platform}, ${p.format}, Pillar: ${p.pillar}) → Likes: ${m.likes}, Comments: ${m.comments}, Views: ${m.views}, Engagement: ${m.engagementRate}%`
          }).join('\n')}\n\nAVERAGES:\nAvg Engagement: ${stats?.avgEngagement}%\nTotal Likes: ${stats?.totalLikes}\nTotal Comments: ${stats?.totalComments}`
        : undefined

      const contentDrafts = calendar.slice(0, 10).map(p => {
        const draft = activeBrand.contentDrafts[p.id]
        return draft ? `Post: "${p.topic}" (${p.platform}, ${p.format})\nCaption: ${draft.caption?.substring(0, 200)}...\nHooks: ${draft.hooks?.join(' | ')}` : null
      }).filter(Boolean).join('\n\n')

      const res = await fetch('/api/agents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandContext,
          performanceData,
          contentDrafts: contentDrafts || undefined,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setAnalysisResult(data)
      } else {
        setAnalysisError(data.error || 'Analysis failed')
      }
    } catch (err: any) {
      setAnalysisError(err.message || 'Failed to run analysis')
    } finally {
      setIsAnalyzing(false)
    }
  }

  if (!activeBrand || !activeBrand.socialStrategyGenerated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <BarChart3 className="w-16 h-16 text-[var(--color-text-muted)] mx-auto mb-4 opacity-30" />
          <h2 className="text-xl font-black text-[var(--color-text-primary)] mb-2">Performance Dashboard</h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">Generate your social media strategy and publish some posts to start tracking performance.</p>
          <button
            onClick={() => router.push('/strategy')}
            className="px-6 py-3 bg-[var(--color-accent-600)] text-white text-sm font-bold rounded-xl hover:bg-[var(--color-accent-500)] transition-all"
          >
            Go to Brand OS
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-[var(--color-text-primary)]">Performance</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {publishedPosts.length} published posts • {postsWithMetrics.length} with metrics
          </p>
        </div>
        <button
          onClick={handleRunAnalysis}
          disabled={isAnalyzing}
          className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:from-purple-500 hover:to-blue-500 transition-all disabled:opacity-50 shadow-lg shadow-purple-500/20"
        >
          {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {isAnalyzing ? 'Agents Working...' : 'Run AI Analysis'}
        </button>
      </div>

      {/* AI Analysis Results */}
      {analysisError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <p className="text-sm text-red-400 font-bold">{analysisError}</p>
        </div>
      )}

      {analysisResult && (
        <div className="space-y-6 bg-gradient-to-br from-purple-500/5 to-blue-500/5 border-2 border-purple-500/20 rounded-3xl p-8 animate-in fade-in duration-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                <Brain className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-wider">CEO Intelligence Brief</h3>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  {analysisResult.meta?.workersRun} agents • {analysisResult.meta?.totalFindings} findings • {analysisResult.meta?.proposalsGenerated} proposals • {((analysisResult.totalTimeMs || 0) / 1000).toFixed(1)}s
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              {analysisResult.workerReports?.map((r: any) => (
                <span key={r.agentRole} className={`px-2 py-1 rounded-lg text-[8px] font-bold uppercase tracking-wider ${r.confidence > 0.7 ? 'bg-emerald-500/10 text-emerald-400' : r.confidence > 0.4 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                  {r.agentRole.replace('_', ' ')} {(r.confidence * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          </div>

          {/* Executive Summary */}
          <div className="p-5 bg-[var(--color-bg-surface)] rounded-2xl border border-[var(--color-border-default)]">
            <p className="text-sm font-medium text-[var(--color-text-primary)] leading-relaxed">{analysisResult.ceoDecision?.executiveSummary}</p>
          </div>

          {/* Priority Actions */}
          {analysisResult.ceoDecision?.priorityActions?.length > 0 && (
            <div>
              <h4 className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-3">Priority Actions</h4>
              <div className="space-y-2">
                {analysisResult.ceoDecision.priorityActions.map((action: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-4 bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-default)]">
                    <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider flex-shrink-0 ${
                      action.urgency === 'immediate' ? 'bg-red-500/10 text-red-400' :
                      action.urgency === 'this_week' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-blue-500/10 text-blue-400'
                    }`}>
                      {action.urgency === 'immediate' ? '🔴' : action.urgency === 'this_week' ? '🟡' : '🔵'} {action.urgency.replace('_', ' ')}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-[var(--color-text-primary)]">{action.action}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{action.reasoning}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Brand OS Proposals */}
          {analysisResult.ceoDecision?.brandOSProposals?.length > 0 && (
            <div>
              <h4 className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-3">Brand OS Change Proposals</h4>
              <div className="space-y-2">
                {analysisResult.ceoDecision.brandOSProposals.map((proposal: any, i: number) => (
                  <div key={i} className="p-4 bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-default)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                        proposal.riskLevel === 'low' ? 'bg-emerald-500/10 text-emerald-400' :
                        proposal.riskLevel === 'medium' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>{proposal.riskLevel} risk</span>
                      <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[8px] font-bold uppercase">{proposal.type?.replace('_', ' ')}</span>
                    </div>
                    <p className="text-sm font-bold text-[var(--color-text-primary)]">{proposal.title}</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">{proposal.description}</p>
                    <p className="text-[10px] text-emerald-400 mt-2 font-bold">Expected: {proposal.expectedImpact}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validated Insights */}
          {analysisResult.ceoDecision?.validatedInsights?.length > 0 && (
            <div>
              <h4 className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-3">
                Validated Insights ({analysisResult.ceoDecision.validatedInsights.filter((v: any) => v.ceoVerdict === 'approved').length} approved, {analysisResult.ceoDecision.validatedInsights.filter((v: any) => v.ceoVerdict === 'rejected').length} rejected)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {analysisResult.ceoDecision.validatedInsights.slice(0, 8).map((insight: any, i: number) => (
                  <div key={i} className={`p-3 rounded-xl border ${
                    insight.ceoVerdict === 'approved' ? 'bg-emerald-500/5 border-emerald-500/20' :
                    insight.ceoVerdict === 'rejected' ? 'bg-red-500/5 border-red-500/20' :
                    'bg-amber-500/5 border-amber-500/20'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      {insight.ceoVerdict === 'approved' ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> :
                       insight.ceoVerdict === 'rejected' ? <XCircle className="w-3 h-3 text-red-400" /> :
                       <Sparkles className="w-3 h-3 text-amber-400" />}
                      <span className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase">{insight.sourceAgent?.replace('_', ' ')}</span>
                    </div>
                    <p className="text-xs font-bold text-[var(--color-text-primary)]">{insight.finding?.title || insight.findingTitle}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{insight.ceoReasoning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {postsWithMetrics.length === 0 ? (
        /* Empty state */
        <div className="text-center py-20 bg-[var(--color-bg-surface)] rounded-3xl border border-[var(--color-border-default)]">
          <BarChart3 className="w-16 h-16 text-[var(--color-text-muted)] mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-black text-[var(--color-text-primary)] mb-2">No Performance Data Yet</h3>
          <p className="text-sm text-[var(--color-text-muted)] max-w-md mx-auto mb-6">
            Mark posts as published in the Calendar and paste their live URLs to start tracking engagement metrics.
          </p>
          <button
            onClick={() => router.push('/calendar')}
            className="px-6 py-3 bg-[var(--color-accent-600)] text-white text-sm font-bold rounded-xl hover:bg-[var(--color-accent-500)] transition-all"
          >
            Go to Calendar
          </button>
        </div>
      ) : stats && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricCard label="Avg Engagement" value={`${stats.avgEngagement}%`} icon={TrendingUp} color="text-emerald-400" />
            <MetricCard label="Total Likes" value={formatMetric(stats.totalLikes)} icon={Heart} color="text-red-400" />
            <MetricCard label="Total Comments" value={formatMetric(stats.totalComments)} icon={MessageCircle} color="text-blue-400" />
            <MetricCard label="Total Views" value={formatMetric(stats.totalViews)} icon={Eye} color="text-purple-400" />
            <MetricCard label="Total Shares" value={formatMetric(stats.totalShares)} icon={Share2} color="text-amber-400" />
          </div>

          {/* Top & Bottom Performers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-wider">Top Performers</h3>
              </div>
              <div className="space-y-3">
                {stats.topPosts.map((post, i) => (
                  <PostRow key={post.id} post={post} rank={i + 1} type="top" />
                ))}
              </div>
            </div>

            <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-wider">Needs Improvement</h3>
              </div>
              <div className="space-y-3">
                {stats.bottomPosts.map((post, i) => (
                  <PostRow key={post.id} post={post} rank={i + 1} type="bottom" />
                ))}
              </div>
            </div>
          </div>

          {/* Breakdown by Platform / Pillar / Format */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <BreakdownCard title="By Platform" data={stats.byPlatform} />
            <BreakdownCard title="By Pillar" data={stats.byPillar} />
            <BreakdownCard title="By Format" data={stats.byFormat} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-Components ──

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-black text-[var(--color-text-primary)]">{value}</p>
    </div>
  )
}

function PostRow({ post, rank, type }: { post: CalendarPost; rank: number; type: 'top' | 'bottom' }) {
  const m = post.performanceMetrics!
  const color = type === 'top' ? 'text-emerald-400' : 'text-red-400'
  const bgColor = type === 'top' ? 'bg-emerald-500/10' : 'bg-red-500/10'

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)]">
      <span className={`w-6 h-6 rounded-lg ${bgColor} ${color} flex items-center justify-center text-[10px] font-black`}>{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-[var(--color-text-primary)] line-clamp-1">{post.topic}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-[var(--color-text-muted)]">{post.platform.replace(' (Instagram & Facebook)', '')}</span>
          <span className="text-[9px] text-[var(--color-text-muted)]">•</span>
          <span className="text-[9px] text-[var(--color-text-muted)]">{post.format}</span>
        </div>
      </div>
      <span className={`text-xs font-black ${color}`}>{m.engagementRate}%</span>
    </div>
  )
}

function BreakdownCard({ title, data }: { title: string; data: Record<string, { posts: number; avgEngagement: number }> }) {
  const sorted = Object.entries(data).sort((a, b) => b[1].avgEngagement - a[1].avgEngagement)

  return (
    <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl p-6">
      <h3 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-wider mb-4">{title}</h3>
      <div className="space-y-3">
        {sorted.map(([name, stats], i) => {
          const maxEngagement = sorted[0]?.[1].avgEngagement || 1
          const barWidth = (stats.avgEngagement / maxEngagement) * 100

          return (
            <div key={name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[var(--color-text-secondary)] truncate max-w-[60%]">
                  {name.replace(' (Instagram & Facebook)', '')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--color-text-muted)]">{stats.posts} posts</span>
                  <span className="text-xs font-black text-[var(--color-text-primary)]">{Math.round(stats.avgEngagement * 100) / 100}%</span>
                </div>
              </div>
              <div className="w-full h-1.5 bg-[var(--color-bg-base)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${i === 0 ? 'bg-emerald-500' : i === sorted.length - 1 ? 'bg-red-400' : 'bg-[var(--color-accent-500)]'}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatMetric(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}
