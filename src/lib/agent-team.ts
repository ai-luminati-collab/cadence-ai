/**
 * Autonomous Agent Team — Cadence AI
 *
 * 6 specialist agents + 1 CEO that operate as a proactive marketing team.
 * Agents run autonomously, communicate via a shared message bus,
 * build on each other's work, and escalate finished proposals to the CEO.
 *
 * AGENTS:
 *   🔍 Scout        — Competition monitoring, market intelligence
 *   🧠 Strategist   — Content pillars, positioning, format mix
 *   📅 Planner      — Calendar, scheduling, timing optimization
 *   ✍️  Copywriter   — Social copy, captions, hooks, CTAs
 *   🎨 Creative     — Visual direction, image prompts, mood boards
 *   📡 TrendRadar   — Trending topics, cultural moments, virality signals
 *   👔 CEO          — Final authority, approves/rejects all proposals
 *
 * COMMUNICATION:
 *   Agents post messages to a shared bus. Each message has:
 *   - sender (which agent)
 *   - recipients (which agents should read this, or 'all' or 'ceo')
 *   - type: 'finding' | 'request' | 'proposal' | 'response' | 'escalation'
 *   - content: structured data
 *
 * WORKFLOW:
 *   1. Agents run on triggers (schedule, event, or another agent's message)
 *   2. Agent reads relevant messages from the bus
 *   3. Agent does its work (AI call + data)
 *   4. Agent posts results back to the bus
 *   5. When agents have a complete proposal chain, they package it as an 'escalation'
 *   6. CEO reviews all escalations and makes decisions
 */

import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

// ── Agent Definitions ──

export type AgentId = 'scout' | 'strategist' | 'planner' | 'copywriter' | 'creative' | 'trend_radar' | 'ceo'

export interface AgentConfig {
  id: AgentId
  name: string
  emoji: string
  role: string
  model: 'gpt-5.5' | 'claude-opus-4-7'
  systemPrompt: string
  triggers: AgentTrigger[]
  canMessageAgents: AgentId[]  // which agents this one can directly message
}

export type AgentTrigger =
  | { type: 'schedule'; cronExpression: string }     // e.g., '0 8 * * 1' = every Monday 8am
  | { type: 'event'; eventName: string }             // e.g., 'new_competitor_data'
  | { type: 'message'; fromAgent: AgentId }          // triggered when another agent posts

// ── Message Bus ──

export interface AgentMessage {
  id: string
  timestamp: string
  sender: AgentId
  recipients: AgentId[] | 'all' | 'ceo'
  type: 'finding' | 'request' | 'proposal' | 'response' | 'escalation'
  subject: string
  content: string           // Structured content the receiving agent can parse
  data?: Record<string, any>  // Optional structured data
  threadId?: string         // Groups related messages into a conversation
  parentMessageId?: string  // Reply to a specific message
  status: 'pending' | 'read' | 'acted_on'
}

export interface EscalationPackage {
  id: string
  timestamp: string
  threadId: string
  title: string
  summary: string
  contributingAgents: AgentId[]
  messageChain: AgentMessage[]  // The full conversation that led to this
  proposedActions: ProposedAction[]
  urgency: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending_ceo' | 'approved' | 'rejected' | 'modified'
  ceoResponse?: string
}

export interface ProposedAction {
  type: 'create_post' | 'modify_calendar' | 'update_strategy' | 'update_brand_os' | 'alert_user' | 'scrape_competitor'
  description: string
  agent: AgentId           // Which agent proposed this
  confidence: number
  data: Record<string, any>
}

// ── Agent System Prompts ──

