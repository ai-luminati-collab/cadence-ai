import { NextRequest, NextResponse } from 'next/server'
import { generateBrandStrategy } from '@/actions/strategy'

// Vercel serverless: allow up to 5 minutes for strategy generation (Claude Opus)
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
      { success: false, error: error.message || 'Strategy generation failed' },
      { status: 500 }
    )
  }
}
