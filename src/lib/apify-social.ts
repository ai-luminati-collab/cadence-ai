/**
 * Apify Social Media Scraper — Multi-Platform Data Collection
 *
 * Uses Apify actors to scrape public social media profiles and posts.
 * No official API auth needed — users just enter handles.
 *
 * Supported platforms:
 *   - Instagram (profile + posts + engagement)
 *   - LinkedIn (company page + posts)
 *   - X/Twitter (profile + tweets + engagement)
 *   - TikTok (profile + videos + engagement)
 *   - YouTube (channel + videos + views)
 */

import { ApifyClient } from 'apify-client'

const APIFY_TOKEN = process.env.APIFY_API_TOKEN
if (!APIFY_TOKEN) console.warn('⚠️ APIFY_API_TOKEN not set')

const client = APIFY_TOKEN ? new ApifyClient({ token: APIFY_TOKEN }) : null

// ── Platform Actor IDs ──
// Using the most reliable, well-maintained Apify actors for each platform

const ACTORS = {
  instagram: 'apify/instagram-scraper',
  linkedin: 'curious_coder/linkedin-company-scraper',
  x: 'apidojo/tweet-scraper',
  tiktok: 'clockworks/tiktok-scraper',
  youtube: 'streamers/youtube-channel-scraper',
} as const

export type SocialPlatform = keyof typeof ACTORS

// ── Normalized Output Types ──

export interface ScrapedProfile {
  handle: string
  platform: SocialPlatform
  displayName: string
  bio: string
  followers: number
  following: number
  postCount: number
  profileUrl: string
  avatarUrl: string
}

export interface ScrapedPost {
  postUrl: string
  postType: string
  caption: string
  hashtags: string[]
  mediaUrls: string[]
  likes: number
  comments: number
  shares: number
  saves: number
  views: number
  postedAt: string // ISO date
}

export interface ScrapeResult {
  profile: ScrapedProfile
  posts: ScrapedPost[]
}

// ── Platform-Specific Scrape Functions ──

/**
 * Trigger an Apify actor run and return the run ID.
 * The actual results come via webhook or polling.
 */