const AGENT_CONFIGS: Record<AgentId, Omit<AgentConfig, 'triggers'>> = {
  scout: {
    id: 'scout',
    name: 'Scout',
    emoji: '🔍',
    role: 'Competition & Market Intelligence',
    model: 'gpt-5.5',
    systemPrompt: `You are Scout, the Competition & Market Intelligence agent on a social media marketing team.

YOUR ROLE: You are the team's eyes and ears on the competitive landscape. You scrape competitor accounts, detect campaigns, spot content gaps, and flag threats/opportunities.

WHAT YOU DO:
- Analyze competitor post data (engagement, formats, topics, hashtags, frequency)
- Detect new campaigns (sudden messaging shifts, new hashtag series, frequency spikes)
- Identify content gaps (what competitors do that our brand doesn't)
- Flag viral competitor content that could be adapted
- Track competitor audience growth trends

HOW YOU COMMUNICATE:
- When you find something important, message the Strategist with your intelligence
- If you spot a trending topic competitors are jumping on, alert TrendRadar
- If you find a visual style working for competitors, message Creative
- Package urgent competitive threats as escalations to the CEO

RULES:
- Always cite specific data: "Competitor X's carousel got 5.2% engagement vs their 1.8% average"
- Don't just report what competitors do — explain what it MEANS for our brand
- Flag genuine threats separately from noise
- If data is thin, say so — never fabricate intelligence

OUTPUT: Always respond in valid JSON:
{
  "messages": [{ "to": "agent_id", "type": "finding|request|proposal", "subject": "...", "content": "...", "data": {} }],
  "escalations": [{ "title": "...", "summary": "...", "urgency": "low|medium|high|critical", "proposedActions": [{ "type": "...", "description": "...", "confidence": 0.0-1.0, "data": {} }] }]
}`,
    canMessageAgents: ['strategist', 'trend_radar', 'creative', 'ceo'],
  },

  strategist: {
    id: 'strategist',
    name: 'Strategist',
    emoji: '🧠',
    role: 'Content Strategy & Positioning',
    model: 'gpt-5.5',
    systemPrompt: `You are Strategist, the Content Strategy & Positioning agent on a social media marketing team.

YOUR ROLE: You own the content pillars, format mix, and brand positioning. You decide WHAT content to create and WHY — based on performance data, competitive intelligence, and brand goals.

WHAT YOU DO:
- Analyze performance data to optimize pillar weights (which topics get more/less content)
- Adjust format mix based on what's working (more carousels? fewer statics?)
- Respond to competitive intelligence from Scout with strategic recommendations
- Propose new content buckets or kill underperforming ones
- Keep the brand's positioning sharp and differentiated

HOW YOU COMMUNICATE:
- When Scout sends competitive intel, respond with strategic implications
- Send content briefs to Planner for calendar placement
- Send messaging direction to Copywriter for execution
- Package major strategy shifts as escalations to the CEO

RULES:
- Every recommendation must cite specific performance data
- "Do more of what works" is not a strategy — explain the mechanism
- Be bold but reversible — propose experiments, not permanent shifts
- Protect the brand's positioning — don't chase competitors into their territory

OUTPUT: Always respond in valid JSON:
{
  "messages": [{ "to": "agent_id", "type": "finding|request|proposal", "subject": "...", "content": "...", "data": {} }],
  "escalations": [{ "title": "...", "summary": "...", "urgency": "low|medium|high|critical", "proposedActions": [{ "type": "...", "description": "...", "confidence": 0.0-1.0, "data": {} }] }]
}`,
    canMessageAgents: ['planner', 'copywriter', 'scout', 'ceo'],
  },

  planner: {
    id: 'planner',
    name: 'Planner',
    emoji: '📅',
    role: 'Calendar & Scheduling',
    model: 'gpt-5.5',
    systemPrompt: `You are Planner, the Calendar & Scheduling agent on a social media marketing team.

YOUR ROLE: You own the content calendar. You decide WHEN posts go out, on which platform, and in what format. You optimize for timing, frequency, and content distribution.

WHAT YOU DO:
- Schedule content based on Strategist's briefs
- Optimize posting times based on engagement data (best days/hours per platform)
- Balance content across pillars, formats, and platforms
- Incorporate trending topics from TrendRadar with proper timing
- Ensure adequate spacing between similar content types

HOW YOU COMMUNICATE:
- Receive content briefs from Strategist → slot them into the calendar
- Receive trending topics from TrendRadar → find urgent slots for reactive content
- Send scheduled posts to Copywriter for copy creation
- Package calendar changes as escalations to the CEO for major shifts

OUTPUT: Always respond in valid JSON:
{
  "messages": [{ "to": "agent_id", "type": "finding|request|proposal", "subject": "...", "content": "...", "data": {} }],
  "escalations": [{ "title": "...", "summary": "...", "urgency": "low|medium|high|critical", "proposedActions": [{ "type": "...", "description": "...", "confidence": 0.0-1.0, "data": {} }] }]
}`,
    canMessageAgents: ['copywriter', 'strategist', 'trend_radar', 'ceo'],
  },

  copywriter: {
    id: 'copywriter',
    name: 'Copywriter',
    emoji: '✍️',
    role: 'Social Media Copy & Hooks',
    model: 'gpt-5.5',
    systemPrompt: `You are Copywriter, the Social Media Copy agent on a social media marketing team.

YOUR ROLE: You write the actual social media copy — captions, hooks, CTAs, hashtag strategies. You execute the Strategist's direction into platform-native content.

WHAT YOU DO:
- Write hooks that stop the scroll (based on what's performing for the brand)
- Craft captions that match the brand's tone fingerprint exactly
- Create platform-specific copy (Instagram vs LinkedIn vs X have different rules)
- Write multiple hook variants for A/B testing
- Incorporate trending topics and cultural references naturally

HOW YOU COMMUNICATE:
- Receive content briefs from Planner → write the actual copy
- Ask Creative for visual direction to ensure copy+visual alignment
- Send drafted copy to Strategist for tone/positioning check if uncertain
- Flag any copy that feels off-brand to the CEO

OUTPUT: Always respond in valid JSON:
{
  "messages": [{ "to": "agent_id", "type": "finding|request|proposal", "subject": "...", "content": "...", "data": {} }],
  "escalations": [{ "title": "...", "summary": "...", "urgency": "low|medium|high|critical", "proposedActions": [{ "type": "...", "description": "...", "confidence": 0.0-1.0, "data": {} }] }]
}`,
    canMessageAgents: ['creative', 'strategist', 'planner', 'ceo'],
  },

  creative: {
    id: 'creative',
    name: 'Creative',
    emoji: '🎨',
    role: 'Visual Direction & Image Prompts',
    model: 'gpt-5.5',
    systemPrompt: `You are Creative, the Visual Direction agent on a social media marketing team.

YOUR ROLE: You own the visual identity. You create image prompts, mood references, and visual direction for every post. You ensure visual consistency across the brand.

WHAT YOU DO:
- Create detailed image generation prompts for each post
- Define visual mood boards and reference styles
- Ensure visual consistency with the Brand Universe (lighting, composition, color grading)
- Respond to Copywriter's copy with aligned visual direction
- Spot visual trends from competitors (via Scout) and adapt them to the brand

HOW YOU COMMUNICATE:
- Receive copy from Copywriter → create aligned visual direction
- Receive competitor visual intel from Scout → adapt trends
- Send visual briefs to Planner for complete post packages
- Package major visual identity shifts as escalations to the CEO

OUTPUT: Always respond in valid JSON:
{
  "messages": [{ "to": "agent_id", "type": "finding|request|proposal", "subject": "...", "content": "...", "data": {} }],
  "escalations": [{ "title": "...", "summary": "...", "urgency": "low|medium|high|critical", "proposedActions": [{ "type": "...", "description": "...", "confidence": 0.0-1.0, "data": {} }] }]
}`,
    canMessageAgents: ['copywriter', 'planner', 'scout', 'ceo'],
  },

  trend_radar: {
    id: 'trend_radar',
    name: 'TrendRadar',
    emoji: '📡',
    role: 'Trending Topics & Cultural Moments',
    model: 'gpt-5.5',
    systemPrompt: `You are TrendRadar, the Trending Topics & Cultural Moments agent on a social media marketing team.

YOUR ROLE: You monitor trending topics, viral content, cultural moments, and timely opportunities. You're the team's antenna for what's happening NOW.

WHAT YOU DO:
- Identify trending hashtags, topics, and memes relevant to the brand's niche
- Spot cultural moments the brand can authentically join
- Detect viral content formats/templates the brand could adapt
- Monitor platform-specific trends (Instagram Reels trends, X topics, TikTok sounds)
- Flag time-sensitive opportunities that expire if not acted on quickly

HOW YOU COMMUNICATE:
- Alert Planner about urgent trending topics that need immediate calendar slots
- Tell Strategist about emerging trends that could become content pillars
- Message Scout to check if competitors are jumping on the same trends
- Package critical time-sensitive trends as escalations to the CEO

RULES:
- Only flag trends RELEVANT to the brand — not every viral moment
- Always assess: "Can this brand authentically participate, or would it feel forced?"
- Time-sensitivity is key: flag the urgency level (hours, days, weeks)
- Cultural sensitivity check: flag any trends that could backfire

OUTPUT: Always respond in valid JSON:
{
  "messages": [{ "to": "agent_id", "type": "finding|request|proposal", "subject": "...", "content": "...", "data": {} }],
  "escalations": [{ "title": "...", "summary": "...", "urgency": "low|medium|high|critical", "proposedActions": [{ "type": "...", "description": "...", "confidence": 0.0-1.0, "data": {} }] }]
}`,
    canMessageAgents: ['planner', 'strategist', 'scout', 'ceo'],
  },

  ceo: {
    id: 'ceo',
    name: 'CEO',
    emoji: '👔',
    role: 'Final Authority & Brand OS Guardian',
    model: 'claude-opus-4-7',
    systemPrompt: `You are the CEO of Cadence AI's marketing agent team. You are Claude Opus 4.7 — the highest authority.

YOUR TEAM:
- 🔍 Scout: Competitive intelligence
- 🧠 Strategist: Content strategy & positioning
- 📅 Planner: Calendar & scheduling
- ✍️ Copywriter: Social copy & hooks
- 🎨 Creative: Visual direction
- 📡 TrendRadar: Trending topics & cultural moments

YOUR ROLE: You receive escalation packages from your team. Each package contains:
1. The full conversation chain between agents
2. Their proposed actions
3. Their confidence levels and urgency assessment

YOUR JOB:
1. REVIEW: Read the full conversation. Did agents think this through?
2. VALIDATE: Is the evidence solid? Are the proposals smart?
3. DECIDE: Approve, reject, or modify each proposed action
4. DIRECT: If you see something the team missed, send them back with instructions

DECISION FRAMEWORK:
- If data is strong + risk is low + multiple agents agree → APPROVE
- If data is thin but opportunity is time-sensitive → APPROVE with monitoring
- If agents disagree on approach → Make the call and explain why
- If proposal could damage brand positioning → REJECT with reason
- If proposal is good but timing is wrong → MODIFY with new timing

OUTPUT: Return valid JSON:
{
  "decisions": [
    {
      "escalationId": "...",
      "verdict": "approved" | "rejected" | "modified",
      "reasoning": "Why you made this call",
      "modifications": "Only if modified — what you changed",
      "directivesToTeam": [{ "to": "agent_id", "instruction": "..." }]
    }
  ],
  "executiveBrief": "2-3 sentence summary of what's happening and what you decided. Written like a sharp CMO, not an AI."
}`,
    canMessageAgents: ['scout', 'strategist', 'planner', 'copywriter', 'creative', 'trend_radar'],
  },
}

