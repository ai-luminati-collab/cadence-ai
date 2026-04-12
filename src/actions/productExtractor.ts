'use server'

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
    return { success: false, error: error.message || "URL extraction failed." }
  }
}

// ── Text-Based Extraction (from scrapes, manual input, or OCR'd docs) ──
export async function extractFromText(rawText: string, sourceLabel: string = 'manual'): Promise<{
  success: boolean
  data?: { products?: ProductEntry[], services?: ServiceEntry[], rawSummary: string }
  error?: string
}> {
  const prompt = `You are a product intelligence analyst. Extract ALL products and/or services from this content.

SOURCE: ${sourceLabel}

CONTENT:
${rawText.slice(0, 8000)}

TASK:
1. Identify every distinct product or service mentioned.
2. For each, extract: name, description, key features, price range (if mentioned), target segment.
3. Classify each as a "product" (physical/digital good) or "service" (consulting, SaaS, agency work, etc.).
4. Write a 2-3 sentence "rawSummary" capturing the overall business model.

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
    const res = await askExpertAgent(prompt, true) // Fast mode — extraction doesn't need boss review
    if (!res.success || !res.data) throw new Error("Extraction model failed.")
    
    const cleaned = res.data.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    
    return { success: true, data: parsed }
  } catch (error: any) {
    return { success: false, error: error.message || "Product extraction failed." }
  }
}
