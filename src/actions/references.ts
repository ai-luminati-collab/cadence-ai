'use server'

import { safeParseJSON, requireParseJSON, withRetry } from '@/lib/ai-resilience'

import OpenAI from 'openai'
import { CalendarPost, BrandInfo, Strategy } from '@/stores/brand'

/**
 * Visual Reference Finder — OpenAI Web Search
 *
 * Uses GPT-4o-mini with web_search to find Pinterest/Instagram/design
 * reference images for calendar post concepts.
 *
 * Cost: ~0.001 USD per search (negligible)
 */

export interface VisualReference {
  id: string
  title: string
  imageUrl: string       // direct image URL (thumbnail or full)
  sourceUrl: string      // Pinterest/Insta/original page link
  sourcePlatform: string // 'pinterest' | 'instagram' | 'behance' | 'dribbble' | 'other'
  description: string    // short AI description of why this matches
}

export interface ReferenceSearchResult {
  success: boolean
  references?: VisualReference[]
  searchQuery?: string
  error?: string
}

/**
 * Find visual references for a single calendar post.
 * AI generates the search query based on the concept, then searches the web.
 */
export async function findVisualReferences(
  post: CalendarPost,
  brandInfo: BrandInfo,
  strategy: Strategy | null,
  customQuery?: string  // user can override the AI-generated search query
): Promise<ReferenceSearchResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { success: false, error: 'Missing OPENAI_API_KEY' }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    // Step 1: Build a visual search query from the post concept
    const searchQuery = customQuery || await generateSearchQuery(openai, post, brandInfo, strategy)

    // Step 2: Use GPT with web search to find visual references
    const references = await searchForReferences(openai, searchQuery, post, brandInfo)

    return {
      success: true,
      references,
      searchQuery
    }
  } catch (error: any) {
    console.error('Reference search failed:', error?.message || error)
    return { success: false, error: `Reference search failed: ${error?.message || 'Unknown error'}` }
  }
}

/**
 * Re-search with a modified query (user wants different references)
 */
export async function researchReferences(
  query: string,
  post: CalendarPost,
  brandInfo: BrandInfo
): Promise<ReferenceSearchResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { success: false, error: 'Missing OPENAI_API_KEY' }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const references = await searchForReferences(openai, query, post, brandInfo)
    return { success: true, references, searchQuery: query }
  } catch (error: any) {
    return { success: false, error: error?.message || 'Search failed' }
  }
}

// ── AI generates a Pinterest-style visual search query ──
async function generateSearchQuery(
  openai: OpenAI,
  post: CalendarPost,
  brandInfo: BrandInfo,
  strategy: Strategy | null
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.6,
    messages: [
      {
        role: 'system',
        content: `You generate visual search queries for finding reference images on Pinterest/Instagram.
Your query should describe the VISUAL AESTHETIC and COMPOSITION wanted, not the marketing concept.
Think like a creative director looking for a moodboard image.

Rules:
- Output ONLY the search query, nothing else
- Keep it under 15 words
- Focus on: visual style, color mood, composition, subject matter, aesthetic
- Include the content format context (e.g., "Instagram reel", "carousel post")
- DO NOT include the brand name
- DO NOT include generic marketing terms like "engagement" or "conversion"`
      },
      {
        role: 'user',
        content: `Brand: ${brandInfo.name} (${brandInfo.industry})
Platform: ${post.platform}
Format: ${post.format}
Post Concept: ${post.topic}
${post.psychTrigger ? `Psychological Angle: ${post.psychTrigger}` : ''}
${post.usageStory ? `Scene: ${post.usageStory}` : ''}
${strategy?.socialCreativeKit ? `Creative Direction: ${strategy.socialCreativeKit.slice(0, 300)}` : ''}
${brandInfo.primaryColorHex ? `Brand Colors: ${brandInfo.primaryColorHex}${brandInfo.secondaryColorHex ? ', ' + brandInfo.secondaryColorHex : ''}` : ''}

Generate a visual search query to find a reference/moodboard image for this post.`
      }
    ]
  })

  return response.choices[0]?.message?.content?.trim() || `${post.format} ${brandInfo.industry} aesthetic`
}

