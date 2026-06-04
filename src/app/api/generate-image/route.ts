import { NextRequest, NextResponse } from 'next/server'
import { generateStaticVisual, generateCarouselVisuals, generateStoryVisual } from '@/actions/imageGen'

// Image gen can take 30-60s for carousels (multiple slides)

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

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { post, draft, brandInfo, strategy, format, model, slideCount } = body

    if (!post || !draft || !brandInfo || !strategy) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    let result: any

    if (format === 'Carousel') {
      result = await generateCarouselVisuals(post, draft, brandInfo, strategy, slideCount || 3, model)
    } else if (format === 'Story') {
      result = await generateStoryVisual(post, draft, brandInfo, strategy, model)
    } else {
      result = await generateStaticVisual(post, draft, brandInfo, strategy, model)
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Image gen API error:', error)
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error.message) || 'Image generation failed' },
      { status: 500 }
    )
  }
}
