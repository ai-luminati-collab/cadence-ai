'use client'

import * as React from 'react'
import { BarChart3, PieChart, Activity, TrendingUp, Users, ArrowUpRight, Sparkles, RefreshCw, X, Globe, Infinity, Briefcase, MessageSquare } from 'lucide-react'
import { useBrandStore } from '@/stores/brand'
import { useRouter } from 'next/navigation'
import { generatePredictedPerformance } from '@/actions/analytics'

export default function AnalyticsPage() {
  const router = useRouter()
  const { brands, activeBrandId, setPredictedMetrics } = useBrandStore()
  const activeBrand = activeBrandId ? brands[activeBrandId] : null
  const metrics = activeBrand?.predictedMetrics
  const strategy = activeBrand?.strategy
  const brandInfo = activeBrand?.brandInfo

  const [isGenerating, setIsGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleGenerateForecast = async () => {
     if (!brandInfo || !strategy) {
        router.push('/onboarding')
        return
     }
     setIsGenerating(true)
     setError(null)
     try {
        const res = await generatePredictedPerformance(brandInfo, strategy)
        if (res.success && res.data) {
           setPredictedMetrics(res.data)
        } else {
           setError(res.error || "Forecasting failed.")
        }
     } catch (e: any) {
        setError(e.message || "Failed to connect to AI engine.")
     } finally {
        setIsGenerating(false)
     }
  }

  if (!activeBrand) {
    return (
       <div className="flex flex-col items-center justify-center h-[60vh] text-center animate-in fade-in duration-500">
         <div className="w-20 h-20 rounded-full bg-[var(--color-bg-hover)] flex items-center justify-center mb-6 border border-[var(--color-border-default)]">
            <Activity className="w-10 h-10 text-[var(--color-text-tertiary)]" />
         </div>
         <h2 className="text-3xl font-display font-bold text-[var(--color-text-primary)] mb-3">No Workspace Selected</h2>
         <p className="text-[var(--color-text-secondary)] mb-8 max-w-md">You need to select a brand to view its intelligence reports.</p>
         <button onClick={() => router.push('/dashboard')} className="bg-[var(--color-accent-600)] hover:bg-[var(--color-accent-500)] text-white px-8 py-3 rounded-full font-bold transition-all transform hover:-translate-y-0.5 shadow-[0_0_20px_var(--color-accent-glow)] uppercase tracking-wide text-sm">Return to Hub</button>
       </div>
    )
  }

  const stats = [
    { label: 'Total Reach', value: metrics?.reach?.value || '---', trend: metrics?.reach?.trend || '0%', icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
    { label: 'Avg Engagement', value: metrics?.engagement?.value || '---', trend: metrics?.engagement?.trend || '0%', icon: Activity, color: 'text-pink-400', bg: 'bg-pink-400/10' },
    { label: 'Profile Visits', value: metrics?.visits?.value || '---', trend: metrics?.visits?.trend || '0%', icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Content ROI Score', value: metrics?.roi?.value || '---', trend: metrics?.roi?.status || 'Locked', icon: PieChart, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  ]

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] pb-6 relative">
         <div className="absolute top-[-50%] right-[10%] w-[30%] h-[100%] bg-[var(--color-info)] opacity-10 blur-[80px] rounded-full pointer-events-none" />
        
        <div>
          <h1 className="text-3xl font-display font-bold text-[var(--color-text-primary)] mb-2">Platform Intelligence</h1>
          <p className="text-[var(--color-text-secondary)]">AI-predicted roadmap and performance trajectory for {brandInfo?.name}.</p>
        </div>
        <div className="flex gap-2">
           <button 
              onClick={handleGenerateForecast}
              disabled={isGenerating}
              className="h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-accent-600)] text-white hover:bg-[var(--color-accent-500)] transition-all text-sm font-bold flex items-center gap-2 shadow-[0_0_15px_var(--color-accent-glow)] disabled:opacity-50"
           >
              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {metrics ? "Update Forecast" : "Generate Forecast"}
           </button>
        </div>
      </div>

      {error && (
         <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm flex items-center justify-between">
            {error}
            <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
         </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
         {stats.map((stat, i) => (
            <div key={i} className="p-5 rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] hover:border-[var(--color-border-hover)] transition-all flex flex-col items-start gap-4 shadow-sm group">
               <div className={`p-2.5 rounded-xl ${stat.bg} group-hover:scale-110 transition-transform`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
               </div>
               <div>
                  <h4 className="text-[var(--color-text-secondary)] text-sm font-medium mb-1">{stat.label}</h4>
                  <div className="flex items-end gap-3">
                     <span className="text-2xl font-bold text-[var(--color-text-primary)]">{stat.value}</span>
                     <span className="text-xs font-bold text-[var(--color-success)] flex items-center mb-1"><ArrowUpRight className="w-3 h-3 mr-0.5" />{stat.trend}</span>
                  </div>
               </div>
            </div>
         ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-6 h-80 flex flex-col relative overflow-hidden shadow-sm">
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-2 z-10">Predicted Growth</h3>
            <p className="text-sm text-[var(--color-text-tertiary)] z-10 mb-6">AI-modeled interaction trajectory (30 Day Delta)</p>
            
            {!metrics ? (
               <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-[var(--color-border-default)] rounded-xl bg-[var(--color-bg-hover)]/30 opacity-60">
                  <Activity className="w-8 h-8 text-[var(--color-text-tertiary)] mb-2" />
                  <p className="text-xs text-[var(--color-text-tertiary)]">Awaiting Intelligence Feed</p>
               </div>
            ) : (
               <div className="flex-1 relative border-l border-b border-[var(--color-border-subtle)] z-10 w-full mt-auto">
                  {(() => {
                     const gd = Array.isArray(metrics.growthData) ? metrics.growthData : []
                     if (gd.length === 0) return <p className="text-xs text-[var(--color-text-muted)] text-center py-4">No growth data</p>
                     const maxY = Math.max(...gd.map(p => p.y), 1)
                     const normalize = (y: number) => (y / maxY) * 45 // Scale to 90% of viewbox height
                     return (
                        <svg viewBox="0 0 100 50" preserveAspectRatio="none" className="w-full h-full absolute inset-0 text-[var(--color-accent-500)]">
                           <path
                              d={`M0,${50 - normalize(gd[0]?.y || 0)} ${gd.map((p, i) => `L${(i / Math.max(gd.length - 1, 1)) * 100},${50 - normalize(p.y)}`).join(' ')}`}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="animate-in fade-in duration-1000"
                           />
                           <path
                              d={`M0,${50 - normalize(gd[0]?.y || 0)} ${gd.map((p, i) => `L${(i / Math.max(gd.length - 1, 1)) * 100},${50 - normalize(p.y)}`).join(' ')} L100,50 L0,50 Z`}
                              fill="url(#gradient)"
                              className="opacity-20 animate-in fade-in duration-1000"
                           />
                           <defs>
                              <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
                                 <stop offset="0%" stopColor="currentColor" />
                                 <stop offset="100%" stopColor="transparent" />
                              </linearGradient>
                           </defs>
                        </svg>
                     )
                  })()}
               </div>
            )}
         </div>

         <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-6 flex flex-col justify-between shadow-sm">
            <div>
               <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-2 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-[var(--color-accent-500)]"/> Strategic Weighting</h3>
               <p className="text-sm text-[var(--color-text-tertiary)] mb-6">Pillar distribution from your active strategy.</p>
            </div>
            
            <div className="space-y-4">
               {Array.isArray(strategy?.pillars) && strategy.pillars.map(pillar => {
                  const pct = parseInt(String(pillar?.val || '0').replace('%', ''), 10) || 0
                  return (
                     <div key={pillar?.title || Math.random()}>
                        <div className="flex justify-between text-sm mb-1.5">
                           <span className="text-[var(--color-text-primary)] font-medium">{pillar?.title || 'Untitled'}</span>
                           <span className="text-[var(--color-text-secondary)] font-bold">{pillar?.val || '0%'}</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[var(--color-bg-hover)] overflow-hidden">
                           <div className={`h-full bg-[var(--color-accent-600)] rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }} />
                        </div>
                     </div>
                  )
               })}
               {!strategy && (
                  <div className="text-sm text-[var(--color-text-tertiary)] italic">Onboard to define content pillars.</div>
               )}
            </div>
         </div>
      </div>

      <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-6 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-700">
         <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-6 flex items-center gap-2"><Globe className="w-5 h-5 text-[var(--color-info)]"/> Platform Breakdown Grid</h3>
         <div className="overflow-x-auto custom-scrollbar pb-2">
            <table className="w-full text-left min-w-[600px]">
               <thead>
                  <tr className="border-b border-[var(--color-border-subtle)] text-[10px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)] bg-[var(--color-bg-hover)]">
                     <th className="py-3 px-4 rounded-l-lg">Platform Focus</th>
                     <th className="py-3 px-4">Allocated Density</th>
                     <th className="py-3 px-4">Target Est. Reach</th>
                     <th className="py-3 px-4">Action Proxy</th>
                     <th className="py-3 px-4 rounded-r-lg">Platform Health</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-[var(--color-border-subtle)]/50 text-sm">
                  {!metrics ? (
                     <tr>
                        <td colSpan={5} className="py-12 text-center text-sm text-[var(--color-text-tertiary)] italic">Awaiting AI Forecasting engine...</td>
                     </tr>
                  ) : [
                     { name: 'Instagram & Facebook', icon: Infinity, color: 'text-pink-500', density: '45%', reach: '12.4K - 15K', proxy: '0.8%', health: 'Growing' },
                     { name: 'LinkedIn', icon: Briefcase, color: 'text-blue-500', density: '30%', reach: '5.2K - 8K', proxy: '2.1%', health: 'Stable' },
                     { name: 'X / Twitter', icon: MessageSquare, color: 'text-slate-300', density: '25%', reach: '3.1K - 5K', proxy: '1.2%', health: 'Volatile' }
                  ].map((p, idx) => (
                     <tr key={idx} className="hover:bg-[var(--color-bg-hover)]/30 transition-colors group">
                        <td className="py-4 px-4 font-bold text-[var(--color-text-primary)] flex items-center gap-3">
                           <div className={`p-2 bg-[var(--color-bg-hover)] rounded-md group-hover:bg-[var(--color-bg-base)] transition-colors border border-transparent group-hover:border-[var(--color-border-subtle)] ${p.color}`}><p.icon className="w-4 h-4"/></div>
                           {p.name}
                        </td>
                        <td className="py-4 px-4 text-[var(--color-text-secondary)] font-medium">{p.density}</td>
                        <td className="py-4 px-4 text-[var(--color-accent-400)] font-black group-hover:text-[var(--color-accent-500)] transition-colors">{p.reach}</td>
                        <td className="py-4 px-4 text-[var(--color-success)] font-medium">~ {p.proxy}</td>
                        <td className="py-4 px-4">
                           <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] uppercase font-black tracking-widest ${p.health === 'Growing' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : p.health === 'Stable' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                              {p.health}
                           </span>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  )
}
