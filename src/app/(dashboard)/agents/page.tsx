'use client'

import { useState, useRef, useEffect } from 'react'
import { useBrandStore } from '@/stores/brand'
import { useRouter } from 'next/navigation'
import {
  Brain, Search, Target, Calendar, PenTool, Palette, Radio,
  Crown, Play, Loader2, MessageCircle, AlertTriangle, CheckCircle2,
  XCircle, ChevronDown, ChevronRight, ArrowRight, Zap, Clock,
  Users, Activity, Shield, Send, HelpCircle, BookOpen, TrendingUp,
  Database, Lightbulb
} from 'lucide-react'

// Agent visuals
const AGENT_META: Record<string, { icon: any; color: string; gradient: string; name: string }> = {
  scout:       { icon: Search,   color: 'text-amber-400',   gradient: 'from-amber-600 to-orange-600',  name: 'Scout' },
  strategist:  { icon: Target,   color: 'text-blue-400',    gradient: 'from-blue-600 to-indigo-600',   name: 'Strategist' },
  planner:     { icon: Calendar, color: 'text-emerald-400', gradient: 'from-emerald-600 to-teal-600',  name: 'Planner' },
  copywriter:  { icon: PenTool,  color: 'text-violet-400',  gradient: 'from-violet-600 to-purple-600', name: 'Copywriter' },
  creative:    { icon: Palette,  color: 'text-pink-400',    gradient: 'from-pink-600 to-rose-600',     name: 'Creative' },
  trend_radar: { icon: Radio,    color: 'text-cyan-400',    gradient: 'from-cyan-600 to-sky-600',      name: 'TrendRadar' },
  ceo:         { icon: Crown,    color: 'text-yellow-400',  gradient: 'from-yellow-600 to-amber-600',  name: 'CEO' },
}

const WAVE_LABELS = [
  { num: 1, label: 'Intelligence Gathering', agents: ['scout', 'trend_radar'] },
  { num: 2, label: 'Strategy Formation',     agents: ['strategist'] },
  { num: 3, label: 'Content Execution',      agents: ['planner', 'copywriter', 'creative'] },
  { num: 4, label: 'CEO Review',             agents: ['ceo'] },
]

interface MessageBusItem {
  id: string
  timestamp: string
  sender: string
  recipients: string[] | string
  type: string
  subject: string
  content: string
  data?: any
  threadId?: string
  status: string
}

interface EscalationItem {
  id: string
  timestamp: string
  threadId: string
  title: string
  summary: string
  contributingAgents: string[]
  messageChain: MessageBusItem[]
  proposedActions: { type: string; description: string; agent: string; confidence: number; confidenceLevel?: string; citation?: string; data: any }[]
  urgency: string
  status: string
  ceoResponse?: string
}

