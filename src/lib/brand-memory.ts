/**
 * Brand Memory — Learning System for Cadence AI Agent Team
 *
 * Agents write learnings after each cycle. Future cycles read these
 * to avoid repeating mistakes and amplify what works.
 *
 * THREE MEMORY TIERS:
 *   1. Wins     — posts/strategies that exceeded benchmarks
 *   2. Losses   — underperformers with reasons
 *   3. Rules    — derived heuristics ("carousels outperform statics 3:1 on IG")
 *
 * CONFIDENCE LEVELS:
 *   GREEN  — data-backed, cited from real metrics
 *   YELLOW — inferred from partial data, stated as such
 *   RED    — no data, pure assumption (requires human approval)
 *
 * QUESTION SYSTEM:
 *   Agents only ask questions when:
 *   - Confidence is below 60% AND the answer changes their output materially
 *   - The decision is irreversible (publishing, strategy shift)
 *   - It's a new precedent (first post for a new platform/pillar)
 *   Each question includes: what agent already knows, default path, why the answer matters
 */

// ── Memory Types ──

export type ConfidenceLevel = 'green' | 'yellow' | 'red'

export interface MemoryEntry {
  id: string
  timestamp: string
  agentId: string
  type: 'win' | 'loss' | 'rule'
  confidence: ConfidenceLevel
  platform?: string
  contentType?: string // carousel, reel, static, thread, etc.
  pillar?: string
  metric?: string // e.g., "4.2% engagement" or "142 likes"
  description: string
  citation: string // data source — must be specific or "ASSUMPTION: [reasoning]"
  tags: string[]
}

export interface SmartQuestion {
  id: string
  timestamp: string
  agentId: string
  agentName: string
  question: string
  context: string          // what the agent already knows
  defaultPath: string      // what agent will do WITHOUT an answer
  whyItMatters: string     // how the answer changes the output
  confidence: number       // 0-1, must be below 0.6 to ask
  urgency: 'low' | 'medium' | 'high'
  category: 'strategy' | 'content' | 'scheduling' | 'creative' | 'competitive'
  status: 'pending' | 'answered' | 'expired'
  userAnswer?: string
  expiresAt?: string       // questions expire — agents don't wait forever
}

export interface BrandMemoryStore {
  brandId: string
  lastUpdated: string
  wins: MemoryEntry[]
  losses: MemoryEntry[]
  rules: MemoryEntry[]
  pendingQuestions: SmartQuestion[]
  answeredQuestions: SmartQuestion[]
  // Derived insights — auto-generated from wins/losses
  platformInsights: Record<string, {
    bestContentTypes: string[]
    bestPostingTimes: string[]
    avgEngagementRate: number
    topHookPatterns: string[]
    avoidPatterns: string[]
  }>
  cycleCount: number       // how many team cycles have run
  totalLearnings: number
}

// ── Brand Memory Manager ──

export class BrandMemory {
  private store: BrandMemoryStore

  constructor(brandId: string, existingStore?: BrandMemoryStore) {
    this.store = existingStore || {
      brandId,
      lastUpdated: new Date().toISOString(),
      wins: [],
      losses: [],
      rules: [],
      pendingQuestions: [],
      answeredQuestions: [],
      platformInsights: {},
      cycleCount: 0,
      totalLearnings: 0,
    }
  }

  // ── Write Operations ──

  addWin(entry: Omit<MemoryEntry, 'id' | 'timestamp' | 'type'>): MemoryEntry {
    const win: MemoryEntry = {
      ...entry,
      id: `win_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      type: 'win',
    }
    this.store.wins.push(win)
    this.store.totalLearnings++
    this.store.lastUpdated = new Date().toISOString()
    return win
  }

  addLoss(entry: Omit<MemoryEntry, 'id' | 'timestamp' | 'type'>): MemoryEntry {
    const loss: MemoryEntry = {
      ...entry,
      id: `loss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      type: 'loss',
    }
    this.store.losses.push(loss)
    this.store.totalLearnings++
    this.store.lastUpdated = new Date().toISOString()
    return loss
  }

  addRule(entry: Omit<MemoryEntry, 'id' | 'timestamp' | 'type'>): MemoryEntry {
    const rule: MemoryEntry = {
      ...entry,
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      type: 'rule',
    }
    this.store.rules.push(rule)
    this.store.totalLearnings++
    this.store.lastUpdated = new Date().toISOString()
    return rule
  }

  addQuestion(q: Omit<SmartQuestion, 'id' | 'timestamp' | 'status'>): SmartQuestion {
    const question: SmartQuestion = {
      ...q,
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    }
    this.store.pendingQuestions.push(question)
    this.store.lastUpdated = new Date().toISOString()
    return question
  }

  answerQuestion(questionId: string, answer: string): void {
    const idx = this.store.pendingQuestions.findIndex(q => q.id === questionId)
    if (idx !== -1) {
      const q = this.store.pendingQuestions[idx]
      q.status = 'answered'
      q.userAnswer = answer
      this.store.answeredQuestions.push(q)
      this.store.pendingQuestions.splice(idx, 1)
      this.store.lastUpdated = new Date().toISOString()
    }
  }

  // ── Read Operations ──

  getWinsForPlatform(platform: string): MemoryEntry[] {
    return this.store.wins.filter(w => w.platform === platform)
  }

