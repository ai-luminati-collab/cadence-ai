/**
 * POST /api/agents/team-cycle
 *
 * Triggers the full autonomous agent team cycle with learning memory:
 *   Wave 1: Scout + TrendRadar gather intelligence (parallel)
 *   Wave 2: Strategist processes intel
 *   Wave 3: Planner + Copywriter + Creative execute (parallel)
 *   Wave 4: CEO reviews escalations + validates smart questions
 *   Post-cycle: Memory reflection — derives new rules from wins/losses
 *
 * Body: { brandContext, performanceData?, competitorData?, trendData?, calendarData?, draftData?, brandMemory? }
 * Returns: { messageBus, escalations, ceoDecisions, smartQuestions, memoryStore, totalTimeMs, agentActivity }
 */

import { NextRequest, NextResponse } from 'next/server'
import { resetAgentTeam, type AgentId } from '@/lib/agent-team'
import type { BrandMemoryStore } from '@/lib/brand-memory'

export const maxDuration = 300 // 5 min — multi-agent pipeline

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { brandContext, performanceData, competitorData, trendData, calendarData, draftData, brandMemory } = body

    if (!brandContext) {
      return NextResponse.json({ error: 'Missing brandContext' }, { status: 400 })
    }

    // Check API keys are configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured. Add it to Vercel environment variables.' }, { status: 500 })
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured. Add it to Vercel environment variables.' }, { status: 500 })
    }

    // Reset team for fresh cycle, inject brand memory if available
    const team = resetAgentTeam(brandMemory as BrandMemoryStore | undefined)

    // If no memory store was passed but we have a brandId, create fresh memory
    if (!brandMemory && body.brandId) {
      team.setMemory(body.brandId)
    }

    const result = await team.runTeamCycle(brandContext, {
      performanceData,
      competitorData,
      trendData,
      calendarData,
      draftData,
    })

    // Build agent activity summary
    const agentActivity: Record<string, { messagesSent: number; escalationsRaised: number; learningsProduced: number }> = {}
    const agentIds: AgentId[] = ['scout', 'strategist', 'planner', 'copywriter', 'creative', 'trend_radar', 'ceo']

    for (const id of agentIds) {
      agentActivity[id] = {
        messagesSent: result.messageBus.filter(m => m.sender === id).length,
        escalationsRaised: result.escalations.filter(e => e.contributingAgents.includes(id)).length,
        learningsProduced: 0, // counted from memory store
      }
    }

    // Count learnings per agent from memory
    if (result.memoryStore) {
      const allEntries = [...result.memoryStore.wins, ...result.memoryStore.losses, ...result.memoryStore.rules]
      for (const entry of allEntries) {
        if (agentActivity[entry.agentId]) {
          agentActivity[entry.agentId].learningsProduced++
        }
      }
    }

    return NextResponse.json({
      success: true,
      messageBus: result.messageBus,
      escalations: result.escalations,
      ceoDecisions: result.ceoDecisions,
      smartQuestions: result.smartQuestions,
      memoryStore: result.memoryStore,
      totalTimeMs: result.totalTimeMs,
      agentActivity,
      meta: {
        totalMessages: result.messageBus.length,
        totalEscalations: result.escalations.length,
        totalSmartQuestions: result.smartQuestions.length,
        totalLearnings: result.memoryStore?.totalLearnings || 0,
        cycleNumber: result.memoryStore?.cycleCount || 1,
        agentsActive: Object.entries(agentActivity).filter(([_, v]) => v.messagesSent > 0).length,
      },
    })
  } catch (err: any) {
    console.error('Agent team cycle error:', err)
    const errorMessage = err.message || 'Agent team cycle failed'
    const errorDetail = err.status ? `API returned ${err.status}: ${errorMessage}` : errorMessage
    return NextResponse.json({
      error: errorDetail,
      errorType: err.constructor?.name || 'Unknown',
      hint: errorMessage.includes('timeout') || errorMessage.includes('FUNCTION_INVOCATION_TIMEOUT')
        ? 'The function timed out. Vercel free plan has a 60s limit. Upgrade to Pro for 300s.'
        : errorMessage.includes('401') || errorMessage.includes('Incorrect API key')
        ? 'API key is invalid. Check OPENAI_API_KEY and ANTHROPIC_API_KEY in Vercel env vars.'
        : undefined,
    }, { status: 500 })
  }
}
