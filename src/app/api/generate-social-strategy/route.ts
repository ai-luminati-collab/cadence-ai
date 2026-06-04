import { NextRequest, NextResponse } from 'next/server'
import { generateSocialStrategy } from '@/actions/strategy'

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
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
  }

  const { brandInfo, marketingStrategy } = body
  if (!brandInfo || !marketingStrategy) {
    return NextResponse.json({ success: false, error: 'Missing brandInfo or marketingStrategy' }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(' ')) } catch {}
      }, 5000)

      try {
        const result = await generateSocialStrategy(brandInfo, marketingStrategy)
        clearInterval(heartbeat)
        controller.enqueue(encoder.encode('\n__JSON__\n' + JSON.stringify(result)))
        controller.close()
      } catch (error: any) {
        clearInterval(heartbeat)
        console.error('Social Strategy API error:', error)
        const errorPayload = {
          success: false,
          error: sanitizeRouteError(error.message) || 'Social strategy generation failed'
        }
        controller.enqueue(encoder.encode('\n__JSON__\n' + JSON.stringify(errorPayload)))
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache, no-store',
    }
  })
}
