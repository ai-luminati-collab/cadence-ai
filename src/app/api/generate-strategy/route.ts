import { NextRequest, NextResponse } from 'next/server'
import { generateBrandStrategy } from '@/actions/strategy'

// Vercel serverless: allow up to 5 minutes for strategy generation (Claude Opus)

function sanitizeRouteError(msg: any): string {
  if (!msg || typeof msg !== 'string') return 'An unexpected error occurred.';
  const patterns = [
    [/credit balance|insufficient.?funds|billing/i, 'AI service temporarily unavailable.'],
    [/rate.?limit|too many requests|overloaded/i, 'AI engine is busy. Please try again.'],
    [/invalid.?api.?key|authentication|permission/i, 'Service configuration error.'],
    [/context.?length|too.?long|token.?limit/i, 'Content too large for processing.'],
    [/timeout|timed.?out|ETIMEDOUT/i, 'Request timed out.'],
    [/not valid JSON|Unexpected token/i, 'AI returned unexpected response.'],
    [/sk-[a-zA-Z0-9]/i, 'An unexpected error occurred.'],
  ];
  for (const [pat, safe] of (patterns as [RegExp, string][])) { if (pat.test(msg)) return safe; }
  if (msg.startsWith('{') || msg.length > 200) return 'An unexpected error occurred.';
  return msg;
}

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { brandInfo, isRefresh } = body

    if (!brandInfo) {
      return NextResponse.json(
        { success: false, error: 'Missing brandInfo' },
        { status: 400 }
      )
    }

    const result = await generateBrandStrategy(brandInfo, isRefresh || false)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Strategy API error:', error)
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error.message) || 'Strategy generation failed' },
      { status: 500 }
    )
  }
}
