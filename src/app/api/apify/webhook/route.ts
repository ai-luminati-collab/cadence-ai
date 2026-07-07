/**
 * POST /api/apify/webhook
 *
 * Receives results when an Apify actor run completes.
 * Query params: brandId, platform, handle, profileType
 * Body: Apify webhook payload with { resource: { id, defaultDatasetId, status } }
 *
 * Normalizes the scraped data and stores it in BigQuery.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRunResults, type SocialPlatform } from '@/lib/apify-social'
import {
  insertSocialProfile,
  insertSocialPosts,
  updateScrapeJob,
  ensureBigQueryTables,
} from '@/lib/bigquery'
import { randomUUID } from 'crypto'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const brandId = searchParams.get('brandId')
    const platform = searchParams.get('platform') as SocialPlatform
    const handle = searchParams.get('handle')
    const profileType = searchParams.get('profileType') || 'competitor'

    if (!brandId || !platform || !handle) {
      return NextResponse.json({ error: 'Missing query params' }, { status: 400 })
    }

    const body = await req.json()
    const runId = body?.resource?.id
    const status = body?.resource?.status

    if (status !== 'SUCCEEDED') {
      // Update job status to failed
      if (runId) {
        await updateScrapeJob(runId, {
          status: 'failed',
          error_message: `Actor run status: ${status}`,
          completed_at: new Date().toISOString(),
        }).catch(() => {})
      }
      return NextResponse.json({ message: 'Run did not succeed', status })
    }

    await ensureBigQueryTables()

    // Fetch results from Apify
    const items = await getRunResults(runId)
    if (!items || items.length === 0) {
      return NextResponse.json({ message: 'No results from Apify run' })
    }

    // Normalize and store
    const now = new Date().toISOString()
    const profileId = `${brandId}_${platform}_${handle.replace(/^@/, '')}`

    // Extract profile data from first item (platform-specific)
    const profileData = extractProfileFromItems(platform, handle, items)
    if (profileData) {
      await insertSocialProfile({
        id: profileId,
        brand_id: brandId,
        platform,
        handle: handle.replace(/^@/, ''),
        profile_type: profileType,
        display_name: profileData.displayName,
        bio: profileData.bio,
        followers: profileData.followers,
        following: profileData.following,
        post_count: profileData.postCount,
        profile_url: profileData.profileUrl,
        avatar_url: profileData.avatarUrl,
        last_scraped_at: now,
        created_at: now,
      }).catch(err => {
        // Profile might already exist — that's fine, BQ doesn't have upsert
        console.warn('Profile insert warning (may already exist):', err.message)
      })
    }

    // Insert posts
    const posts = normalizePostsFromItems(platform, handle, items)
    const bqPosts = posts.map((post: any) => ({
      id: randomUUID(),
      profile_id: profileId,
      brand_id: brandId,
      platform,
      post_url: post.postUrl,
      post_type: post.postType,
      caption: (post.caption || '').substring(0, 10000), // BQ limit
      hashtags: post.hashtags,
      media_urls: post.mediaUrls,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      saves: post.saves,
      views: post.views,
      engagement_rate: profileData?.followers
        ? ((post.likes + post.comments + post.shares + post.saves) / profileData.followers) * 100
        : null,
      posted_at: post.postedAt,
      scraped_at: now,
      profile_type: profileType,
    }))

    if (bqPosts.length > 0) {
      await insertSocialPosts(bqPosts)
    }

    // Update scrape job
    await updateScrapeJob(runId, {
      status: 'succeeded',
      posts_scraped: bqPosts.length,
      completed_at: now,
    }).catch(() => {})

    console.log(`✅ Webhook processed: ${platform}/@${handle} — ${bqPosts.length} posts stored`)

    return NextResponse.json({
      success: true,
      postsStored: bqPosts.length,
      profile: profileData ? { handle: profileData.displayName, followers: profileData.followers } : null,
    })
  } catch (err: any) {
    console.error('Webhook processing error:', err)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

// ── Helper: Extract profile from raw Apify items ──

function extractProfileFromItems(platform: SocialPlatform, handle: string, items: any[]) {
  const first = items[0]
  if (!first) return null
  const clean = handle.replace(/^@/, '')

  switch (platform) {
    case 'instagram': {
      const o = first.ownerProfile || first.owner || {}
      return {
        displayName: o.fullName || o.full_name || clean,
        bio: o.biography || '',
        followers: o.followersCount || o.edge_followed_by?.count || 0,
        following: o.followingCount || o.edge_follow?.count || 0,
        postCount: o.postsCount || 0,
        profileUrl: `https://instagram.com/${clean}`,
        avatarUrl: o.profilePicUrl || '',
      }
    }
    case 'linkedin':
      return {
        displayName: first.name || clean,
        bio: first.description || first.tagline || '',
        followers: first.followersCount || first.followerCount || 0,
        following: 0,
        postCount: items.length,
        profileUrl: `https://linkedin.com/company/${clean}`,
        avatarUrl: first.logoUrl || '',
      }
    case 'x': {
      const u = first.user || first.author || {}
      return {
        displayName: u.name || clean,
        bio: u.description || '',
        followers: u.followersCount || u.followers_count || 0,
        following: u.followingCount || u.friends_count || 0,
        postCount: u.statusesCount || 0,
        profileUrl: `https://x.com/${clean}`,
        avatarUrl: u.profileImageUrl || '',
      }
    }
    case 'tiktok': {
      const a = first.authorMeta || first.author || {}
      return {
        displayName: a.name || a.nickname || clean,
        bio: a.signature || '',
        followers: a.fans || a.followerCount || 0,
        following: a.following || 0,
        postCount: a.video || items.length,
        profileUrl: `https://tiktok.com/@${clean}`,
        avatarUrl: a.avatar || '',
      }
    }
    case 'youtube':
      return {
        displayName: first.channelName || first.channelTitle || clean,
        bio: first.channelDescription || '',
        followers: first.numberOfSubscribers || first.subscriberCount || 0,
        following: 0,
        postCount: first.numberOfVideos || items.length,
        profileUrl: `https://youtube.com/@${clean}`,
        avatarUrl: first.channelProfilePicUrl || '',
      }
    default:
      return null
  }
}

// ── Helper: Normalize posts from raw Apify items ──

function normalizePostsFromItems(platform: SocialPlatform, handle: string, items: any[]) {
  const clean = handle.replace(/^@/, '')

  switch (platform) {
    case 'instagram':
      return items.map(item => ({
        postUrl: item.url || `https://instagram.com/p/${item.shortCode || ''}`,
        postType: item.type || (item.isVideo ? 'reel' : item.childPosts ? 'carousel' : 'static'),
        caption: item.caption || '',
        hashtags: (item.hashtags || []).map((h: any) => typeof h === 'string' ? h : h?.name || ''),
        mediaUrls: [item.displayUrl || item.thumbnailUrl || ''].filter(Boolean),
        likes: item.likesCount || 0,
        comments: item.commentsCount || 0,
        shares: 0,
        saves: 0,
        views: item.videoViewCount || 0,
        postedAt: item.timestamp ? new Date(item.timestamp * 1000).toISOString() : new Date().toISOString(),
      }))

    case 'linkedin': {
      const postItems = items[0]?.posts || items.filter((i: any) => i.text || i.postUrl)
      return postItems.map((item: any) => ({
        postUrl: item.postUrl || item.url || '',
        postType: item.type || 'text',
        caption: item.text || item.content || '',
        hashtags: (item.text || '').match(/#\w+/g) || [],
        mediaUrls: item.imageUrl ? [item.imageUrl] : [],
        likes: item.likesCount || item.numLikes || 0,
        comments: item.commentsCount || item.numComments || 0,
        shares: item.repostsCount || 0,
        saves: 0,
        views: item.viewsCount || 0,
        postedAt: item.postedAt || new Date().toISOString(),
      }))
    }

    case 'x':
      return items.map(item => ({
        postUrl: item.url || `https://x.com/${clean}/status/${item.id}`,
        postType: item.isRetweet ? 'retweet' : 'tweet',
        caption: item.text || item.full_text || '',
        hashtags: (item.entities?.hashtags || []).map((h: any) => h.tag || h.text || ''),
        mediaUrls: (item.entities?.media || []).map((m: any) => m.media_url_https || ''),
        likes: item.likeCount || item.favorite_count || 0,
        comments: item.replyCount || 0,
        shares: item.retweetCount || 0,
        saves: item.bookmarkCount || 0,
        views: item.viewCount || 0,
        postedAt: item.createdAt || new Date().toISOString(),
      }))

    case 'tiktok':
      return items.map(item => ({
        postUrl: item.webVideoUrl || `https://tiktok.com/@${clean}/video/${item.id}`,
        postType: 'video',
        caption: item.text || item.desc || '',
        hashtags: (item.hashtags || []).map((h: any) => typeof h === 'string' ? h : h?.name || ''),
        mediaUrls: [item.covers?.default || ''].filter(Boolean),
        likes: item.diggCount || item.stats?.diggCount || 0,
        comments: item.commentCount || item.stats?.commentCount || 0,
        shares: item.shareCount || item.stats?.shareCount || 0,
        saves: item.collectCount || 0,
        views: item.playCount || item.stats?.playCount || 0,
        postedAt: item.createTime ? new Date(item.createTime * 1000).toISOString() : new Date().toISOString(),
      }))

    case 'youtube':
      return items.filter((i: any) => i.title || i.videoUrl).map(item => ({
        postUrl: item.url || item.videoUrl || '',
        postType: (item.duration || 0) < 60 ? 'short' : 'video',
        caption: item.title || '',
        hashtags: item.tags || [],
        mediaUrls: [item.thumbnailUrl || ''].filter(Boolean),
        likes: item.likes || item.likeCount || 0,
        comments: item.numberOfComments || 0,
        shares: 0,
        saves: 0,
        views: item.viewCount || item.views || 0,
        postedAt: item.date || item.uploadDate || new Date().toISOString(),
      }))

    default:
      return []
  }
}
