'use server'

// Server-side error message sanitizer for action return values
function sanitizeActionError(msg: any): string {
  if (!msg || typeof msg !== 'string') return 'An unexpected error occurred.';
  const patterns = [
    [/credit balance is too low/i, 'AI service temporarily unavailable.'],
    [/insufficient.?funds/i, 'AI service temporarily unavailable.'],
    [/billing/i, 'AI service temporarily unavailable.'],
    [/rate.?limit|too many requests|overloaded/i, 'AI engine is busy. Please try again.'],
    [/invalid.?api.?key|authentication|permission/i, 'AI service configuration error.'],
    [/context.?length|too.?long|token.?limit/i, 'Content too large for AI processing.'],
    [/timeout|timed.?out|ETIMEDOUT/i, 'Request timed out. Please try again.'],
    [/ECONNREFUSED|ENOTFOUND|network/i, 'Network error. Please try again.'],
    [/not valid JSON|Unexpected token/i, 'AI returned unexpected response. Please try again.'],
    [/sk-[a-zA-Z0-9]/i, 'An unexpected error occurred.'],
  ];
  for (const [pat, safe] of (patterns as [RegExp, string][])) {
    if (pat.test(msg)) return safe;
  }
  if (msg.startsWith('{') || msg.startsWith('4') || msg.startsWith('5') || msg.length > 200) {
    return 'An unexpected error occurred.';
  }
  return msg;
}

import { safeParseJSON, requireParseJSON, withRetry } from '@/lib/ai-resilience'

import { askExpertAgent } from '@/lib/openai-agent'
import { ProductEntry, ServiceEntry } from '@/stores/brand'

/**
 * Product/Service Extractor
 * Extracts structured product/service data from URLs, text, or uploaded documents.
 * This is injected into every AI prompt so the content engine knows what the brand actually sells.
 */

// ── URL-Based Extraction ──
export async function extractFromUrl(url: string): Promise<{
  success: boolean
  data?: { products?: ProductEntry[], services?: ServiceEntry[], rawSummary: string }
  error?: string
}> {
  try {
    // Use Jina to scrape the URL content
    const { extractWebsiteContent } = await import('@/lib/jina')
    const scrapedContent = await extractWebsiteContent(url)
    
    if (!scrapedContent) {
      return { success: false, error: "Could not scrape the provided URL." }
    }

    return await extractFromText(scrapedContent, url)
  } catch (error: any) {
    return { success: false, error: sanitizeActionError(error.message) || "URL extraction failed." }
  }
}

// ── Multi-Source Extraction (files + URLs combined) ──
export async function extractFromMultipleSources(input: {
  parsedDocs?: { source: string; text: string }[]
  urls?: string[]
}): Promise<{
  success: boolean
  data?: { products?: ProductEntry[]; services?: ServiceEntry[]; rawSummary: string }
  error?: string
  warnings?: string[]
}> {
  const warnings: string[] = []
  const corpusParts: string[] = []

  // 1) Scrape every URL via Jina, in parallel
  if (input.urls?.length) {
    const { extractWebsiteContent } = await import('@/lib/jina')
    const scraped = await Promise.allSettled(
      input.urls.map(async (u) => ({ url: u, text: await extractWebsiteContent(u) }))
    )
    for (const r of scraped) {
      if (r.status === 'fulfilled' && r.value.text) {
        corpusParts.push(`=== SOURCE: ${r.value.url} ===\n${r.value.text}`)
      } else if (r.status === 'fulfilled') {
        warnings.push(`Could not scrape ${r.value.url}`)
      } else {
        warnings.push(`Scrape failed: ${r.reason?.message ?? r.reason}`)
      }
    }
  }

  // 2) Add already-parsed document text
  if (input.parsedDocs?.length) {
    for (const d of input.parsedDocs) {
      if (d.text?.trim()) {
        corpusParts.push(`=== SOURCE: ${d.source} ===\n${d.text}`)
      }
    }
  }

  if (!corpusParts.length) {
    return { success: false, error: 'No content extracted from the provided sources.', warnings }
  }

  const combined = corpusParts.join('\n\n')
  const result = await extractFromText(combined, 'multi-source-import')
  return { ...result, warnings }
}

// ── Text-Based Extraction (from scrapes, manual input, or OCR'd docs) ──
export async function extractFromText(rawText: string, sourceLabel: string = 'manual'): Promise<{
  success: boolean
  data?: { products?: ProductEntry[], services?: ServiceEntry[], rawSummary: string }
  error?: string
}> {
  const prompt = `You are a world-class product intelligence analyst. Your job is to determine exactly WHAT this brand sells or offers, based on the provided content.

SOURCE: ${sourceLabel}

CONTENT:
${rawText.slice(0, 8000)}

TASK:
1. Identify the core products, services, SaaS platforms, or offerings. 
2. BE SMART: Not all brands are e-commerce stores. 
   - If it's a SaaS company, the platform itself is the product (e.g., "PremAI Platform").
   - If it's an agency, their core capabilities are the services (e.g., "Performance Marketing", "SEO Audits").
   - If it's a single-product brand, extract that one flagship product.
   - If it's a restaurant, extract the main signature items or categories.
3. For each item, extract: name, description, key features, price range (if mentioned, otherwise "Contact Sales" or "Custom"), and the target segment.
4. Classify each as a "product" (physical goods, SaaS platforms, digital products) or "service" (consulting, agency work, treatments).
5. Do NOT skip the core offering just because it lacks a price tag or a "Buy Now" button. If the brand exists to provide it, extract it.
6. Write a 2-3 sentence "rawSummary" capturing the overall business model (Who they are, what they sell, and to whom).

Return STRICTLY as JSON (no markdown):
{
  "products": [
    {
      "name": "Product Name",
      "description": "One-line description",
      "features": ["feature1", "feature2", "feature3"],
      "priceRange": "$X-$Y or null",
      "targetSegment": "Who this is for"
    }
  ],
  "services": [
    {
      "name": "Service Name",
      "description": "One-line description",
      "deliverables": ["deliverable1", "deliverable2"],
      "targetSegment": "Who this is for"
    }
  ],
  "rawSummary": "2-3 sentence business model summary"
}`

  try {
    const res = await withRetry(() => askExpertAgent(prompt, true, '')) // Fast mode + skip KB — extraction doesn't need it
    if (!res.success || !res.data) throw new Error("Extraction model failed.")
    
    const cleaned = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = requireParseJSON(cleaned)
    
    return { success: true, data: parsed }
  } catch (error: any) {
    return { success: false, error: sanitizeActionError(error.message) || "Product extraction failed." }
  }
}
