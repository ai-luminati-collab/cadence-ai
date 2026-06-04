/**
 * Multi-Agent Orchestrator — Cadence AI AGI Layer
 *
 * HIERARCHY:
 *   CEO Agent (Claude Opus 4.7)
 *     └── Makes final decisions, reviews all agent outputs, proposes Brand OS changes
 *     └── Only model with authority to modify the Brand OS
 *
 *   Worker Agents (GPT-5.5 or Gemini 2.5 Pro)
 *     ├── Performance Analyst — reads metrics, identifies trends, explains WHY
 *     ├── Competitor Scout — monitors competitor activity, spots opportunities
 *     ├── Content Strategist — proposes calendar/format adjustments based on data
 *     └── Quality Auditor — scores content, flags anti-patterns
 *
 * FLOW:
 *   1. Worker agents run independently on their data domains
 *   2. Each produces a structured report (JSON)
 *   3. CEO agent receives ALL worker reports
 *   4. CEO synthesizes, cross-references, and produces:
 *      - Validated insights (approved/rejected worker findings)
 *      - Brand OS change proposals (with evidence + expected impact)
 *      - Priority actions for the user
 *
 * RULES:
 *   - Workers NEVER modify the Brand OS directly
 *   - CEO can PROPOSE changes but user must approve
 *   - All proposals include evidence (data citations) and risk level
 *   - If workers disagree, CEO makes the call and explains why
 */

import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

// ── Model Configuration ──

const CEO_MODEL_CHAIN = [
  'claude-opus-4-7',       // CEO: Claude Opus 4.7 — absolute authority
  'claude-opus-4-6',       // Fallback CEO
  'claude-sonnet-4-6',     // Emergency fallback
]

// Worker model: GPT-5.5 (primary) or Gemini 2.5 Pro (secondary)
const WORKER_MODEL = 'gpt-5.5'
// const WORKER_MODEL_FALLBACK = 'gemini-2.5-pro'  // TODO: Add Gemini client when needed

// ── Agent Types ──

export type AgentRole = 'performance_analyst' | 'competitor_scout' | 'content_strategist' | 'quality_auditor'

export interface AgentReport {
  agentRole: AgentRole
  agentModel: string
  timestamp: string
  findings: AgentFinding[]
  rawAnalysis: string
  confidence: number  // 0-1
  executionTimeMs: number
}

export interface AgentFinding {
  type: 'insight' | 'warning' | 'opportunity' | 'recommendation'
  title: string
  description: string
  evidence: string       // Data citations
  impact: 'high' | 'medium' | 'low'
  confidence: number     // 0-1
}

export interface CEODecision {
  timestamp: string
  executionTimeMs: number
  validatedInsights: ValidatedInsight[]
  brandOSProposals: BrandOSProposal[]
  priorityActions: PriorityAction[]
  executiveSummary: string
  workerPerformance: Partial<Record<AgentRole, { confidence: number; accepted: number; rejected: number }>>
}

export interface ValidatedInsight {
  sourceAgent: AgentRole
  finding: AgentFinding
  ceoVerdict: 'approved' | 'rejected' | 'modified'
  ceoReasoning: string
  modifiedDescription?: string  // If CEO modified the finding
}

export interface BrandOSProposal {
  id: string
  type: 'pillar_weight' | 'format_mix' | 'tone_shift' | 'new_bucket' | 'kill_bucket' | 'cadence_change' | 'narrative_shift'
  title: string
  description: string
  evidence: string[]          // Which agent findings support this
  expectedImpact: string
  riskLevel: 'low' | 'medium' | 'high'
  proposedChange: Record<string, any>  // The actual Brand OS field changes
}

export interface PriorityAction {
  urgency: 'immediate' | 'this_week' | 'this_month'
  action: string
  reasoning: string
}

// ── Worker Agent System Prompts ──