export default function AgentsPage() {
  const router = useRouter()
  const { activeBrandId, brands } = useBrandStore()
  const activeBrand = activeBrandId ? brands[activeBrandId] : null
  const brandInfo = activeBrand?.brandInfo

  const [isRunning, setIsRunning] = useState(false)
  const [currentWave, setCurrentWave] = useState(0)
  const [messageBus, setMessageBus] = useState<MessageBusItem[]>([])
  const [escalations, setEscalations] = useState<EscalationItem[]>([])
  const [ceoDecisions, setCeoDecisions] = useState<any>(null)
  const [smartQuestions, setSmartQuestions] = useState<any[]>([])
  const [memoryStore, setMemoryStore] = useState<any>(null)
  const [agentActivity, setAgentActivity] = useState<Record<string, { messagesSent: number; escalationsRaised: number; learningsProduced?: number }>>({})
  const [totalTime, setTotalTime] = useState(0)
  const [error, setError] = useState('')
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())
  const [expandedEscalations, setExpandedEscalations] = useState<Set<string>>(new Set())
  const [liveLog, setLiveLog] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [liveLog])

  const runTeamCycle = async () => {
    if (!brandInfo || !activeBrand?.strategy) return
    setIsRunning(true)
    setError('')
    setMessageBus([])
    setEscalations([])
    setCeoDecisions(null)
    setSmartQuestions([])
    setAgentActivity({})
    setLiveLog([])
    setCurrentWave(0)

    // Simulate wave progression for UX
    const waveTimer = (wave: number, delay: number) =>
      setTimeout(() => {
        setCurrentWave(wave)
        const waveInfo = WAVE_LABELS[wave - 1]
        setLiveLog(prev => [...prev, `🌊 Wave ${wave}: ${waveInfo.label} — ${waveInfo.agents.map(a => AGENT_META[a].name).join(' + ')} active`])
      }, delay)

    const t1 = waveTimer(1, 500)
    const t2 = waveTimer(2, 8000)
    const t3 = waveTimer(3, 16000)
    const t4 = waveTimer(4, 28000)

    try {
      const calendar = activeBrand.calendar || []
      const publishedPosts = calendar.filter(p => p.publishStatus === 'published' && p.performanceMetrics)

      const brandContext = `Brand: ${brandInfo.name}
Industry: ${brandInfo.industry}
Platforms: ${brandInfo.platforms?.join(', ')}
Strategy: ${activeBrand.strategy.oneLineStrategy || activeBrand.strategy.targetAudience || 'Not set'}
Pillars: ${activeBrand.strategy.pillars?.map((p: any) => p.title || p).join(', ') || 'Not set'}
Total Calendar Posts: ${calendar.length}
Published Posts: ${publishedPosts.length}`

      const performanceData = publishedPosts.length > 0
        ? publishedPosts.map(p => {
            const m = p.performanceMetrics!
            return `"${p.topic}" (${p.platform}, ${p.format}, Pillar: ${p.pillar}) → Likes: ${m.likes}, Comments: ${m.comments}, Views: ${m.views}, Engagement: ${m.engagementRate}%`
          }).join('\n')
        : undefined

      const calendarData = calendar.slice(0, 15).map(p =>
        `[${p.date}] "${p.topic}" — ${p.platform} ${p.format} (Pillar: ${p.pillar})${p.publishStatus === 'published' ? ' ✓ Published' : ''}`
      ).join('\n')

      const draftData = Object.entries(activeBrand.contentDrafts || {}).slice(0, 8).map(([id, draft]: [string, any]) => {
        const post = calendar.find(p => p.id === id)
        return post ? `"${post.topic}" — Caption: ${draft.caption?.substring(0, 150)}... | Hooks: ${draft.hooks?.slice(0, 2).join(' | ')}` : null
      }).filter(Boolean).join('\n')

      // Competitor data from brand store
      const competitors = brandInfo.competitorHandles || []
      const competitorData = competitors.length > 0
        ? `Tracked competitors: ${competitors.map((c: any) => c.name).join(', ')}\nHandles: ${competitors.map((c: any) => Object.entries(c.handles || {}).map(([p, h]) => `${p}: ${h}`).join(', ')).join(' | ')}`
        : undefined

      const res = await fetch('/api/agents/team-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandContext,
          brandId: activeBrandId,
          performanceData,
          competitorData,
          calendarData,
          draftData,
          trendData: 'Analyze current social media trends relevant to this brand\'s industry and suggest timely content opportunities.',
        }),
      })

      // Handle non-JSON responses (e.g., Vercel timeout, 502, etc.)
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await res.text()
        throw new Error(text.slice(0, 200) || `Server returned ${res.status} (not JSON). Possible timeout — Vercel free plan has a 60s limit.`)
      }

      const data = await res.json()

      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)

      if (data.success) {
        setMessageBus(data.messageBus || [])
        setEscalations(data.escalations || [])
        setCeoDecisions(data.ceoDecisions)
        setSmartQuestions(data.smartQuestions || [])
        setMemoryStore(data.memoryStore || null)
        setAgentActivity(data.agentActivity || {})
        setTotalTime(data.totalTimeMs || 0)
        setCurrentWave(5) // Done
        setLiveLog(prev => [...prev,
          `✅ Team cycle complete — ${data.meta?.totalMessages || 0} messages, ${data.meta?.totalEscalations || 0} escalations`,
          `🧠 ${data.meta?.totalLearnings || 0} learnings recorded • ${data.meta?.totalSmartQuestions || 0} questions for you`,
          `⏱ Total time: ${((data.totalTimeMs || 0) / 1000).toFixed(1)}s`,
        ])
      } else {
        setError(data.error || 'Team cycle failed')
        setLiveLog(prev => [...prev, `❌ Error: ${data.error}`])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to run team cycle')
      setLiveLog(prev => [...prev, `❌ Error: ${err.message}`])
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
    } finally {
      setIsRunning(false)
    }
  }

  const toggleThread = (threadId: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev)
      next.has(threadId) ? next.delete(threadId) : next.add(threadId)
      return next
    })
  }

  const toggleEscalation = (id: string) => {
    setExpandedEscalations(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Group messages by thread
  const threads = messageBus.reduce<Record<string, MessageBusItem[]>>((acc, msg) => {
    const tid = msg.threadId || 'unthreaded'
    if (!acc[tid]) acc[tid] = []
    acc[tid].push(msg)
    return acc
  }, {})

  if (!activeBrand || !activeBrand.socialStrategyGenerated) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <Users className="w-16 h-16 text-[var(--color-text-muted)] mx-auto mb-4 opacity-30" />
          <h2 className="text-xl font-black text-[var(--color-text-primary)] mb-2">Agent Team</h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">Generate your brand strategy first. The agent team needs a Brand OS to work with.</p>
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
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-[var(--color-text-primary)] flex items-center gap-3">
            <Users className="w-8 h-8 text-[var(--color-accent-500)]" />
            Agent Team
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            6 specialist agents + CEO (Claude Opus) — autonomous marketing intelligence
          </p>
        </div>
        <button
          onClick={runTeamCycle}
          disabled={isRunning}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-black uppercase tracking-widest rounded-2xl hover:from-purple-500 hover:to-blue-500 transition-all disabled:opacity-50 shadow-lg shadow-purple-500/20"
        >
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {isRunning ? 'Team Working...' : 'Run Team Cycle'}
        </button>
      </div>

      {/* Agent Roster */}
      <div className="grid grid-cols-7 gap-3">
        {Object.entries(AGENT_META).map(([id, meta]) => {
          const Icon = meta.icon
          const activity = agentActivity[id]
          const isActive = isRunning && WAVE_LABELS.find(w => w.num === currentWave)?.agents.includes(id)
          return (
            <div
              key={id}
              className={`relative rounded-2xl border p-4 text-center transition-all duration-500 ${
                isActive
                  ? 'border-[var(--color-accent-500)] bg-[var(--color-accent-glow)] shadow-lg shadow-[var(--color-accent-500)]/20 scale-105'
                  : activity && activity.messagesSent > 0
                  ? 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)]'
                  : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] opacity-60'
              }`}
            >
              {isActive && (
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              )}
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center mx-auto mb-2 shadow-lg`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-xs font-black text-[var(--color-text-primary)]">{meta.name}</p>
              <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5">
                {id === 'ceo' ? 'Claude Opus 4.7' : 'GPT-5.5'}
              </p>
              {activity && activity.messagesSent > 0 && (
                <div className="flex items-center justify-center gap-1 mt-2">
                  <span className="text-[9px] text-[var(--color-text-tertiary)]">
                    {activity.messagesSent} msg{activity.messagesSent !== 1 ? 's' : ''}
                  </span>
                  {activity.escalationsRaised > 0 && (
                    <span className="text-[9px] text-amber-400">
                      {activity.escalationsRaised} esc
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Wave Progress */}
      {(isRunning || currentWave > 0) && (
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6">
          <h3 className="text-sm font-black text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--color-accent-500)]" />
            Execution Pipeline
          </h3>
          <div className="flex items-center gap-2">
            {WAVE_LABELS.map((wave) => (
              <div key={wave.num} className="flex-1">
                <div className={`h-2 rounded-full transition-all duration-1000 ${
                  currentWave > wave.num ? 'bg-emerald-500'
                  : currentWave === wave.num ? 'bg-[var(--color-accent-500)] animate-pulse'
                  : 'bg-[var(--color-bg-hover)]'
                }`} />
                <p className={`text-[9px] mt-1.5 font-bold ${
                  currentWave >= wave.num ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'
                }`}>
                  Wave {wave.num}: {wave.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Log */}
      {liveLog.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-base)] p-4 max-h-48 overflow-y-auto font-mono text-xs">
          {liveLog.map((line, i) => (
            <div key={i} className="text-[var(--color-text-secondary)] py-0.5">{line}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <p className="text-sm text-red-400 font-bold">{error}</p>
        </div>
      )}

      {/* Results Section */}
      {messageBus.length > 0 && (
        <>
          {/* Stats Bar */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: 'Messages', value: messageBus.length, icon: MessageCircle, color: 'text-blue-400' },
              { label: 'Threads', value: Object.keys(threads).length, icon: ArrowRight, color: 'text-emerald-400' },
              { label: 'Escalations', value: escalations.length, icon: AlertTriangle, color: 'text-amber-400' },
              { label: 'Learnings', value: memoryStore?.totalLearnings || 0, icon: BookOpen, color: 'text-teal-400' },
              { label: 'Questions', value: smartQuestions.length, icon: HelpCircle, color: 'text-orange-400' },
              { label: 'Time', value: `${(totalTime / 1000).toFixed(1)}s`, icon: Clock, color: 'text-purple-400' },
            ].map(s => (
              <div key={s.label} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-muted)]">{s.label}</span>
                </div>
                <p className="text-2xl font-black text-[var(--color-text-primary)]">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Escalations (CEO Decisions) */}
          {escalations.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-[var(--color-text-primary)] flex items-center gap-2">
                <Shield className="w-5 h-5 text-yellow-400" />
                CEO Escalations
              </h2>
              {escalations.map(esc => (
                <div key={esc.id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] overflow-hidden">
                  <button
                    onClick={() => toggleEscalation(esc.id)}
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-[var(--color-bg-hover)] transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          esc.urgency === 'critical' ? 'bg-red-500/20 text-red-400' :
                          esc.urgency === 'high' ? 'bg-orange-500/20 text-orange-400' :
                          esc.urgency === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {esc.urgency}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          esc.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' :
                          esc.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                          esc.status === 'modified' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'
                        }`}>
                          {esc.status === 'pending_ceo' ? 'pending' : esc.status}
                        </span>
                        <span className="text-[9px] text-[var(--color-text-muted)]">
                          {esc.contributingAgents.map(a => AGENT_META[a]?.name || a).join(' + ')}
                        </span>
                      </div>
                      <h3 className="text-sm font-black text-[var(--color-text-primary)]">{esc.title}</h3>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1 line-clamp-2">{esc.summary}</p>
                    </div>
                    {expandedEscalations.has(esc.id) ? <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />}
                  </button>

                  {expandedEscalations.has(esc.id) && (
                    <div className="border-t border-[var(--color-border-subtle)] p-5 space-y-4">
                      {/* Proposed Actions */}
                      {esc.proposedActions.length > 0 && (
                        <div>
                          <h4 className="text-[10px] uppercase font-black tracking-wider text-[var(--color-text-muted)] mb-2">Proposed Actions</h4>
                          <div className="space-y-2">
                            {esc.proposedActions.map((action, i) => (
                              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)]">
                                <Zap className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg-hover)] text-[var(--color-text-tertiary)] font-bold">{action.type}</span>
                                    <span className="text-[9px] text-[var(--color-text-muted)]">by {AGENT_META[action.agent]?.name || action.agent}</span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                      action.confidenceLevel === 'green' ? 'bg-emerald-500/20 text-emerald-400' :
                                      action.confidenceLevel === 'red' ? 'bg-red-500/20 text-red-400' :
                                      'bg-yellow-500/20 text-yellow-400'
                                    }`}>
                                      {action.confidenceLevel?.toUpperCase() || 'YELLOW'} {(action.confidence * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--color-text-secondary)]">{action.description}</p>
                                  {action.citation && (
                                    <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5 italic">Citation: {action.citation}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Message Chain */}
                      {esc.messageChain.length > 0 && (
                        <div>
                          <h4 className="text-[10px] uppercase font-black tracking-wider text-[var(--color-text-muted)] mb-2">Conversation Chain</h4>
                          <div className="space-y-2">
                            {esc.messageChain.map(msg => {
                              const sender = AGENT_META[msg.sender]
                              const SenderIcon = sender?.icon || MessageCircle
                              return (
                                <div key={msg.id} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--color-bg-base)]">
                                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${sender?.gradient || 'from-gray-600 to-gray-700'} flex items-center justify-center flex-shrink-0`}>
                                    <SenderIcon className="w-3.5 h-3.5 text-white" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-[10px] font-black text-[var(--color-text-primary)]">{sender?.name || msg.sender}</span>
                                      <ArrowRight className="w-3 h-3 text-[var(--color-text-muted)]" />
                                      <span className="text-[10px] text-[var(--color-text-tertiary)]">
                                        {Array.isArray(msg.recipients) ? msg.recipients.map(r => AGENT_META[r]?.name || r).join(', ') : msg.recipients}
                                      </span>
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]">{msg.type}</span>
                                    </div>
                                    <p className="text-xs font-bold text-[var(--color-text-primary)]">{msg.subject}</p>
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 whitespace-pre-wrap">{msg.content}</p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Smart Questions — Agents asking the user */}
          {smartQuestions.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-[var(--color-text-primary)] flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-orange-400" />
                Questions For You
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-bold">{smartQuestions.length}</span>
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] -mt-2">
                Your agents are below 60% confidence on these decisions and need your input to produce better output.
              </p>
              {smartQuestions.map((q: any) => {
                const agentMeta = AGENT_META[q.agentId]
                const AgentIcon = agentMeta?.icon || HelpCircle
                return (
                  <div key={q.id} className="rounded-2xl border-2 border-orange-500/20 bg-orange-500/5 p-5">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${agentMeta?.gradient || 'from-gray-600 to-gray-700'} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                        <AgentIcon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-black text-[var(--color-text-primary)]">{q.agentName || agentMeta?.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-bold">
                            {(q.confidence * 100).toFixed(0)}% confident
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                            q.urgency === 'high' ? 'bg-red-500/20 text-red-400' :
                            q.urgency === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>{q.urgency}</span>
                        </div>
                        <p className="text-sm font-bold text-[var(--color-text-primary)] mb-2">{q.question}</p>
                        {q.context && (
                          <div className="text-[10px] text-[var(--color-text-muted)] mb-1">
                            <span className="font-bold">What I know: </span>{q.context}
                          </div>
                        )}
                        {q.defaultPath && (
                          <div className="text-[10px] text-[var(--color-text-muted)] mb-1">
                            <span className="font-bold">Default path: </span>{q.defaultPath}
                          </div>
                        )}
                        {q.whyItMatters && (
                          <div className="text-[10px] text-[var(--color-text-tertiary)]">
                            <span className="font-bold">Why it matters: </span>{q.whyItMatters}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Brand Memory — Learnings */}
          {memoryStore && memoryStore.totalLearnings > 0 && (
            <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-6">
              <h3 className="text-sm font-black text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                <Database className="w-4 h-4 text-teal-400" />
                Brand Memory — Cycle #{memoryStore.cycleCount}
              </h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-xl font-black text-emerald-400">{memoryStore.wins?.length || 0}</p>
                  <p className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase">Wins</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-red-400">{memoryStore.losses?.length || 0}</p>
                  <p className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase">Losses</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-blue-400">{memoryStore.rules?.length || 0}</p>
                  <p className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase">Rules</p>
                </div>
              </div>
              {(memoryStore.rules || []).slice(0, 5).map((rule: any, i: number) => (
                <div key={i} className="flex items-start gap-2 py-1.5 border-t border-[var(--color-border-subtle)]">
                  <Lightbulb className={`w-3 h-3 mt-0.5 flex-shrink-0 ${
                    rule.confidence === 'green' ? 'text-emerald-400' :
                    rule.confidence === 'yellow' ? 'text-yellow-400' : 'text-red-400'
                  }`} />
                  <div>
                    <p className="text-xs text-[var(--color-text-secondary)]">{rule.description}</p>
                    <p className="text-[9px] text-[var(--color-text-muted)]">{rule.citation}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Message Bus — Threaded Conversations */}
          <div className="space-y-4">
            <h2 className="text-lg font-black text-[var(--color-text-primary)] flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-400" />
              Agent Conversations
            </h2>
            {Object.entries(threads).map(([threadId, messages]) => (
              <div key={threadId} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] overflow-hidden">
                <button
                  onClick={() => toggleThread(threadId)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-[var(--color-bg-hover)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {[...new Set(messages.map(m => m.sender))].slice(0, 4).map(sender => {
                        const meta = AGENT_META[sender]
                        const Icon = meta?.icon || MessageCircle
                        return (
                          <div key={sender} className={`w-7 h-7 rounded-lg bg-gradient-to-br ${meta?.gradient || 'from-gray-600 to-gray-700'} flex items-center justify-center border-2 border-[var(--color-bg-surface)]`}>
                            <Icon className="w-3.5 h-3.5 text-white" />
                          </div>
                        )
                      })}
                    </div>
                    <div>
                      <p className="text-xs font-black text-[var(--color-text-primary)]">
                        {messages[0]?.subject || 'Thread'}
                      </p>
                      <p className="text-[9px] text-[var(--color-text-muted)]">
                        {messages.length} message{messages.length !== 1 ? 's' : ''} • {[...new Set(messages.map(m => m.sender))].map(s => AGENT_META[s]?.name || s).join(', ')}
                      </p>
                    </div>
                  </div>
                  {expandedThreads.has(threadId) ? <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />}
                </button>

                {expandedThreads.has(threadId) && (
                  <div className="border-t border-[var(--color-border-subtle)] p-4 space-y-3">
                    {messages.map(msg => {
                      const sender = AGENT_META[msg.sender]
                      const SenderIcon = sender?.icon || MessageCircle
                      return (
                        <div key={msg.id} className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${sender?.gradient || 'from-gray-600 to-gray-700'} flex items-center justify-center flex-shrink-0 shadow-md`}>
                            <SenderIcon className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0 rounded-xl bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-black text-[var(--color-text-primary)]">{sender?.name || msg.sender}</span>
                              <ArrowRight className="w-3 h-3 text-[var(--color-text-muted)]" />
                              <span className="text-[10px] text-[var(--color-text-tertiary)]">
                                {Array.isArray(msg.recipients) ? msg.recipients.map(r => AGENT_META[r]?.name || r).join(', ') : msg.recipients}
                              </span>
                              <span className="ml-auto text-[8px] text-[var(--color-text-muted)]">
                                {new Date(msg.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-[var(--color-text-primary)] mb-0.5">{msg.subject}</p>
                            <p className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* CEO Executive Brief */}
          {ceoDecisions && (
            <div className="rounded-2xl border-2 border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-amber-500/5 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-600 to-amber-600 flex items-center justify-center shadow-lg">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[var(--color-text-primary)]">CEO Decision Brief</h3>
                  <p className="text-[9px] text-[var(--color-text-muted)]">Claude Opus 4.7 • {ceoDecisions.escalationsReviewed} escalation{ceoDecisions.escalationsReviewed !== 1 ? 's' : ''} reviewed</p>
                </div>
              </div>
              {ceoDecisions.messages && ceoDecisions.messages.length > 0 && (
                <div className="space-y-3">
                  {ceoDecisions.messages.map((msg: any, i: number) => (
                    <div key={i} className="p-4 rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border-default)]">
                      <div className="flex items-center gap-2 mb-2">
                        <Send className="w-3 h-3 text-yellow-400" />
                        <span className="text-[10px] font-bold text-yellow-400">To: {Array.isArray(msg.recipients) ? msg.recipients.map((r: string) => AGENT_META[r]?.name || r).join(', ') : msg.recipients}</span>
                      </div>
                      <p className="text-xs font-bold text-[var(--color-text-primary)] mb-1">{msg.subject}</p>
                      <p className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {messageBus.length === 0 && !isRunning && !error && (
        <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-8 h-8 text-purple-400" />
          </div>
          <h3 className="text-lg font-black text-[var(--color-text-primary)] mb-2">Ready to Deploy</h3>
          <p className="text-sm text-[var(--color-text-muted)] max-w-md mx-auto mb-6">
            Your agent team is standing by. Hit &ldquo;Run Team Cycle&rdquo; to trigger all 6 agents.
            They&apos;ll analyze your brand, competitors, and trends — then discuss amongst themselves
            and escalate proposals to the CEO for approval.
          </p>
          <div className="flex items-center justify-center gap-6 text-[10px] text-[var(--color-text-muted)]">
            {WAVE_LABELS.map(w => (
              <div key={w.num} className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-[var(--color-bg-hover)] flex items-center justify-center text-[9px] font-bold">{w.num}</span>
                {w.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
