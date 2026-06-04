/**
 * POST /api/apify/track-post
 *
 * Scrapes a published post URL to get current engagement metrics.
 * Called when user marks a post as published, and again at 24h, 48h, 7d intervals.
 *
 * Body: { postUrl, platform, brandId }
 * Returns: { metrics: { likes, comments, shares, saves, views, engagementRate } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { scrapeProfile, type SocialPlatform } from '@/lib/apify-social'

export const maxDuration = 120

// Platform URL → handle extraction
function extractHandleFromUrl(url: string, platform: string): string | null {
  try {
    const u = new URL(url)
    switch (platform) {
      case 'instagram': {
        // https://instagram.com/p/ABC123 → get profile from /p/ post
        // https://instagram.com/username → username
        const match = u.pathname.match(/^\/([^/]+)\/?$/) || u.pathname.match(/^\/reel\//)
        if (u.pathname.includes('/p/') || u.pathname.includes('/reel/')) {
          // For post URLs, we can't easily get the handle, return null
          return null
        }
        return u.pathname.split('/').filter(Boolean)[0] || null
      }
      case 'x': {
        // https://x.com/username/status/123
        return u.pathname.split('/').filter(Boolean)[0] || null
      }
      case 'linkedin': {
        // https://linkedin.com/feed/update/urn:li:activity:123
        // https://linkedin.com/posts/company-slug-123
        return null // LinkedIn post URLs are hard to reverse
      }
      case 'tiktok': {
        // https://tiktok.com/@username/video/123
        const tiktokMatch = u.pathname.match(/@([^/]+)/)
        return tiktokMatch ? tiktokMatch[1] : null
      }
      case 'youtube': {
        // https://youtube.com/watch?v=ABC or shorts/ABC
        return null // YouTube video URLs don't contain channel handle
      }
      default:
        return null
    }
  } catch {
    return null
  }
}

// Map platform display names to SocialPlatform keys
function normalizePlatform(platform: string): SocialPlatform | null {
  const map: Record<string, SocialPlatform> = {
    'instagram': 'instagram',
    'meta (instagram & facebook)': 'instagram',
    'linkedin': 'linkedin',
    'x (twitter)': 'x',
    'x': 'x',
    'twitter': 'x',
    'tiktok': 'tiktok',
    'youtube': 'youtube',
  }
  return map[platform.toLowerCase()] || null
}

export async function POST(req: NextRequest) {
  try {
    const { postUrl, platform, brandId, handle } = await req.json()

    if (!postUrl || !platform) {
      return NextResponse.json({ error: 'Missing postUrl and platform' }, { status: 400 })
    }

    const normalizedPlatform = normalizePlatform(platform)
    if (!normalizedPlatform) {
      return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 })
    }

    // Try to extract handle from URL, or use the provided one
    const postHandle = handle || extractHandleFromUrl(postUrl, normalizedPlatform)

    if (!postHandle) {
      return NextResponse.json({
        error: 'Could not extract handle from URL. Please provide the handle separately.',
        needsHandle: true,
      }, { status: 400 })
    }

    // Use Apify to scrape the profile's recent posts and find our post
    const result = await scrapeProfile(normalizedPlatform, postHandle, 10)

    if (!result || result.posts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Could not fetch post metrics. The post may be too new or the account may be private.',
      })
    }

    // Try to find the specific post by URL matching
    let matchedPost = result.posts.find(p =>
      p.postUrl && postUrl.includes(p.postUrl.split('/').pop() || '__nomatch__')
    )

    // If no exact match, return the most recent post as a best guess
    // (user likely just published it, so it's the latest)
    if (!matchedPost) {
      matchedPost = result.posts[0]
    }

    const followers = result.profile.followers || 1
    const engagementRate = ((matchedPost.likes + matchedPost.comments + matchedPost.shares + matchedPost.saves) / followers) * 100

    return NextResponse.json({
      success: true,
      metrics: {
        likes: matchedPost.likes,
        comments: matchedPost.comments,
        shares: matchedPost.shares,
        saves: matchedPost.saves,
        views: matchedPost.views,
        engagementRate: Math.round(engagementRate * 100) / 100,
        postUrl: matchedPost.postUrl,
        postedAt: matchedPost.postedAt,
        followers,
      },
      profile: {
        handle: result.profile.handle,
        displayName: result.profile.displayName,
        followers: result.profile.followers,
      },
    })
  } catch (err: any) {
    console.error('Track post error:', err)
    return NextResponse.json({ error: err.message || 'Failed to track post' }, { status: 500 })
  }
}