export async function triggerScrape(
  platform: SocialPlatform,
  handle: string,
  options: { postsLimit?: number; webhookUrl?: string } = {}
): Promise<{ runId: string; actorId: string }> {
  if (!client) throw new Error('Apify client not configured — set APIFY_API_TOKEN')

  const postsLimit = options.postsLimit || 30
  const actorId = ACTORS[platform]
  const input = buildActorInput(platform, handle, postsLimit)

  const run = await client.actor(actorId).start(input, {
    webhooks: options.webhookUrl
      ? [{ eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'], requestUrl: options.webhookUrl }]
      : undefined,
  })

  return { runId: run.id, actorId }
}

/**
 * Get results from a completed Apify run.
 * Call this from the webhook handler or after polling.
 */
export async function getRunResults(runId: string): Promise<any[]> {
  if (!client) throw new Error('Apify client not configured')
  const { items } = await client.run(runId).dataset().listItems()
  return items
}

/**
 * Synchronous scrape — triggers and waits for results.
 * Use for small jobs (single profile). For bulk scrapes, use triggerScrape + webhook.
 */
export async function scrapeProfile(
  platform: SocialPlatform,
  handle: string,
  postsLimit = 30
): Promise<ScrapeResult | null> {
  if (!client) return null

  const actorId = ACTORS[platform]
  const input = buildActorInput(platform, handle, postsLimit)

  try {
    const run = await client.actor(actorId).call(input, {
      timeout: 120, // 2 min max
    })

    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    return normalizeResults(platform, handle, items)
  } catch (err: any) {
    console.error(`Apify scrape failed for ${platform}/@${handle}:`, err.message)
    return null
  }
}

// ── Actor Input Builders ──

function buildActorInput(platform: SocialPlatform, handle: string, postsLimit: number): Record<string, any> {
  const cleanHandle = handle.replace(/^@/, '').trim()

  switch (platform) {
    case 'instagram':
      return {
        usernames: [cleanHandle],
        resultsType: 'posts',
        resultsLimit: postsLimit,
        addParentData: true, // includes profile data with each post
      }

    case 'linkedin':
      return {
        urls: [`https://www.linkedin.com/company/${cleanHandle}`],
        maxPosts: postsLimit,
      }

    case 'x':
      return {
        handle: cleanHandle,
        maxTweets: postsLimit,
        addUserInfo: true,
      }

    case 'tiktok':
      return {
        profiles: [`https://www.tiktok.com/@${cleanHandle}`],
        resultsPerPage: postsLimit,
        shouldDownloadCovers: false,
        shouldDownloadVideos: false,
      }

    case 'youtube':
      return {
        channelUrls: [`https://www.youtube.com/@${cleanHandle}`],
        maxResults: postsLimit,
        sortBy: 'date',
      }

    default:
      return {}
  }
}

// ── Result Normalizers ──

function normalizeResults(platform: SocialPlatform, handle: string, items: any[]): ScrapeResult | null {
  if (!items || items.length === 0) return null

  switch (platform) {
    case 'instagram':
      return normalizeInstagram(handle, items)
    case 'linkedin':
      return normalizeLinkedIn(handle, items)
    case 'x':
      return normalizeX(handle, items)
    case 'tiktok':
      return normalizeTikTok(handle, items)
    case 'youtube':
      return normalizeYouTube(handle, items)
    default:
      return null
  }
}

function normalizeInstagram(handle: string, items: any[]): ScrapeResult {
  // Instagram scraper includes profile data in first item's ownerProfile
  const firstItem = items[0]
  const owner = firstItem?.ownerProfile || firstItem?.owner || {}

  const profile: ScrapedProfile = {
    handle,
    platform: 'instagram',
    displayName: owner.fullName || owner.full_name || handle,
    bio: owner.biography || '',
    followers: owner.followersCount || owner.edge_followed_by?.count || 0,
    following: owner.followingCount || owner.edge_follow?.count || 0,
    postCount: owner.postsCount || owner.edge_owner_to_timeline_media?.count || 0,
    profileUrl: `https://instagram.com/${handle}`,
    avatarUrl: owner.profilePicUrl || owner.profile_pic_url_hd || '',
  }

  const posts: ScrapedPost[] = items.map(item => ({
    postUrl: item.url || `https://instagram.com/p/${item.shortCode || item.shortcode || ''}`,
    postType: item.type || (item.isVideo ? 'reel' : item.childPosts ? 'carousel' : 'static'),
    caption: item.caption || '',
    hashtags: (item.hashtags || []).map((h: any) => typeof h === 'string' ? h : h.name),
    mediaUrls: [item.displayUrl || item.thumbnailUrl || ''].filter(Boolean),
    likes: item.likesCount || item.edge_media_preview_like?.count || 0,
    comments: item.commentsCount || item.edge_media_to_comment?.count || 0,
    shares: 0, // Instagram doesn't expose shares publicly
    saves: 0,  // Instagram doesn't expose saves publicly
    views: item.videoViewCount || item.video_view_count || 0,
    postedAt: item.timestamp ? new Date(item.timestamp * 1000).toISOString() : (item.takenAtTimestamp ? new Date(item.takenAtTimestamp * 1000).toISOString() : new Date().toISOString()),
  }))

  return { profile, posts }
}

function normalizeLinkedIn(handle: string, items: any[]): ScrapeResult {
  const company = items[0]

  const profile: ScrapedProfile = {
    handle,
    platform: 'linkedin',
    displayName: company?.name || handle,
    bio: company?.description || company?.tagline || '',
    followers: company?.followersCount || company?.followerCount || 0,
    following: 0,
    postCount: company?.postCount || items.length,
    profileUrl: `https://linkedin.com/company/${handle}`,
    avatarUrl: company?.logoUrl || company?.logo || '',
  }

  const postItems = company?.posts || items.filter((i: any) => i.text || i.postUrl)
  const posts: ScrapedPost[] = postItems.map((item: any) => ({
    postUrl: item.postUrl || item.url || '',
    postType: item.type || 'text',
    caption: item.text || item.content || '',
    hashtags: (item.text || '').match(/#\w+/g) || [],
    mediaUrls: item.imageUrl ? [item.imageUrl] : [],
    likes: item.likesCount || item.numLikes || 0,
    comments: item.commentsCount || item.numComments || 0,
    shares: item.repostsCount || item.numShares || 0,
    saves: 0,
    views: item.viewsCount || 0,
    postedAt: item.postedAt || item.publishedAt || new Date().toISOString(),
  }))

  return { profile, posts }
}

function normalizeX(handle: string, items: any[]): ScrapeResult {
  const firstItem = items[0]
  const user = firstItem?.user || firstItem?.author || {}

  const profile: ScrapedProfile = {
    handle,
    platform: 'x',
    displayName: user.name || handle,
    bio: user.description || user.bio || '',
    followers: user.followersCount || user.followers_count || 0,
    following: user.followingCount || user.friends_count || 0,
    postCount: user.statusesCount || user.statuses_count || 0,
    profileUrl: `https://x.com/${handle}`,
    avatarUrl: user.profileImageUrl || user.profile_image_url_https || '',
  }

  const posts: ScrapedPost[] = items.map(item => ({
    postUrl: item.url || `https://x.com/${handle}/status/${item.id}`,
    postType: item.isRetweet ? 'retweet' : (item.inReplyToStatusId ? 'reply' : 'tweet'),
    caption: item.text || item.full_text || '',
    hashtags: (item.entities?.hashtags || []).map((h: any) => h.tag || h.text),
    mediaUrls: (item.entities?.media || []).map((m: any) => m.media_url_https || m.url),
    likes: item.likeCount || item.favorite_count || 0,
    comments: item.replyCount || 0,
    shares: item.retweetCount || item.retweet_count || 0,
    saves: item.bookmarkCount || 0,
    views: item.viewCount || item.impressionCount || 0,
    postedAt: item.createdAt || item.created_at || new Date().toISOString(),
  }))

  return { profile, posts }
}

function normalizeTikTok(handle: string, items: any[]): ScrapeResult {
  const firstItem = items[0]
  const author = firstItem?.authorMeta || firstItem?.author || {}

  const profile: ScrapedProfile = {
    handle,
    platform: 'tiktok',
    displayName: author.name || author.nickname || handle,
    bio: author.signature || author.bio || '',
    followers: author.fans || author.followerCount || 0,
    following: author.following || author.followingCount || 0,
    postCount: author.video || author.videoCount || items.length,
    profileUrl: `https://tiktok.com/@${handle}`,
    avatarUrl: author.avatar || author.avatarThumb || '',
  }

  const posts: ScrapedPost[] = items.map(item => ({
    postUrl: item.webVideoUrl || item.url || `https://tiktok.com/@${handle}/video/${item.id}`,
    postType: 'video',
    caption: item.text || item.desc || '',
    hashtags: (item.hashtags || []).map((h: any) => typeof h === 'string' ? h : h.name),
    mediaUrls: [item.videoUrl || item.covers?.default || ''].filter(Boolean),
    likes: item.diggCount || item.stats?.diggCount || 0,
    comments: item.commentCount || item.stats?.commentCount || 0,
    shares: item.shareCount || item.stats?.shareCount || 0,
    saves: item.collectCount || 0,
    views: item.playCount || item.stats?.playCount || 0,
    postedAt: item.createTime ? new Date(item.createTime * 1000).toISOString() : new Date().toISOString(),
  }))

  return { profile, posts }
}

function normalizeYouTube(handle: string, items: any[]): ScrapeResult {
  const channelData = items.find((i: any) => i.channelName || i.channelTitle) || items[0] || {}

  const profile: ScrapedProfile = {
    handle,
    platform: 'youtube',
    displayName: channelData.channelName || channelData.channelTitle || handle,
    bio: channelData.channelDescription || '',
    followers: channelData.numberOfSubscribers || channelData.subscriberCount || 0,
    following: 0,
    postCount: channelData.numberOfVideos || items.length,
    profileUrl: `https://youtube.com/@${handle}`,
    avatarUrl: channelData.channelProfilePicUrl || '',
  }

  const videoItems = items.filter((i: any) => i.title || i.videoUrl)
  const posts: ScrapedPost[] = videoItems.map(item => ({
    postUrl: item.url || item.videoUrl || `https://youtube.com/watch?v=${item.id}`,
    postType: (item.duration || 0) < 60 ? 'short' : 'video',
    caption: item.title || '',
    hashtags: (item.tags || []),
    mediaUrls: [item.thumbnailUrl || ''].filter(Boolean),
    likes: item.likes || item.likeCount || 0,
    comments: item.numberOfComments || item.commentCount || 0,
    shares: 0,
    saves: 0,
    views: item.viewCount || item.views || 0,
    postedAt: item.date || item.uploadDate || new Date().toISOString(),
  }))

  return { profile, posts }
}
