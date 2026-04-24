import { NextRequest, NextResponse } from 'next/server'
import { generateStaticVisual, generateCarouselVisuals, generateStoryVisual } from '@/actions/imageGen'

// Image gen can take 30-60s for carousels (multiple slides)
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
      { success: false, error: error.message || 'Image generation failed' },
      { status: 500 }
    )
  }
}
