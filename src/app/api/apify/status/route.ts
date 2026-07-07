/**
 * GET /api/apify/status?brandId=xxx
 *
 * Returns competitor profiles and recent posts from BigQuery
 * for the given brand. Used by the Competitor Intel dashboard.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { getProfiles, getCompetitorPosts, getBrandEngagementStats } from '@/lib/bigquery'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  try {
    const brandId = req.nextUrl.searchParams.get('brandId')
    if (!brandId) {
      return NextResponse.json({ error: 'Missing brandId' }, { status: 400 })
    }

    const [profiles, posts, brandStats] = await Promise.all([
      getProfiles(brandId).catch(() => []),
      getCompetitorPosts(brandId, undefined, 50).catch(() => []),
      getBrandEngagementStats(brandId).catch(() => ({
        totalPosts: 0, avgEngagement: 0, topPlatform: null, postsByPlatform: {},
      })),
    ])

    // Group posts by competitor
    const competitorMap: Record<string, any> = {}
    for (const profile of profiles.filter((p: any) => p.profile_type === 'competitor')) {
      competitorMap[profile.handle] = {
        ...profile,
        recentPosts: [],
        avgEngagement: 0,
        topPost: null,
      }
    }

    for (const post of posts) {
      const handle = post.handle || post.profile_id?.split('_').pop()
      if (competitorMap[handle]) {
        competitorMap[handle].recentPosts.push(post)
      }
    }

    // Calculate avg engagement per competitor
    for (const comp of Object.values(competitorMap) as any[]) {
      const postsWithEng = comp.recentPosts.filter((p: any) => p.engagement_rate != null)
      if (postsWithEng.length > 0) {
        comp.avgEngagement = postsWithEng.reduce((a: number, p: any) => a + p.engagement_rate, 0) / postsWithEng.length
        comp.topPost = postsWithEng.sort((a: any, b: any) => b.engagement_rate - a.engagement_rate)[0]
      }
    }

    return NextResponse.json({
      success: true,
      competitors: Object.values(competitorMap),
      brandProfiles: profiles.filter((p: any) => p.profile_type === 'brand'),
      brandStats,
    })
  } catch (err: any) {
    console.error('Apify status error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