// ── Agent Team Engine ──

export class AgentTeam {
  private openai: OpenAI
  private anthropic: Anthropic
  private messageBus: AgentMessage[] = []
  private escalations: EscalationPackage[] = []

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  getConfig(agentId: AgentId): typeof AGENT_CONFIGS[AgentId] {
    return AGENT_CONFIGS[agentId]
  }

  getAllConfigs() {
    return AGENT_CONFIGS
  }

  // ── Message Bus Operations ──

  postMessage(message: Omit<AgentMessage, 'id' | 'timestamp' | 'status'>): AgentMessage {
    const msg: AgentMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      status: 'pending',
    }
    this.messageBus.push(msg)
    return msg
  }

  getMessagesForAgent(agentId: AgentId): AgentMessage[] {
    return this.messageBus.filter(m =>
      m.recipients === 'all' ||
      (m.recipients === 'ceo' && agentId === 'ceo') ||
      (Array.isArray(m.recipients) && m.recipients.includes(agentId))
    )
  }

  getThread(threadId: string): AgentMessage[] {
    return this.messageBus.filter(m => m.threadId === threadId).sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }

  getFullBus(): AgentMessage[] {
    return [...this.messageBus]
  }

  getEscalations(): EscalationPackage[] {
    return [...this.escalations]
  }

  getPendingEscalations(): EscalationPackage[] {
    return this.escalations.filter(e => e.status === 'pending_ceo')
  }

  // ── Run a Single Agent ──

  async runAgent(agentId: AgentId, inputContext: string, threadId?: string): Promise<{
    messages: AgentMessage[]
    escalations: EscalationPackage[]
  }> {
    const config = AGENT_CONFIGS[agentId]
    if (!config) throw new Error(`Unknown agent: ${agentId}`)

    // Gather context: relevant messages from the bus
    const inboxMessages = this.getMessagesForAgent(agentId)
    const threadMessages = threadId ? this.getThread(threadId) : []

    const conversationContext = inboxMessages.length > 0
      ? `\n\nMESSAGES IN YOUR INBOX:\n${inboxMessages.map(m =>
          `[From: ${m.sender}] [${m.type}] ${m.subject}\n${m.content}`
        ).join('\n\n---\n\n')}`
      : ''

    const threadContext = threadMessages.length > 0
      ? `\n\nCURRENT THREAD:\n${threadMessages.map(m =>
          `[${m.sender} → ${Array.isArray(m.recipients) ? m.recipients.join(',') : m.recipients}] ${m.subject}: ${m.content}`
        ).join('\n')}`
      : ''

    const fullPrompt = `${inputContext}${conversationContext}${threadContext}

Based on the above context, do your job. Post messages to relevant team members and escalate to CEO if warranted.`

    // Call the appropriate model
    let responseText: string

    if (config.model === 'claude-opus-4-7') {
      responseText = await this.callCEO(config.systemPrompt, fullPrompt)
    } else {
      responseText = await this.callWorker(config.systemPrompt, fullPrompt)
    }

    // Parse agent's response
    const parsed = this.safeParseJSON(responseText)
    const currentThreadId = threadId || `thread_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

    // Post messages to the bus
    const postedMessages: AgentMessage[] = []
    for (const msg of (parsed.messages || [])) {
      const toAgent = msg.to as AgentId
      if (config.canMessageAgents.includes(toAgent) || toAgent === 'ceo') {
        const posted = this.postMessage({
          sender: agentId,
          recipients: [toAgent],
          type: msg.type || 'finding',
          subject: msg.subject || '',
          content: msg.content || '',
          data: msg.data,
          threadId: currentThreadId,
        })
        postedMessages.push(posted)
      }
    }

    // Create escalation packages
    const newEscalations: EscalationPackage[] = []
    for (const esc of (parsed.escalations || [])) {
      const escalation: EscalationPackage = {
        id: `esc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        threadId: currentThreadId,
        title: esc.title || 'Untitled Escalation',
        summary: esc.summary || '',
        contributingAgents: [agentId],
        messageChain: this.getThread(currentThreadId),
        proposedActions: (esc.proposedActions || []).map((a: any) => ({
          type: a.type || 'alert_user',
          description: a.description || '',
          agent: agentId,
          confidence: a.confidence || 0.5,
          data: a.data || {},
        })),
        urgency: esc.urgency || 'medium',
        status: 'pending_ceo',
      }
      this.escalations.push(escalation)
      newEscalations.push(escalation)
    }

    // Mark inbox messages as read
    for (const msg of inboxMessages) {
      msg.status = 'acted_on'
    }

    return { messages: postedMessages, escalations: newEscalations }
  }

  // ── Run a Full Team Cycle ──
  // This is the main orchestration: agents run in waves, communicate, then CEO decides

  async runTeamCycle(brandContext: string, dataContext: {
    performanceData?: string
    competitorData?: string
    trendData?: string
    calendarData?: string
    draftData?: string
  }): Promise<{
    messageBus: AgentMessage[]
    escalations: EscalationPackage[]
    ceoDecisions: any
    totalTimeMs: number
  }> {
    const startTime = Date.now()

    // ── WAVE 1: Data gatherers run in parallel ──
    // Scout + TrendRadar gather raw intelligence
    console.log('🌊 Wave 1: Scout + TrendRadar gathering intelligence...')
    const wave1 = await Promise.all([
      dataContext.competitorData
        ? this.runAgent('scout', `BRAND CONTEXT:\n${brandContext}\n\nCOMPETITOR DATA:\n${dataContext.competitorData}`)
        : Promise.resolve({ messages: [], escalations: [] }),
      dataContext.trendData
        ? this.runAgent('trend_radar', `BRAND CONTEXT:\n${brandContext}\n\nTRENDING DATA:\n${dataContext.trendData}`)
        : Promise.resolve({ messages: [], escalations: [] }),
    ])

    // ── WAVE 2: Strategist processes intel ──
    // Reads Scout + TrendRadar messages, formulates strategy
    console.log('🌊 Wave 2: Strategist processing intelligence...')
    const stratContext = `BRAND CONTEXT:\n${brandContext}\n\n${dataContext.performanceData ? `PERFORMANCE DATA:\n${dataContext.performanceData}` : ''}`
    const wave2 = await this.runAgent('strategist', stratContext)

    // ── WAVE 3: Planner + Copywriter + Creative work together ──
    // They read Strategist's direction and produce content
    console.log('🌊 Wave 3: Planner + Copywriter + Creative executing...')
    const wave3 = await Promise.all([
      this.runAgent('planner', `BRAND CONTEXT:\n${brandContext}\n\n${dataContext.calendarData ? `CURRENT CALENDAR:\n${dataContext.calendarData}` : ''}`),
      this.runAgent('copywriter', `BRAND CONTEXT:\n${brandContext}\n\n${dataContext.draftData ? `RECENT DRAFTS:\n${dataContext.draftData}` : ''}`),
      this.runAgent('creative', `BRAND CONTEXT:\n${brandContext}`),
    ])

    // ── WAVE 4: CEO reviews all escalations ──
    console.log('🌊 Wave 4: CEO reviewing escalations...')
    const pendingEscalations = this.getPendingEscalations()
    let ceoDecisions: any = null

    if (pendingEscalations.length > 0) {
      const escalationBrief = pendingEscalations.map(esc => `
=== ESCALATION: ${esc.title} ===
Urgency: ${esc.urgency}
Contributing Agents: ${esc.contributingAgents.join(', ')}
Summary: ${esc.summary}

Message Chain:
${esc.messageChain.map(m => `  [${m.sender}] ${m.subject}: ${m.content}`).join('\n')}

Proposed Actions:
${esc.proposedActions.map(a => `  - [${a.agent}] ${a.description} (confidence: ${(a.confidence * 100).toFixed(0)}%)`).join('\n')}
`).join('\n\n---\n\n')

      const ceoResult = await this.runAgent('ceo',
        `BRAND CONTEXT:\n${brandContext}\n\nFULL MESSAGE BUS:\n${this.messageBus.map(m => `[${m.sender} → ${Array.isArray(m.recipients) ? m.recipients.join(',') : m.recipients}] ${m.subject}: ${m.content}`).join('\n')}\n\nESCALATIONS REQUIRING YOUR DECISION:\n${escalationBrief}`
      )

      // Parse CEO decisions
      const ceoMessages = ceoResult.messages
      ceoDecisions = {
        messages: ceoMessages,
        escalationsReviewed: pendingEscalations.length,
      }
    }

    return {
      messageBus: this.getFullBus(),
      escalations: this.getEscalations(),
      ceoDecisions,
      totalTimeMs: Date.now() - startTime,
    }
  }

  // ── Model Callers ──

  private async callWorker(systemPrompt: string, userMessage: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5.5',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
      })
      return response.choices[0]?.message?.content || '{}'
    } catch (err: any) {
      console.error('Worker call failed:', err.message)
      return JSON.stringify({ messages: [], escalations: [], error: err.message })
    }
  }

  private async callCEO(systemPrompt: string, userMessage: string): Promise<string> {
    const models = ['claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6']

    for (const model of models) {
      try {
        console.log(`👔 CEO: Trying ${model}...`)
        const stream = await this.anthropic.messages.stream({
          model,
          max_tokens: 8000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        })
        const response = await stream.finalMessage()
        const text = response.content[0]?.type === 'text' ? response.content[0].text : null
        if (text) {
          console.log(`✅ CEO responded via ${model}`)
          return text
        }
      } catch (err: any) {
        if (err?.status === 404) continue
        throw err
      }
    }
    return JSON.stringify({ decisions: [], executiveBrief: 'CEO failed to respond.' })
  }

  private safeParseJSON(text: string): any {
    try {
      // Try direct parse
      return JSON.parse(text)
    } catch {
      // Try extracting JSON from markdown code block
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (match) {
        try { return JSON.parse(match[1]) } catch {}
      }
      // Try finding first { to last }
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start !== -1 && end !== -1) {
        try { return JSON.parse(text.slice(start, end + 1)) } catch {}
      }
      return { messages: [], escalations: [] }
    }
  }
}

// ── Singleton ──
let _team: AgentTeam | null = null
export function getAgentTeam(): AgentTeam {
  if (!_team) _team = new AgentTeam()
  return _team
}
