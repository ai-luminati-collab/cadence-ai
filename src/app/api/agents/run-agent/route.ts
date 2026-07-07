/**
 * POST /api/agents/run-agent
 *
 * Runs a SINGLE agent in the team. The frontend orchestrates the wave sequence
 * by calling this endpoint repeatedly, passing the accumulated message bus state
 * between calls. This keeps each call under 60s for Vercel Hobby plan.
 *
 * Body: {
 *   agentId: 'scout' | 'strategist' | 'planner' | 'copywriter' | 'creative' | 'trend_radar' | 'ceo',
 *   brandContext: string,
 *   inputContext: string,          // agent-specific data (competitor data, calendar, etc.)
 *   existingMessages: AgentMessage[], // accumulated bus from previous agents
 *   existingEscalations: EscalationPackage[], // accumulated escalations
 *   brandMemory?: BrandMemoryStore
 * }
 *
 * Returns: { messages, escalations, smartQuestions, memoryStore, agentName, timeMs }
 */

import { NextRequest, NextResponse } from 'next/server'
import { AgentTeam, type AgentId, type AgentMessage, type EscalationPackage } from '@/lib/agent-team'
import type { BrandMemoryStore } from '@/lib/brand-memory'
import { requireAuth } from '@/lib/api-auth'

const VALID_AGENT_IDS = new Set(['scout', 'strategist', 'planner', 'copywriter', 'creative', 'trend_radar', 'ceo'])

export const maxDuration = 60 // single agent — fits Hobby plan

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const { agentId, brandContext, inputContext, existingMessages, existingEscalations, brandMemory } = body

    if (!agentId || !brandContext) {
      return NextResponse.json({ error: 'Missing agentId or brandContext' }, { status: 400 })
    }

    if (!VALID_AGENT_IDS.has(agentId)) {
      return NextResponse.json({ error: 'Invalid agentId' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }
    if (!process.env.ANTHROPIC_API_KEY && agentId === 'ceo') {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const startTime = Date.now()

    // Create a fresh team instance but seed it with existing messages/escalations
    const team = new AgentTeam(brandMemory as BrandMemoryStore | undefined)

    if (!brandMemory && body.brandId) {
      team.setMemory(body.brandId)
    }

    // Replay existing messages onto the bus so this agent can read them
    if (existingMessages && Array.isArray(existingMessages)) {
      for (const msg of existingMessages) {
        team.postMessage({
          sender: msg.sender,
          recipients: msg.recipients,
          type: msg.type,
          subject: msg.subject,
          content: msg.content,
          data: msg.data,
          threadId: msg.threadId,
          sourceAgent: msg.sourceAgent || msg.sender,
        })
      }
    }

    // Replay existing escalations
    if (existingEscalations && Array.isArray(existingEscalations)) {
      for (const esc of existingEscalations) {
        team.replayEscalation(esc)
      }
    }

    // Run the single agent
    const fullContext = `BRAND CONTEXT:\n${brandContext}\n\n${inputContext || ''}`
    const result = await team.runAgent(agentId as AgentId, fullContext)

    const config = team.getConfig(agentId as AgentId)

    return NextResponse.json({
      success: true,
      agentId,
      agentName: config.name,
      agentEmoji: config.emoji,
      messages: result.messages,
      escalations: result.escalations,
      smartQuestions: result.questions,
      // Return full bus so next agent call gets everything
      fullMessageBus: team.getFullBus(),
      fullEscalations: team.getEscalations(),
      memoryStore: team.getMemory()?.getStore() || null,
      timeMs: Date.now() - startTime,
    })
  } catch (err: any) {
    console.error('Run agent error:', err)
    return NextResponse.json({
      error: err.message || 'Agent run failed',
      hint: err.message?.includes('timeout') ? 'Agent call timed out. Try again.' : undefined,
    }, { status: 500 })
  }
}
