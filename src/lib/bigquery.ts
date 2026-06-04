/**
 * BigQuery Client — Cadence AI Data Layer
 *
 * Stores all scraped social media data:
 *   - Brand's own post metrics (from Apify scrapes)
 *   - Competitor post metrics
 *   - Engagement snapshots over time
 *
 * Tables:
 *   cadence.social_profiles    — brand + competitor profile metadata
 *   cadence.social_posts       — individual posts with engagement data
 *   cadence.metric_snapshots   — time-series engagement snapshots (24h, 48h, 7d)
 *   cadence.scrape_jobs        — Apify job tracking
 */

import { BigQuery } from '@google-cloud/bigquery'

const DATASET_ID = 'cadence'
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'socialmediakiller'

// BigQuery client — uses Application Default Credentials in production (Cloud Run)
// For local dev, set GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON
let bqClient: BigQuery | null = null

function getBQ(): BigQuery {
  if (!bqClient) {
    bqClient = new BigQuery({ projectId: PROJECT_ID })
  }
  return bqClient
}

// ── Schema Definitions ──

const SOCIAL_PROFILES_SCHEMA = [
  { name: 'id', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'brand_id', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'platform', type: 'STRING', mode: 'REQUIRED' as const },      // instagram, linkedin, x, tiktok, youtube
  { name: 'handle', type: 'STRING', mode: 'REQUIRED' as const },        // @username without @
  { name: 'profile_type', type: 'STRING', mode: 'REQUIRED' as const },  // 'brand' | 'competitor'
  { name: 'display_name', type: 'STRING' },
  { name: 'bio', type: 'STRING' },
  { name: 'followers', type: 'INTEGER' },
  { name: 'following', type: 'INTEGER' },
  { name: 'post_count', type: 'INTEGER' },
  { name: 'profile_url', type: 'STRING' },
  { name: 'avatar_url', type: 'STRING' },
  { name: 'last_scraped_at', type: 'TIMESTAMP' },
  { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' as const },
]

const SOCIAL_POSTS_SCHEMA = [
  { name: 'id', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'profile_id', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'brand_id', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'platform', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'post_url', type: 'STRING' },
  { name: 'post_type', type: 'STRING' },          // reel, carousel, static, story, text, thread, video
  { name: 'caption', type: 'STRING' },
  { name: 'hashtags', type: 'STRING', mode: 'REPEATED' as const },
  { name: 'media_urls', type: 'STRING', mode: 'REPEATED' as const },
  { name: 'likes', type: 'INTEGER' },
  { name: 'comments', type: 'INTEGER' },
  { name: 'shares', type: 'INTEGER' },
  { name: 'saves', type: 'INTEGER' },
  { name: 'views', type: 'INTEGER' },
  { name: 'engagement_rate', type: 'FLOAT' },      // (likes+comments+shares+saves) / followers * 100
  { name: 'posted_at', type: 'TIMESTAMP' },
  { name: 'scraped_at', type: 'TIMESTAMP', mode: 'REQUIRED' as const },
  { name: 'profile_type', type: 'STRING' },        // 'brand' | 'competitor'
]

const METRIC_SNAPSHOTS_SCHEMA = [
  { name: 'id', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'post_id', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'brand_id', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'snapshot_type', type: 'STRING', mode: 'REQUIRED' as const }, // '24h' | '48h' | '7d' | 'scrape'
  { name: 'likes', type: 'INTEGER' },
  { name: 'comments', type: 'INTEGER' },
  { name: 'shares', type: 'INTEGER' },
  { name: 'saves', type: 'INTEGER' },
  { name: 'views', type: 'INTEGER' },
  { name: 'engagement_rate', type: 'FLOAT' },
  { name: 'captured_at', type: 'TIMESTAMP', mode: 'REQUIRED' as const },
]

const SCRAPE_JOBS_SCHEMA = [
  { name: 'id', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'brand_id', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'apify_run_id', type: 'STRING' },
  { name: 'platform', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'handle', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'profile_type', type: 'STRING', mode: 'REQUIRED' as const },
  { name: 'status', type: 'STRING', mode: 'REQUIRED' as const },       // 'pending' | 'running' | 'succeeded' | 'failed'
  { name: 'posts_scraped', type: 'INTEGER' },
  { name: 'error_message', type: 'STRING' },
  { name: 'triggered_at', type: 'TIMESTAMP', mode: 'REQUIRED' as const },
  { name: 'completed_at', type: 'TIMESTAMP' },
]

// ── Initialize Dataset + Tables ──

export async function ensureBigQueryTables(): Promise<void> {
  const bq = getBQ()

  // Create dataset if not exists
  const [datasets] = await bq.getDatasets()
  if (!datasets.find(d => d.id === DATASET_ID)) {
    await bq.createDataset(DATASET_ID, { location: 'US' })
    console.log(`✅ Created BigQuery dataset: ${DATASET_ID}`)
  }

  const dataset = bq.dataset(DATASET_ID)
  const tables = [
    { id: 'social_profiles', schema: SOCIAL_PROFILES_SCHEMA },
    { id: 'social_posts', schema: SOCIAL_POSTS_SCHEMA },
    { id: 'metric_snapshots', schema: METRIC_SNAPSHOTS_SCHEMA },
    { id: 'scrape_jobs', schema: SCRAPE_JOBS_SCHEMA },
  ]

  for (const table of tables) {
    const [exists] = await dataset.table(table.id).exists()
    if (!exists) {
      await dataset.createTable(table.id, { schema: { fields: table.schema } })
      console.log(`✅ Created BigQuery table: ${DATASET_ID}.${table.id}`)
    }
  }
}

// ── Insert Helpers ──

export async function insertSocialProfile(profile: Record<string, any>): Promise<void> {
  const bq = getBQ()
  await bq.dataset(DATASET_ID).table('social_profiles').insert([profile])
}

export async function insertSocialPosts(posts: Record<string, any>[]): Promise<void> {
  if (posts.length === 0) return
  const bq = getBQ()
  await bq.dataset(DATASET_ID).table('social_posts').insert(posts)
}

export async function insertMetricSnapshot(snapshot: Record<string, any>): Promise<void> {
  const bq = getBQ()
  await bq.dataset(DATASET_ID).table('metric_snapshots').insert([snapshot])
}

export async function insertScrapeJob(job: Record<string, any>): Promise<void> {
  const bq = getBQ()
  await bq.dataset(DATASET_ID).table('scrape_jobs').insert([job])
}

export async function updateScrapeJob(jobId: string, updates: Record<string, any>): Promise<void> {
  const bq = getBQ()
  const setClauses = Object.entries(updates)
    .map(([key, val]) => {
      if (val === null) return `${key} = NULL`
      if (typeof val === 'string') return `${key} = '${val.replace(/'/g, "\\'")}'`
      return `${key} = ${val}`
    })
    .join(', ')

  await bq.query({
    query: `UPDATE \`${PROJECT_ID}.${DATASET_ID}.scrape_jobs\` SET ${setClauses} WHERE id = @jobId`,
    params: { jobId },
  })
}

// ── Query Helpers ──

export async function getCompetitorPosts(brandId: string, platform?: string, limit = 30): Promise<any[]> {
  const bq = getBQ()
  let query = `
    SELECT * FROM \`${PROJECT_ID}.${DATASET_ID}.social_posts\`
    WHERE brand_id = @brandId AND profile_type = 'competitor'
  `
  const params: Record<string, any> = { brandId }

  if (platform) {
    query += ` AND platform = @platform`
    params.platform = platform
  }

  query += ` ORDER BY posted_at DESC LIMIT @limit`
  params.limit = limit

  const [rows] = await bq.query({ query, params })
  return rows
}

export async function getBrandPosts(brandId: string, platform?: string, limit = 30): Promise<any[]> {
  const bq = getBQ()
  let query = `
    SELECT * FROM \`${PROJECT_ID}.${DATASET_ID}.social_posts\`
    WHERE brand_id = @brandId AND profile_type = 'brand'
  `
  const params: Record<string, any> = { brandId }

  if (platform) {
    query += ` AND platform = @platform`
    params.platform = platform
  }

  query += ` ORDER BY posted_at DESC LIMIT @limit`
  params.limit = limit

  const [rows] = await bq.query({ query, params })
  return rows
}

export async function getProfiles(brandId: string, profileType?: 'brand' | 'competitor'): Promise<any[]> {
  const bq = getBQ()
  let query = `
    SELECT * FROM \`${PROJECT_ID}.${DATASET_ID}.social_profiles\`
    WHERE brand_id = @brandId
  `
  const params: Record<string, any> = { brandId }

  if (profileType) {
    query += ` AND profile_type = @profileType`
    params.profileType = profileType
  }

  query += ` ORDER BY last_scraped_at DESC`

  const [rows] = await bq.query({ query, params })
  return rows
}

export async function getPostMetricSnapshots(postId: string): Promise<any[]> {
  const bq = getBQ()
  const [rows] = await bq.query({
    query: `
      SELECT * FROM \`${PROJECT_ID}.${DATASET_ID}.metric_snapshots\`
      WHERE post_id = @postId ORDER BY captured_at ASC
    `,
    params: { postId },
  })
  return rows
}

export async function getTopPerformingPosts(brandId: string, platform?: string, limit = 10): Promise<any[]> {
  const bq = getBQ()
  let query = `
    SELECT * FROM \`${PROJECT_ID}.${DATASET_ID}.social_posts\`
    WHERE brand_id = @brandId AND engagement_rate IS NOT NULL
  `
  const params: Record<string, any> = { brandId }

  if (platform) {
    query += ` AND platform = @platform`
    params.platform = platform
  }

  query += ` ORDER BY engagement_rate DESC LIMIT @limit`
  params.limit = limit

  const [rows] = await bq.query({ query, params })
  return rows
}

/**
 * Get aggregate engagement stats for a brand (avg engagement rate, total posts, etc.)
 */
export async function getBrandEngagementStats(brandId: string): Promise<{
  totalPosts: number
  avgEngagement: number
  topPlatform: string | null
  postsByPlatform: Record<string, number>
}> {
  const bq = getBQ()

  const [rows] = await bq.query({
    query: `
      SELECT
        platform,
        COUNT(*) as post_count,
        AVG(engagement_rate) as avg_engagement
      FROM \`${PROJECT_ID}.${DATASET_ID}.social_posts\`
      WHERE brand_id = @brandId AND profile_type = 'brand'
      GROUP BY platform
      ORDER BY avg_engagement DESC
    `,
    params: { brandId },
  })

  const postsByPlatform: Record<string, number> = {}
  let totalPosts = 0
  let totalEngagement = 0
  let topPlatform: string | null = null

  for (const row of rows) {
    postsByPlatform[row.platform] = row.post_count
    totalPosts += row.post_count
    totalEngagement += (row.avg_engagement || 0) * row.post_count
    if (!topPlatform) topPlatform = row.platform
  }

  return {
    totalPosts,
    avgEngagement: totalPosts > 0 ? totalEngagement / totalPosts : 0,
    topPlatform,
    postsByPlatform,
  }
}