const WORKER_SYSTEM_PROMPTS: Record<AgentRole, string> = {
  performance_analyst: `You are a Performance Analyst agent for a social media brand.

YOUR JOB: Analyze post performance data and extract actionable insights.

WHAT YOU DO:
1. Compare engagement rates across posts, pillars, formats, and platforms
2. Identify top performers and explain WHY they worked (hook type? topic? timing? format?)
3. Identify bottom performers and explain WHY they failed
4. Spot trends over time (is engagement rising/falling? which pillars are gaining/losing?)
5. Calculate benchmarks: what's this brand's average engagement rate per platform?

OUTPUT FORMAT: Return valid JSON matching this schema:
{
  "findings": [
    {
      "type": "insight" | "warning" | "opportunity" | "recommendation",
      "title": "Short title",
      "description": "Detailed explanation",
      "evidence": "Specific data: 'Carousels averaged 4.2% vs Reels at 1.8%'",
      "impact": "high" | "medium" | "low",
      "confidence": 0.0 to 1.0
    }
  ],
  "summary": "2-3 sentence executive summary",
  "confidence": 0.0 to 1.0
}

RULES:
- Be SPECIFIC. Don't say "engagement is good" — say "engagement rate is 3.2%, which is above the 2.1% industry average for this niche"
- Every finding MUST have concrete evidence with numbers
- If the data is too thin to draw conclusions, say so — don't fabricate insights
- Rank findings by impact: high-impact first`,

  competitor_scout: `You are a Competitor Scout agent for a social media brand.

YOUR JOB: Analyze competitor data and identify opportunities/threats.

WHAT YOU DO:
1. Compare competitor engagement rates vs the brand's
2. Detect new campaigns (sudden shift in messaging, hashtags, frequency)
3. Identify content gaps: what are competitors doing that this brand isn't?
4. Spot viral content patterns from competitors that could be adapted
5. Track competitor posting frequency and format preferences

OUTPUT FORMAT: Return valid JSON matching this schema:
{
  "findings": [
    {
      "type": "insight" | "warning" | "opportunity" | "recommendation",
      "title": "Short title",
      "description": "Detailed explanation",
      "evidence": "Specific data from competitor posts",
      "impact": "high" | "medium" | "low",
      "confidence": 0.0 to 1.0
    }
  ],
  "summary": "2-3 sentence executive summary",
  "confidence": 0.0 to 1.0
}

RULES:
- Focus on ACTIONABLE opportunities, not just observations
- "Competitor X does Y" is useless without "...and here's how the brand could respond"
- Flag genuine threats (competitors entering brand's niche) separately from noise
- If competitor data is thin, say so honestly`,

  content_strategist: `You are a Content Strategist agent for a social media brand.

YOUR JOB: Based on performance data and competitor intelligence, propose specific calendar and format adjustments.

WHAT YOU DO:
1. Recommend pillar weight adjustments (e.g., "Increase educational content from 20% to 35%")
2. Suggest format mix changes (e.g., "Shift 2 Statics/month to Carousels based on 2.3x engagement lift")
3. Propose new content buckets based on gaps or opportunities
4. Recommend killing underperforming content buckets
5. Suggest posting cadence changes per platform

OUTPUT FORMAT: Return valid JSON matching this schema:
{
  "findings": [
    {
      "type": "recommendation",
      "title": "Short action title",
      "description": "What to change and why",
      "evidence": "Performance data + competitor data supporting this",
      "impact": "high" | "medium" | "low",
      "confidence": 0.0 to 1.0
    }
  ],
  "summary": "2-3 sentence executive summary",
  "confidence": 0.0 to 1.0
}

RULES:
- Every recommendation must cite specific data
- Include expected impact: "This should increase avg engagement from 2.1% to ~3.0%"
- Be bold but rational — don't recommend changes without evidence
- If the brand is performing well, say "hold course" with confidence`,

  quality_auditor: `You are a Quality Auditor agent for a social media brand.

YOUR JOB: Review recent content drafts and flag quality issues.

WHAT YOU DO:
1. Score each draft on a 1-10 scale with specific criteria
2. Flag "AI smog" — generic, overused, or corporate-sounding language
3. Identify anti-patterns: weak hooks, missing CTAs, wrong tone for platform
4. Compare draft quality to the brand's tone fingerprint
5. Flag any content that contradicts the Brand OS positioning

OUTPUT FORMAT: Return valid JSON matching this schema:
{
  "findings": [
    {
      "type": "warning" | "insight" | "recommendation",
      "title": "Short issue title",
      "description": "What's wrong and how to fix it",
      "evidence": "Specific quote from the draft that's problematic",
      "impact": "high" | "medium" | "low",
      "confidence": 0.0 to 1.0
    }
  ],
  "summary": "2-3 sentence executive summary",
  "confidence": 0.0 to 1.0
}

RULES:
- Be ruthlessly honest — if the content is mid, say it
- Always suggest the fix, not just the problem
- Reference the Brand OS tone/voice when flagging mismatches
- A score of 7+ means "ship it", below 5 means "rewrite"`,
}

