/**
 * POST /api/agents/analyze
 *
 * Triggers the full multi-agent analysis pipeline:
 *   1. Worker agents (GPT-5.5) analyze performance, competitors, content quality in parallel
 *   2. CEO agent (Claude Opus 4.7) synthesizes all reports and proposes Brand OS changes
 *
 * Body: { brandId, brandContext, performanceData?, competitorData?, contentDrafts? }
 * Returns: { workerReports, ceoDecision, totalTimeMs }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getOrchestrator } from '@/lib/agent-orchestrator'

export const maxDuration = 300 // 5 min max — multi-agent pipeline

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const { brandContext, performanceData, competitorData, contentDrafts } = body

    if (!brandContext) {
      return NextResponse.json({ error: 'Missing brandContext' }, { status: 400 })
    }

    // At least one data source must be provided
    if (!performanceData && !competitorData && !contentDrafts) {
      return NextResponse.json({ error: 'At least one data source is required (performanceData, competitorData, or contentDrafts)' }, { status: 400 })
    }

    const orchestrator = getOrchestrator()

    const result = await orchestrator.runFullAnalysis({
      brandContext,
      performanceData,
      competitorData,
      contentDrafts,
    })

    return NextResponse.json({
      success: true,
      ...result,
      meta: {
        workersRun: result.workerReports.length,
        totalFindings: result.workerReports.reduce((a, r) => a + r.findings.length, 0),
        proposalsGenerated: result.ceoDecision.brandOSProposals.length,
        totalTimeMs: result.totalTimeMs,
      },
    })
  } catch (err: any) {
    console.error('Agent analysis error:', err)
    return NextResponse.json({ error: err.message || 'Agent analysis failed' }, { status: 500 })
  }
}
