'use client'

import { useState } from 'react'
import { useBrandStore, type CalendarPost, type PostPerformanceMetrics, type MetricSnapshot } from '@/stores/brand'
import {
  Send, CheckCircle2, BarChart3, RefreshCw, ExternalLink, TrendingUp, Heart,
  MessageCircle, Share2, Bookmark, Eye, X, Link2
} from 'lucide-react'

export function PublishStatusBadge({ post }: { post: CalendarPost }) {
  const { updateCalendarPost, brandInfo } = useBrandStore(s => {
    const brand = s.activeBrandId ? s.brands[s.activeBrandId] : null
    return {
      updateCalendarPost: s.updateCalendarPost,
      brandInfo: brand?.brandInfo || null,
    }
  })

  const [showPublishModal, setShowPublishModal] = useState(false)
  const [postUrl, setPostUrl] = useState(post.publishedUrl || '')
  const [isTracking, setIsTracking] = useState(false)
  const [trackError, setTrackError] = useState('')

  const isPublished = post.publishStatus === 'published' || post.publishStatus === 'tracking'
  const hasMetrics = !!post.performanceMetrics

  // Mark as published and optionally start tracking
  const handlePublish = async () => {
    if (!postUrl.trim()) {
      // Mark published without URL — no tracking
      updateCalendarPost(post.id, {
        publishStatus: 'published',
        publishedAt: new Date().toISOString(),
      })
      setShowPublishModal(false)
      return
    }

    updateCalendarPost(post.id, {
      publishStatus: 'tracking',
      publishedAt: new Date().toISOString(),
      publishedUrl: postUrl.trim(),
    })

    // Trigger metrics scrape
    await fetchMetrics(postUrl.trim())
    setShowPublishModal(false)
  }

  const fetchMetrics = async (url?: string) => {
    const targetUrl = url || post.publishedUrl
    if (!targetUrl) return

    setIsTracking(true)
    setTrackError('')

    try {
      // Determine handle from brand's platform handles
      const platformKey = post.platform
        .toLowerCase()
        .replace('meta (instagram & facebook)', 'instagram')
        .replace('x (twitter)', 'x')
      const handle = brandInfo?.platformHandles?.[platformKey]

      const res = await fetch('/api/apify/track-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postUrl: targetUrl,
          platform: post.platform,
          brandId: brandInfo?.name || 'unknown',
          handle,
        }),
      })

      const data = await res.json()

      if (data.success && data.metrics) {
        const now = new Date().toISOString()
        const existingMetrics = post.performanceMetrics
        const snapshot: MetricSnapshot = {
          type: 'manual',
          capturedAt: now,
          likes: data.metrics.likes,
          comments: data.metrics.comments,
          shares: data.metrics.shares,
          saves: data.metrics.saves,
          views: data.metrics.views,
          engagementRate: data.metrics.engagementRate,
        }

        const metrics: PostPerformanceMetrics = {
          likes: data.metrics.likes,
          comments: data.metrics.comments,
          shares: data.metrics.shares,
          saves: data.metrics.saves,
          views: data.metrics.views,
          engagementRate: data.metrics.engagementRate,
          lastUpdatedAt: now,
          snapshots: [...(existingMetrics?.snapshots || []), snapshot],
        }

        updateCalendarPost(post.id, {
          publishStatus: 'tracking',
          performanceMetrics: metrics,
        })
      } else {
        setTrackError(data.error || 'Could not fetch metrics')
      }
    } catch (err: any) {
      setTrackError(err.message || 'Failed to track post')
    } finally {
      setIsTracking(false)
    }
  }

  // Not published yet — show "Mark as Published" button
  if (!isPublished) {
    return (
      <>
        <button
          onClick={() => setShowPublishModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-2xl border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
        >
          <Send className="w-3.5 h-3.5" />
          Mark Published
        </button>

        {/* Publish Modal */}
        {showPublishModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPublishModal(false)}>
            <div className="bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-3xl p-8 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-black text-[var(--color-text-primary)] mb-2">Mark as Published</h3>
              <p className="text-xs text-[var(--color-text-muted)] mb-6">Paste the live post URL to enable engagement tracking. Or skip to just mark it as published.</p>

              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-1 block">Post URL (optional)</label>
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
                    <input
                      value={postUrl}
                      onChange={e => setPostUrl(e.target.value)}
                      placeholder="https://instagram.com/p/ABC123..."
                      className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handlePublish}
                    disabled={isTracking}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-50"
                  >
                    {isTracking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {postUrl.trim() ? 'Publish & Track' : 'Mark Published'}
                  </button>
                  <button
                    onClick={() => setShowPublishModal(false)}
                    className="px-5 py-3 bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] text-xs font-bold rounded-xl hover:bg-[var(--color-border-default)] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // Published — show metrics or tracking status
  return (
    <div className="flex items-center gap-2">
      {hasMetrics ? (
        <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
          <div className="flex items-center gap-1.5">
            <Heart className="w-3 h-3 text-red-400" />
            <span className="text-[10px] font-bold text-[var(--color-text-primary)]">{formatMetric(post.performanceMetrics!.likes)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageCircle className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] font-bold text-[var(--color-text-primary)]">{formatMetric(post.performanceMetrics!.comments)}</span>
          </div>
          {post.performanceMetrics!.views > 0 && (
            <div className="flex items-center gap-1.5">
              <Eye className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] font-bold text-[var(--color-text-primary)]">{formatMetric(post.performanceMetrics!.views)}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 pl-2 border-l border-emerald-500/20">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-black text-emerald-400">{post.performanceMetrics!.engagementRate}%</span>
          </div>
          <button
            onClick={() => fetchMetrics()}
            disabled={isTracking}
            className="p-1 rounded-lg hover:bg-emerald-500/20 text-emerald-400 transition-all"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-3 h-3 ${isTracking ? 'animate-spin' : ''}`} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-400">Published</span>
          {post.publishedUrl && (
            <button
              onClick={() => fetchMetrics()}
              disabled={isTracking}
              className="flex items-center gap-1 px-2 py-1 bg-emerald-500/20 text-emerald-300 text-[9px] font-bold rounded-lg hover:bg-emerald-500/30 transition-all"
            >
              {isTracking ? <RefreshCw className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
              {isTracking ? 'Tracking...' : 'Fetch Metrics'}
            </button>
          )}
        </div>
      )}

      {trackError && (
        <span className="text-[9px] text-red-400 font-bold">{trackError}</span>
      )}
    </div>
  )
}

function formatMetric(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}