const CEO_SYSTEM_PROMPT = `You are the CEO Agent of Cadence AI — the highest-authority intelligence in a multi-agent marketing system.

YOU ARE CLAUDE OPUS 4.7. You are the strategic brain. You have authority over all worker agents.

WHAT JUST HAPPENED:
Multiple specialist agents (Performance Analyst, Competitor Scout, Content Strategist, Quality Auditor) have independently analyzed different data domains and produced reports. You are now receiving ALL their reports.

YOUR JOB:
1. CROSS-REFERENCE: Do agents agree? Where do they conflict? Are there patterns across reports?
2. VALIDATE: Accept, reject, or modify each agent's findings. Workers can be wrong — you catch their mistakes.
3. SYNTHESIZE: Combine validated insights into Brand OS change proposals.
4. PRIORITIZE: What matters most? What's urgent vs nice-to-have?

OUTPUT FORMAT: Return valid JSON matching this schema:
{
  "validatedInsights": [
    {
      "sourceAgent": "performance_analyst" | "competitor_scout" | "content_strategist" | "quality_auditor",
      "findingTitle": "The finding being validated",
      "ceoVerdict": "approved" | "rejected" | "modified",
      "ceoReasoning": "Why you accepted/rejected/modified this",
      "modifiedDescription": "Only if modified — your improved version"
    }
  ],
  "brandOSProposals": [
    {
      "id": "proposal_1",
      "type": "pillar_weight" | "format_mix" | "tone_shift" | "new_bucket" | "kill_bucket" | "cadence_change" | "narrative_shift",
      "title": "Short proposal title",
      "description": "What to change",
      "evidence": ["Agent finding 1", "Agent finding 2"],
      "expectedImpact": "What should happen if this is approved",
      "riskLevel": "low" | "medium" | "high",
      "proposedChange": { "field": "value" }
    }
  ],
  "priorityActions": [
    {
      "urgency": "immediate" | "this_week" | "this_month",
      "action": "What the user should do",
      "reasoning": "Why this matters now"
    }
  ],
  "executiveSummary": "3-5 sentence summary for the user. Written like a sharp CMO briefing, not an AI report.",
  "workerPerformance": {
    "performance_analyst": { "confidence": 0.0-1.0, "accepted": 0, "rejected": 0 },
    "competitor_scout": { "confidence": 0.0-1.0, "accepted": 0, "rejected": 0 },
    "content_strategist": { "confidence": 0.0-1.0, "accepted": 0, "rejected": 0 },
    "quality_auditor": { "confidence": 0.0-1.0, "accepted": 0, "rejected": 0 }
  }
}

RULES:
- You are NOT a rubber stamp. REJECT findings that are vague, unsupported, or obvious.
- If two workers contradict each other, explain who's right and why.
- Brand OS proposals must be SPECIFIC and REVERSIBLE. No vague "improve content quality" garbage.
- The executive summary should read like a text from a brilliant CMO, not a report from an AI.
- If there's not enough data to act on, say "hold course" — don't force changes.
- NEVER fabricate data. If worker evidence is weak, flag it.`

// ── Orchestrator Class ──

export class AgentOrchestrator {
  private openai: OpenAI
  private anthropic: Anthropic

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  /**
   * Run a single worker agent on its data domain.
   */
  async runWorkerAgent(role: AgentRole, contextData: string): Promise<AgentReport> {
    const startTime = Date.now()

    try {
      const response = await this.openai.chat.completions.create({
        model: WORKER_MODEL,
        messages: [
          { role: 'system', content: WORKER_SYSTEM_PROMPTS[role] },
          { role: 'user', content: contextData },
        ],
        response_format: { type: 'json_object' },
      })

      const content = response.choices[0]?.message?.content || '{}'
      const parsed = JSON.parse(content)

      return {
        agentRole: role,
        agentModel: WORKER_MODEL,
        timestamp: new Date().toISOString(),
        findings: parsed.findings || [],
        rawAnalysis: parsed.summary || '',
        confidence: parsed.confidence || 0.5,
        executionTimeMs: Date.now() - startTime,
      }
    } catch (err: any) {
      console.error(`Worker agent ${role} failed:`, err.message)
      return {
        agentRole: role,
        agentModel: WORKER_MODEL,
        timestamp: new Date().toISOString(),
        findings: [],
        rawAnalysis: `Agent failed: ${err.message}`,
        confidence: 0,
        executionTimeMs: Date.now() - startTime,
      }
    }
  }

