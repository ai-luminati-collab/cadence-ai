import { NextRequest, NextResponse } from 'next/server'
import { generateContentCalendar } from '@/actions/calendar'

// Vercel serverless: allow up to 5 minutes for calendar generation
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
      { success: false, error: error.message || 'Calendar generation failed' },
      { status: 500 }
    )
  }
}