// ── Search the web for visual references using OpenAI web search ──
async function searchForReferences(
  openai: OpenAI,
  searchQuery: string,
  post: CalendarPost,
  brandInfo: BrandInfo
): Promise<VisualReference[]> {
  // Use the responses API with web_search tool
  const response = await (openai as any).responses.create({
    model: 'gpt-4o-mini',
    tools: [{ type: 'web_search_preview' }],
    input: `You are a creative director finding visual references for a ${brandInfo.industry} brand's social media content.

Search for: "${searchQuery}"

Find 4-5 high-quality visual references from Pinterest, Instagram, Behance, or Dribbble.
Focus on images that show the right VIBE, COMPOSITION, and AESTHETIC for a ${post.platform} ${post.format}.

For EACH reference, return:
1. The exact image URL (direct link to the image file, not the page)
2. The page/source URL (Pinterest pin, Instagram post, etc.)
3. Which platform it's from (pinterest/instagram/behance/dribbble/other)
4. A 1-sentence description of WHY this reference works for the concept
5. A short title (3-5 words)

IMPORTANT: Return ONLY valid, working URLs. Prefer Pinterest pins and Instagram posts.

Format your response as JSON array:
[
  {
    "title": "Warm Flat Lay Coffee",
    "imageUrl": "https://...",
    "sourceUrl": "https://pinterest.com/pin/...",
    "sourcePlatform": "pinterest",
    "description": "Warm golden tones with overhead product placement, matches the cozy morning ritual vibe"
  }
]

Return ONLY the JSON array, no other text.`
  })

  // Extract the text output from the responses API
  let outputText = ''
  if (response?.output) {
    for (const item of response.output) {
      if (item.type === 'message' && item.content) {
        for (const part of item.content) {
          if (part.type === 'output_text') {
            outputText += part.text
          }
        }
      }
    }
  }

  if (!outputText) {
    console.warn('Web search returned no output')
    return []
  }

  // Parse the JSON from the response
  try {
    // Clean up potential markdown code blocks
    let cleaned = outputText.trim()
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
    cleaned = cleaned.trim()

    const parsed = requireParseJSON(cleaned) as any[]

    return parsed.slice(0, 5).map((ref, i) => ({
      id: `ref-${Date.now()}-${i}`,
      title: ref.title || `Reference ${i + 1}`,
      imageUrl: ref.imageUrl || ref.image_url || '',
      sourceUrl: ref.sourceUrl || ref.source_url || '',
      sourcePlatform: (ref.sourcePlatform || ref.source_platform || 'other').toLowerCase(),
      description: ref.description || ''
    })).filter(ref => ref.sourceUrl) // Only keep refs with valid URLs
  } catch (parseError) {
    console.error('Failed to parse reference results:', parseError)
    console.log('Raw output:', outputText.slice(0, 500))

    // Fallback: try to extract URLs from the text response
    const urls = outputText.match(/https?:\/\/[^\s"'<>]+/g) || []
    return urls.slice(0, 5).map((url, i) => ({
      id: `ref-${Date.now()}-${i}`,
      title: `Reference ${i + 1}`,
      imageUrl: '',
      sourceUrl: url,
      sourcePlatform: url.includes('pinterest') ? 'pinterest' : url.includes('instagram') ? 'instagram' : 'other',
      description: 'Found via web search'
    }))
  }
}

/**
 * Batch-find references for multiple calendar posts at once.
 * Used after calendar generation to pre-populate references.
 */
export async function findReferencesForCalendar(
  posts: CalendarPost[],
  brandInfo: BrandInfo,
  strategy: Strategy | null,
  onProgress?: (completed: number, total: number) => void
): Promise<Record<string, VisualReference[]>> {
  const results: Record<string, VisualReference[]> = {}

  // Process sequentially to avoid rate limits (these are web searches)
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    try {
      const result = await findVisualReferences(post, brandInfo, strategy)
      if (result.success && result.references) {
        results[post.id] = result.references
      }
    } catch (e) {
      console.warn(`Reference search failed for post ${post.id}:`, e)
    }

    onProgress?.(i + 1, posts.length)

    // Small delay between searches to be respectful
    if (i < posts.length - 1) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  return results
}