  /**
   * Run the CEO agent to synthesize all worker reports.
   */
  async runCEOAgent(workerReports: AgentReport[], brandContext: string): Promise<CEODecision> {
    const startTime = Date.now()

    // Format worker reports for the CEO
    const reportsText = workerReports.map(report => `
=== ${report.agentRole.toUpperCase()} REPORT ===
Model: ${report.agentModel}
Confidence: ${(report.confidence * 100).toFixed(0)}%
Execution Time: ${report.executionTimeMs}ms

Findings (${report.findings.length}):
${report.findings.map((f, i) => `  ${i + 1}. [${f.type.toUpperCase()}] [${f.impact}] ${f.title}
     ${f.description}
     Evidence: ${f.evidence}
     Confidence: ${(f.confidence * 100).toFixed(0)}%`).join('\n')}

Summary: ${report.rawAnalysis}
`).join('\n---\n')

    const userMessage = `BRAND CONTEXT:
${brandContext}

WORKER AGENT REPORTS:
${reportsText}

Synthesize these reports. Validate each finding, propose Brand OS changes where warranted, and write a sharp executive summary.`

    try {
      // Try CEO model chain
      for (const model of CEO_MODEL_CHAIN) {
        try {
          console.log(`🏛️ CEO Agent: Trying ${model}...`)
          const stream = await this.anthropic.messages.stream({
            model,
            max_tokens: 8000,
            system: CEO_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage }],
          })

          const response = await stream.finalMessage()
          const text = response.content[0]?.type === 'text' ? response.content[0].text : null

          if (text) {
            console.log(`✅ CEO Agent responded via ${model}`)
            const parsed = JSON.parse(text)

            return {
              timestamp: new Date().toISOString(),
              executionTimeMs: Date.now() - startTime,
              validatedInsights: (parsed.validatedInsights || []).map((v: any) => ({
                sourceAgent: v.sourceAgent,
                finding: workerReports
                  .flatMap(r => r.findings)
                  .find(f => f.title === v.findingTitle) || { type: 'insight', title: v.findingTitle, description: '', evidence: '', impact: 'medium', confidence: 0.5 },
                ceoVerdict: v.ceoVerdict,
                ceoReasoning: v.ceoReasoning,
                modifiedDescription: v.modifiedDescription,
              })),
              brandOSProposals: parsed.brandOSProposals || [],
              priorityActions: parsed.priorityActions || [],
              executiveSummary: parsed.executiveSummary || 'No summary generated.',
              workerPerformance: parsed.workerPerformance || {},
            }
          }
        } catch (err: any) {
          if (err?.status === 404 || err?.message?.includes('not_found')) {
            console.warn(`⚠️ CEO model ${model} not found, trying next...`)
            continue
          }
          throw err
        }
      }

      throw new Error('All CEO models failed')
    } catch (err: any) {
      console.error('CEO Agent failed:', err.message)
      return {
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime,
        validatedInsights: [],
        brandOSProposals: [],
        priorityActions: [{
          urgency: 'this_week',
          action: 'CEO agent encountered an error. Review worker reports manually.',
          reasoning: err.message,
        }],
        executiveSummary: 'CEO agent failed to process worker reports. Please review the raw data manually.',
        workerPerformance: {},
      }
    }
  }

  /**
   * Full orchestration: run all relevant workers in parallel, then CEO synthesizes.
   */
  async runFullAnalysis(params: {
    brandContext: string
    performanceData?: string
    competitorData?: string
    contentDrafts?: string
  }): Promise<{
    workerReports: AgentReport[]
    ceoDecision: CEODecision
    totalTimeMs: number
  }> {
    const startTime = Date.now()
    const workerJobs: Promise<AgentReport>[] = []

    // Run relevant workers in parallel
    if (params.performanceData) {
      workerJobs.push(this.runWorkerAgent('performance_analyst', params.performanceData))
    }
    if (params.competitorData) {
      workerJobs.push(this.runWorkerAgent('competitor_scout', params.competitorData))
    }
    if (params.performanceData || params.competitorData) {
      // Content strategist gets both performance + competitor data
      const stratContext = [
        params.performanceData ? `PERFORMANCE DATA:\n${params.performanceData}` : '',
        params.competitorData ? `COMPETITOR DATA:\n${params.competitorData}` : '',
      ].filter(Boolean).join('\n\n')
      workerJobs.push(this.runWorkerAgent('content_strategist', stratContext))
    }
    if (params.contentDrafts) {
      workerJobs.push(this.runWorkerAgent('quality_auditor', params.contentDrafts))
    }

    console.log(`🚀 Running ${workerJobs.length} worker agents in parallel...`)
    const workerReports = await Promise.all(workerJobs)

    console.log(`✅ All workers complete. Running CEO synthesis...`)
    const ceoDecision = await this.runCEOAgent(workerReports, params.brandContext)

    return {
      workerReports,
      ceoDecision,
      totalTimeMs: Date.now() - startTime,
    }
  }
}

// ── Singleton for server-side use ──
let _orchestrator: AgentOrchestrator | null = null
export function getOrchestrator(): AgentOrchestrator {
  if (!_orchestrator) _orchestrator = new AgentOrchestrator()
  return _orchestrator
}
