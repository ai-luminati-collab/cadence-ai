import { NextRequest, NextResponse } from 'next/server'
import { generateContentCalendar } from '@/actions/calendar'

// Vercel serverless: allow up to 5 minutes for calendar generation

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

    const {
      brandInfo,
      strategy,
      startDate,
      endDate,
      frequency,
      customEvents,
      topicals,
      tractionData,
      contentMatrix,
      selectedBuckets,
      bucketMode
    } = body

    if (!brandInfo || !strategy) {
      return NextResponse.json(
        { success: false, error: 'Missing brandInfo or strategy' },
        { status: 400 }
      )
    }

    const result = await generateContentCalendar(
      brandInfo,
      strategy,
      startDate,
      endDate,
      frequency || 'custom',
      customEvents || '',
      topicals || [],
      tractionData || '',
      undefined,
      undefined,
      contentMatrix,
      selectedBuckets,
      bucketMode
    )

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Calendar API error:', error)
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error.message) || 'Calendar generation failed' },
      { status: 500 }
    )
  }
}
