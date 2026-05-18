/**
 * POST /api/agents/team-cycle
 *
 * Triggers the full autonomous agent team cycle:
 *   Wave 1: Scout + TrendRadar gather intelligence (parallel)
 *   Wave 2: Strategist processes intel
 *   Wave 3: Planner + Copywriter + Creative execute (parallel)
 *   Wave 4: CEO (Claude Opus 4.7) reviews all escalations
 *
 * Body: { brandContext, performanceData?, competitorData?, trendData?, calendarData?, draftData? }
 * Returns: { messageBus, escalations, ceoDecisions, totalTimeMs, agentActivity }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAgentTeam, type AgentId } from '@/lib/agent-team'

export const maxDuration = 300 // 5 min — multi-agent pipeline

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { brandContext, performanceData, competitorData, trendData, calendarData, draftData } = body

    if (!brandContext) {
      return NextResponse.json({ error: 'Missing brandContext' }, { status: 400 })
    }

    const team = getAgentTeam()

    const result = await team.runTeamCycle(brandContext, {
      performanceData,
      competitorData,
      trendData,
      calendarData,
      draftData,
    })

    // Build agent activity summary
    const agentActivity: Record<string, { messagesSent: number; escalationsRaised: number }> = {}
    const agentIds: AgentId[] = ['scout', 'strategist', 'planner', 'copywriter', 'creative', 'trend_radar', 'ceo']

    for (const id of agentIds) {
      agentActivity[id] = {
        messagesSent: result.messageBus.filter(m => m.sender === id).length,
        escalationsRaised: result.escalations.filter(e => e.contributingAgents.includes(id)).length,
      }
    }

    return NextResponse.json({
      success: true,
      messageBus: result.messageBus,
      escalations: result.escalations,
      ceoDecisions: result.ceoDecisions,
      totalTimeMs: result.totalTimeMs,
      agentActivity,
      meta: {
        totalMessages: result.messageBus.length,
        totalEscalations: result.escalations.length,
        agentsActive: Object.entries(agentActivity).filter(([_, v]) => v.messagesSent > 0).length,
      },
    })
  } catch (err: any) {
    console.error('Agent team cycle error:', err)
    return NextResponse.json({ error: err.message || 'Agent team cycle failed' }, { status: 500 })
  }
}
