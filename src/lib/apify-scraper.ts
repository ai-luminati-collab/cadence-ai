/**
 * Apify Website Scraper — Cloudflare/Bot-Protection Bypass
 *
 * Uses Apify's Web Scraper actor to extract website content
 * when Jina fails due to Cloudflare, browser checks, or CAPTCHAs.
 *
 * Fallback hierarchy:
 *   1. Jina Reader API (fast, free, no auth needed)
 *   2. Apify Web Scraper (headless Chrome, bypasses Cloudflare)
 */

const APIFY_TOKEN = process.env.APIFY_API_TOKEN

/**
 * Extract website text content using Apify's headless browser scraper.
 * Bypasses Cloudflare, bot-checks, and JavaScript-rendered pages.
 *
 * @param url - The website URL to scrape
 * @returns Extracted text content or null if failed
 */
export async function extractWebsiteContentWithApify(url: string): Promise<string | null> {
  if (!APIFY_TOKEN) {
    console.warn('⚠️ APIFY_API_TOKEN not set — cannot use Apify fallback')
    return null
  }

  // Normalize URL
  let finalUrl = url.trim()
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    finalUrl = 'https://' + finalUrl
  }

  try {
    console.log(`🔄 Apify Web Scraper: Scraping ${finalUrl}...`)

    // Use Apify's Website Content Crawler — it renders JavaScript and handles Cloudflare
    const response = await fetch(
      `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=90`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url: finalUrl }],
          maxCrawlPages: 1,
          crawlerType: 'playwright:adaptive', // Uses Playwright for JS rendering + Cloudflare bypass
          maxCrawlDepth: 0,
          includeUrlGlobs: [],
          excludeUrlGlobs: [],
          maxResults: 1,
          proxyConfiguration: {
            useApifyProxy: true,
            apifyProxyGroups: ['RESIDENTIAL'] // Residential proxies bypass most bot detection
          }
        }),
        signal: AbortSignal.timeout(120000) // 2 minute max wait
      }
    )

    if (!response.ok) {
      console.error(`Apify API error: ${response.status} ${response.statusText}`)
      return null
    }

    const items = await response.json()

    if (!items || !Array.isArray(items) || items.length === 0) {
      console.warn('Apify returned no results')
      return null
    }

    // The crawler returns structured data with text content
    const page = items[0]
    const textContent = page.text || page.markdown || page.body || ''

    if (textContent.length < 100) {
      console.warn(`Apify returned very little content (${textContent.length} chars)`)
      return null
    }

    console.log(`✅ Apify scraped ${textContent.length} chars from ${finalUrl}`)
    return textContent

  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      console.error(`Apify scrape timed out for ${finalUrl}`)
    } else {
      console.error(`Apify scrape failed for ${finalUrl}:`, error.message)
    }
    return null
  }
}

/**
 * Scrape Instagram post/profile content using Apify's Instagram scraper.
 * Returns the post caption, image URLs, and engagement data.
 */
export async function scrapeInstagramPost(url: string): Promise<{
  imageUrl?: string
  caption?: string
  likes?: number
  comments?: number
} | null> {
  if (!APIFY_TOKEN) return null

  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=60`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: [url],
          resultsType: 'posts',
          resultsLimit: 1
        }),
        signal: AbortSignal.timeout(90000)
      }
    )

    if (!response.ok) return null
    const items = await response.json()

    if (items && items.length > 0) {
      return {
        imageUrl: items[0].displayUrl || items[0].thumbnailUrl || items[0].imageUrl,
        caption: items[0].caption,
        likes: items[0].likesCount,
        comments: items[0].commentsCount
      }
    }
  } catch (err) {
    console.warn(`Instagram scrape failed for ${url}:`, err)
  }
  return null
}
