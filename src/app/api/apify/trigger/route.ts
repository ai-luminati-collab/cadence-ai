/**
 * POST /api/apify/trigger
 *
 * Triggers an Apify scrape for a social media handle.
 * Body: { brandId, platform, handle, profileType, postsLimit? }
 *
 * Returns: { runId, jobId }
 */

import { NextRequest, NextResponse } from 'next/server'
import { triggerScrape, type SocialPlatform } from '@/lib/apify-social'
import { insertScrapeJob, ensureBigQueryTables } from '@/lib/bigquery'
import { randomUUID } from 'crypto'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { brandId, platform, handle, profileType = 'competitor', postsLimit = 30 } = body

    if (!brandId || !platform || !handle) {
      return NextResponse.json({ error: 'Missing required fields: brandId, platform, handle' }, { status: 400 })
    }

    const validPlatforms: SocialPlatform[] = ['instagram', 'linkedin', 'x', 'tiktok', 'youtube']
    if (!validPlatforms.includes(platform as SocialPlatform)) {
      return NextResponse.json({ error: `Invalid platform. Valid: ${validPlatforms.join(', ')}` }, { status: 400 })
    }

    // Ensure BigQuery tables exist
    await ensureBigQueryTables()

    // Build webhook URL. Prefer the stable production domain over
    // VERCEL_URL (which is the per-deployment URL and may sit behind
    // Vercel Deployment Protection, bouncing Apify's callbacks).
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const webhookSecret = process.env.APIFY_WEBHOOK_SECRET?.trim()
    if (!webhookSecret) {
      return NextResponse.json({ error: 'APIFY_WEBHOOK_SECRET is not set — refusing to register an unauthenticated webhook' }, { status: 503 })
    }
    const webhookUrl = `${baseUrl}/api/apify/webhook?secret=${encodeURIComponent(webhookSecret)}&brandId=${brandId}&platform=${platform}&handle=${encodeURIComponent(handle)}&profileType=${profileType}`

    // Trigger the Apify scrape
    const { runId } = await triggerScrape(platform as SocialPlatform, handle, {
      postsLimit,
      webhookUrl,
    })

    // Log the job in BigQuery
    const jobId = randomUUID()
    await insertScrapeJob({
      id: jobId,
      brand_id: brandId,
      apify_run_id: runId,
      platform,
      handle: handle.replace(/^@/, ''),
      profile_type: profileType,
      status: 'running',
      posts_scraped: 0,
      triggered_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      runId,
      jobId,
      message: `Scrape triggered for ${platform}/@${handle}. Results will arrive via webhook.`,
    })
  } catch (err: any) {
    console.error('Apify trigger error:', err)
    return NextResponse.json({ error: err.message || 'Failed to trigger scrape' }, { status: 500 })
  }
}