  getLossesForPlatform(platform: string): MemoryEntry[] {
    return this.store.losses.filter(l => l.platform === platform)
  }

  getRulesForAgent(agentId: string): MemoryEntry[] {
    return this.store.rules.filter(r => r.agentId === agentId)
  }

  getGreenRules(): MemoryEntry[] {
    return this.store.rules.filter(r => r.confidence === 'green')
  }

  getPendingQuestions(): SmartQuestion[] {
    const now = new Date().toISOString()
    return this.store.pendingQuestions.filter(q => !q.expiresAt || q.expiresAt > now)
  }

  getAnsweredQuestions(): SmartQuestion[] {
    return this.store.answeredQuestions
  }

  // ── Context Generation for Agent Prompts ──

  /**
   * Generates a compact memory context string to inject into agent prompts.
   * Agents receive this so they know what the brand has learned.
   */
  getContextForAgent(agentId: string, platform?: string): string {
    const sections: string[] = []

    // Relevant wins
    const wins = platform
      ? this.store.wins.filter(w => w.platform === platform).slice(-10)
      : this.store.wins.slice(-15)
    if (wins.length > 0) {
      sections.push(`WHAT WORKS FOR THIS BRAND (${wins.length} data points):\n${wins.map(w =>
        `  [${w.confidence.toUpperCase()}] ${w.description} — ${w.citation}`
      ).join('\n')}`)
    }

    // Relevant losses
    const losses = platform
      ? this.store.losses.filter(l => l.platform === platform).slice(-10)
      : this.store.losses.slice(-10)
    if (losses.length > 0) {
      sections.push(`WHAT DOESN'T WORK (avoid these patterns):\n${losses.map(l =>
        `  [${l.confidence.toUpperCase()}] ${l.description} — ${l.citation}`
      ).join('\n')}`)
    }

    // Active rules
    const rules = this.store.rules.filter(r =>
      r.agentId === agentId || r.confidence === 'green'
    ).slice(-15)
    if (rules.length > 0) {
      sections.push(`LEARNED RULES:\n${rules.map(r =>
        `  [${r.confidence.toUpperCase()}] ${r.description}`
      ).join('\n')}`)
    }

    // Answered questions (brand preferences)
    const answered = this.store.answeredQuestions.slice(-10)
    if (answered.length > 0) {
      sections.push(`BRAND PREFERENCES (from user answers):\n${answered.map(a =>
        `  Q: ${a.question}\n  A: ${a.userAnswer}`
      ).join('\n')}`)
    }

    if (sections.length === 0) {
      return 'BRAND MEMORY: No learnings yet. This is the first cycle.'
    }

    return `BRAND MEMORY (${this.store.totalLearnings} learnings across ${this.store.cycleCount} cycles):\n\n${sections.join('\n\n')}`
  }

  // ── Reflection — Run after each cycle to derive new rules ──

  deriveInsights(): { newRules: MemoryEntry[]; platformSummaries: Record<string, string> } {
    const newRules: MemoryEntry[] = []
    const platformSummaries: Record<string, string> = {}

    // Group wins/losses by platform + content type
    const byPlatform: Record<string, { wins: MemoryEntry[]; losses: MemoryEntry[] }> = {}

    for (const w of this.store.wins) {
      const key = w.platform || 'unknown'
      if (!byPlatform[key]) byPlatform[key] = { wins: [], losses: [] }
      byPlatform[key].wins.push(w)
    }
    for (const l of this.store.losses) {
      const key = l.platform || 'unknown'
      if (!byPlatform[key]) byPlatform[key] = { wins: [], losses: [] }
      byPlatform[key].losses.push(l)
    }

    for (const [platform, data] of Object.entries(byPlatform)) {
      // Find winning content types
      const winTypes: Record<string, number> = {}
      for (const w of data.wins) {
        if (w.contentType) winTypes[w.contentType] = (winTypes[w.contentType] || 0) + 1
      }
      const lossTypes: Record<string, number> = {}
      for (const l of data.losses) {
        if (l.contentType) lossTypes[l.contentType] = (lossTypes[l.contentType] || 0) + 1
      }

      const sortedWinTypes = Object.entries(winTypes).sort((a, b) => b[1] - a[1])
      const sortedLossTypes = Object.entries(lossTypes).sort((a, b) => b[1] - a[1])

      if (sortedWinTypes.length > 0) {
        const topType = sortedWinTypes[0]
        if (topType[1] >= 3) { // Need at least 3 data points
          const rule = this.addRule({
            agentId: 'strategist',
            confidence: 'green',
            platform,
            contentType: topType[0],
            description: `On ${platform}, ${topType[0]} content consistently outperforms (${topType[1]} wins recorded)`,
            citation: `Derived from ${topType[1]} tracked wins on ${platform}`,
            tags: ['auto-derived', 'content-type', platform],
          })
          newRules.push(rule)
        }
      }

      platformSummaries[platform] = `${data.wins.length} wins, ${data.losses.length} losses. Top format: ${sortedWinTypes[0]?.[0] || 'unknown'}. Avoid: ${sortedLossTypes[0]?.[0] || 'none flagged'}.`
    }

    return { newRules, platformSummaries }
  }

  // ── Serialization ──

  getStore(): BrandMemoryStore {
    return { ...this.store }
  }

  incrementCycle(): void {
    this.store.cycleCount++
    this.store.lastUpdated = new Date().toISOString()
  }
}
