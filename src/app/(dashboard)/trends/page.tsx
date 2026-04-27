'use client'

import * as React from 'react'
import { useBrandStore } from '@/stores/brand'
import { useRouter } from 'next/navigation'
import { Activity, Sparkles, TrendingUp, RefreshCw, X, FileVideo, ImageIcon, ExternalLink } from 'lucide-react'
import { fetchLiveTrends, hijackTrend, TrendItem } from '@/actions/trends'
import { Toast, useToast } from '@/components/ui/Toast'
import { sanitizeErrorForUI } from '@/lib/error-sanitizer'

export default function TrendsPage() {
  const router = useRouter()
  const { brands, activeBrandId } = useBrandStore()
  const activeBrand = activeBrandId ? brands[activeBrandId] : null
  
  const [trends, setTrends] = React.useState<TrendItem[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Hijacking State
  const [targetTrend, setTargetTrend] = React.useState<TrendItem | null>(null)
  const [isHijacking, setIsHijacking] = React.useState(false)
  const [concept, setConcept] = React.useState<any>(null)
  const { toast, showToast, hideToast } = useToast()

  React.useEffect(() => {
     loadTrends()
  }, [])

  // Keyboard navigation for Trends
  React.useEffect(() => {
     if (!targetTrend) return;
     const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setTargetTrend(null);
     }
     window.addEventListener('keydown', handleKeyDown)
     return () => window.removeEventListener('keydown', handleKeyDown)
  }, [targetTrend])

  const loadTrends = async () => {
     setIsLoading(true)
     setError(null)
     const res = await fetchLiveTrends()
     if (res.success && res.data) {
        setTrends(res.data)
     } else {
        setError(sanitizeErrorForUI(res.error || 'Failed to load live trends.'))
     }
     setIsLoading(false)
  }

  const handleHijack = async (trend: TrendItem) => {
      if (!activeBrand?.brandInfo || !activeBrand?.strategy) {
         showToast('Complete onboarding before hijacking trends.', 'error')
         return
      }
     setTargetTrend(trend)
     setConcept(null)
     setIsHijacking(true)

     const res = await hijackTrend(trend.title, activeBrand.brandInfo, activeBrand.strategy)
      if (res.success && res.data) {
         setConcept(res.data)
      } else {
         showToast('Concept generation failed. ' + sanitizeErrorForUI(res.error || ''), 'error')
      }
     setIsHijacking(false)
  }

  if (!activeBrand) {
    return (
       <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-center animate-in fade-in duration-500">
         <div className="w-20 h-20 rounded-full bg-[var(--color-bg-hover)] flex items-center justify-center mb-6 border border-[var(--color-border-default)]">
            <TrendingUp className="w-10 h-10 text-[var(--color-text-tertiary)]" />
         </div>
         <h2 className="text-3xl font-display font-bold text-[var(--color-text-primary)] mb-3">No Workspace Selected</h2>
         <p className="text-[var(--color-text-secondary)] mb-8 max-w-md">You need to select an active brand from your dashboard to view the Trend Radar.</p>
         <button onClick={() => router.push('/dashboard')} className="bg-[var(--color-accent-600)] hover:bg-[var(--color-accent-500)] text-white px-8 py-3 rounded-full font-bold transition-all transform hover:-translate-y-0.5 shadow-[0_0_20px_var(--color-accent-glow)] uppercase tracking-wide text-sm">Return to Hub</button>
       </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full animate-in fade-in duration-500 relative pb-10">
      {toast && <Toast {...toast} onClose={hideToast} />}
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
           <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.1)]">
              <Activity className="w-6 h-6 text-orange-500" />
           </div>
           <div>
              <h1 className="text-3xl font-display font-bold text-[var(--color-text-primary)] tracking-wide">Live Trend Radar</h1>
              <p className="text-[var(--color-text-secondary)]">A real-time pulse of cultural moments your brand can jump on.</p>
           </div>
        </div>

        <button 
           onClick={loadTrends} 
           disabled={isLoading}
           className="h-10 px-4 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-hover)] text-sm font-bold text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
        >
           <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh Protocol
        </button>
      </div>

      {error ? (
         <div className="p-4 bg-[var(--color-error)]/10 text-[var(--color-error)] border border-[var(--color-error)]/20 rounded-[var(--radius-md)] text-sm">
            {error}
         </div>
      ) : isLoading ? (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
               <div key={i} className="h-40 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] animate-pulse"></div>
            ))}
         </div>
      ) : (
         <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {trends.map(trend => (
               <div key={trend.id} className="group bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl p-6 shadow-md hover:border-[var(--color-accent-500)]/50 transition-all duration-300 flex flex-col justify-between h-full">
                  <div>
                     <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider bg-[var(--color-bg-hover)] px-2 py-1 rounded">
                           /r/{trend.subreddit}
                        </span>
                        <span className="text-[10px] font-bold text-orange-500 bg-orange-500/10 px-2 py-1 rounded">
                           {trend.upvotes.toLocaleString()} UPVOTES
                        </span>
                     </div>
                     <a 
                        href={trend.url.startsWith('http') ? trend.url : `https://reddit.com${trend.url}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[var(--color-text-primary)] font-medium leading-relaxed mb-4 line-clamp-3 hover:text-[var(--color-accent-400)] hover:underline transition-colors text-sm flex items-start gap-1"
                     >
                        "{trend.title}"
                     </a>
                  </div>

                  <button 
                     onClick={() => handleHijack(trend)}
                     className="w-full mt-4 h-10 rounded-[var(--radius-md)] bg-[var(--color-bg-hover)] hover:bg-[var(--color-accent-600)] text-[var(--color-text-secondary)] hover:text-white text-sm font-bold flex items-center justify-center gap-2 transition-all"
                  >
                     <Sparkles className="w-4 h-4" /> Hijack This Trend
                  </button>
               </div>
            ))}
         </div>
      )}

      {/* Hijacking Overlay Panel */}
      {targetTrend && (
         <div className="fixed inset-y-0 right-0 w-[550px] z-50 bg-[var(--color-bg-base)] border-l border-[var(--color-border-default)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b border-[var(--color-border-default)]">
               <div>
                 <span className="text-xs font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded inline-flex items-center gap-1.5 mb-2 uppercase tracking-wide"><Activity className="w-3 h-3"/> Active Trend Hijack</span>
                 <h2 className="text-xl font-bold text-[var(--color-text-primary)] line-clamp-1 hover:text-white transition-colors">{targetTrend.title}</h2>
               </div>
               <div className="flex items-center gap-2">
                  <a 
                     href={targetTrend.url.startsWith('http') ? targetTrend.url : `https://reddit.com${targetTrend.url}`}
                     target="_blank"
                     rel="noreferrer"
                     className="px-3 py-1.5 rounded-full bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-xs font-medium transition-colors flex items-center gap-1.5 mb-2"
                  >
                     <ExternalLink className="w-3 h-3" /> View Source
                  </a>
                  <button onClick={() => setTargetTrend(null)} className="p-3 mb-2 rounded-full bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:bg-[var(--color-error)] hover:text-white transition-colors border border-[var(--color-border-default)] shadow-sm">
                     <X className="w-5 h-5"/>
                  </button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 relative">
               {isHijacking ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--color-bg-base)] z-10 animate-in fade-in duration-500">
                     <div className="w-24 h-24 relative mb-6">
                        <div className="absolute inset-0 rounded-full border-t-2 border-[var(--color-accent-500)] animate-spin"></div>
                        <div className="absolute inset-2 rounded-full border-r-2 border-[var(--color-info)] animate-spin-reverse delay-150"></div>
                        <Sparkles className="w-8 h-8 text-[var(--color-text-primary)] absolute top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] animate-pulse" />
                     </div>
                     <h3 className="text-xl font-display font-bold text-[var(--color-text-primary)] tracking-tight">Simulating Viral DNA...</h3>
                     <p className="text-sm text-[var(--color-text-secondary)] mt-2 italic text-center max-w-[250px]">The AI is injecting your brand codes into this cultural moment.</p>
                  </div>
               ) : concept ? (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
                     
                     <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-[var(--color-bg-hover)]/30 border border-[var(--color-border-subtle)] rounded-xl flex items-center justify-between">
                           <div>
                              <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest">Virality Score</p>
                              <p className="text-2xl font-black text-[var(--color-text-primary)]">{concept.viralityScore}</p>
                           </div>
                           <TrendingUp className="w-8 h-8 text-[var(--color-success)] opacity-20" />
                        </div>
                        <div className="p-4 bg-[var(--color-bg-hover)]/30 border border-[var(--color-border-subtle)] rounded-xl flex items-center justify-between">
                           <div>
                              <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-widest">Complexity</p>
                              <p className="text-2xl font-black text-[var(--color-text-primary)]">{concept.executionComplexity}</p>
                           </div>
                           <Activity className="w-8 h-8 text-[var(--color-warning)] opacity-20" />
                        </div>
                     </div>

                     <div className="space-y-3 bg-[var(--color-accent-900)]/05 border-l-4 border-[var(--color-accent-500)] p-5 rounded-r-xl">
                        <h4 className="text-sm font-black text-[var(--color-accent-400)] uppercase tracking-tighter flex items-center gap-2 underline decoration-[var(--color-accent-500)]">Strategic Rationale</h4>
                        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed italic">
                           "{concept.strategicRationale}"
                        </p>
                     </div>

                     <div className="space-y-3">
                        <label className="text-xs font-bold text-amber-600 uppercase tracking-widest flex items-center gap-2"><Sparkles className="w-3.5 h-3.5" /> High-Impact Hook</label>
                        <div className="p-5 bg-[var(--color-bg-surface)] border-2 border-[var(--color-accent-500)]/30 rounded-2xl text-[var(--color-text-primary)] font-display font-bold text-xl leading-tight shadow-[0_10px_30px_rgba(139,92,246,0.1)] transition-transform hover:scale-[1.01]">
                           {concept.hook}
                        </div>
                     </div>

                     <div className="space-y-3">
                        <label className="text-xs font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-2"><FileVideo className="w-3.5 h-3.5" /> Native Caption</label>
                        <div className="p-5 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-2xl text-sm text-[var(--color-text-primary)] whitespace-pre-wrap font-mono leading-relaxed shadow-inner">
                           {concept.caption}
                        </div>
                     </div>

                     <div className="space-y-3">
                        <label className="text-xs font-bold text-blue-500 uppercase tracking-widest flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Engagement Hack</label>
                        <div className="p-4 bg-blue-500/05 border border-blue-500/20 rounded-xl text-sm text-[var(--color-text-secondary)] leading-relaxed flex items-start gap-3">
                           <div className="mt-1 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                           {concept.engagementHack}
                        </div>
                     </div>

                     <div className="space-y-3">
                        <label className="text-xs font-bold text-purple-600 uppercase tracking-widest flex items-center gap-2"><ImageIcon className="w-3.5 h-3.5" /> Brief for Creative Execution</label>
                        <div className="p-5 bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl text-sm text-[var(--color-text-secondary)] leading-relaxed shadow-sm">
                           {concept.visualIdea}
                        </div>
                     </div>
                  </div>
               ) : null}
            </div>

            {concept && !isHijacking && (
               <div className="p-8 border-t border-[var(--color-border-default)] bg-[var(--color-bg-surface)]/80 backdrop-blur-md grid grid-cols-2 gap-4">
                  <button onClick={() => {
                     navigator.clipboard.writeText(`${concept.hook}\n\n${concept.caption}`)
                     showToast('Content copied to clipboard')
                  }} className="h-12 rounded-full bg-white text-black font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl">
                     Copy Copy
                  </button>
                  <button onClick={() => router.push('/calendar')} className="h-12 rounded-full border-2 border-[var(--color-text-primary)] text-[var(--color-text-primary)] font-black uppercase text-xs tracking-widest hover:bg-[var(--color-text-primary)] hover:text-[var(--color-bg-base)] transition-all">
                     Draft Post
                  </button>
               </div>
            )}
         </div>
      )}
    </div>
  )
}
