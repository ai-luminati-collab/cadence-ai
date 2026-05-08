'use server'

import { GoogleGenAI } from '@google/genai'
import { BrandInfo, Strategy, BrandUniverse, BrandAsset } from '@/stores/brand'
import { requireParseJSON, withRetry } from '@/lib/ai-resilience'

const googleAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })

function sanitizeActionError(msg: any): string {
  if (!msg || typeof msg !== 'string') return 'An unexpected error occurred.'
  if (msg.includes('fetch') || msg.includes('network')) return 'Network error while analyzing references.'
  return msg.length > 200 ? 'An unexpected error occurred.' : msg
}

async function resolveViaApify(url: string): Promise<string | null> {
  const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
  if (!APIFY_TOKEN) return null;

  try {
    const isInstagram = url.includes('instagram.com');
    
    if (isInstagram) {
      console.log(`Using Apify Instagram Scraper for ${url}`);
      const res = await fetch(`https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=60`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: [url],
          resultsType: 'posts',
          resultsLimit: 1
        })
      });
      
      if (!res.ok) return null;
      const items = await res.json();
      if (items && items.length > 0) {
        return items[0].displayUrl || items[0].thumbnailUrl || items[0].imageUrl || null;
      }
    } else {
      console.log(`Using Apify Cheerio Scraper as fallback for ${url}`);
      // Fallback to Cheerio scraper for Pinterest/others to bypass simple blocks
      const res = await fetch(`https://api.apify.com/v2/acts/apify~cheerio-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=30`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url }],
          pageFunction: "async function pageFunction(context) { const { $ } = context; return { imageUrl: $('meta[property=\"og:image\"]').attr('content') || $('meta[name=\"og:image\"]').attr('content') }; }"
        })
      });
      
      if (!res.ok) return null;
      const items = await res.json();
      if (items && items.length > 0 && items[0].imageUrl) {
        let directUrl = items[0].imageUrl.replace(/&amp;/g, '&');
        return directUrl;
      }
    }
  } catch (err) {
    console.warn(`Apify fallback failed for ${url}:`, err);
  }
  return null;
}

async function resolveDirectImageUrl(url: string): Promise<string> {
  // If it's already a direct image link (jpg, png, webp) or a data URL, return as is
  if (url.startsWith('data:') || /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url)) {
    return url;
  }

  // Instagram almost always blocks normal fetch, go straight to Apify if available
  if (url.includes('instagram.com') && process.env.APIFY_API_TOKEN) {
    const apifyUrl = await resolveViaApify(url);
    if (apifyUrl) return apifyUrl;
  }

  try {
    // Try to fetch the page and extract the og:image meta tag
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', // Helps bypass some bot protections
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(5000)
    });
    
    if (res.ok) {
      const html = await res.text();
      // Look for <meta property="og:image" content="URL">
      const ogImageMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) || 
                           html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i);
                           
      if (ogImageMatch && ogImageMatch[1]) {
        let directUrl = ogImageMatch[1].replace(/&amp;/g, '&');
        console.log(`Resolved ${url} -> ${directUrl}`);
        return directUrl;
      }
    }
  } catch (error) {
    console.warn(`Standard fetch failed for ${url}`, error);
  }
  
  // If standard fetch failed, try Apify as a final fallback
  if (process.env.APIFY_API_TOKEN) {
    const fallbackUrl = await resolveViaApify(url);
    if (fallbackUrl) return fallbackUrl;
  }
  
  return url;
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    // First, resolve social media links (Pinterest/Insta) to their raw image URLs
    const directUrl = await resolveDirectImageUrl(url);
    
    const res = await fetch(directUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return null
    
    const buffer = await res.arrayBuffer()
    const b64 = Buffer.from(buffer).toString('base64')
    return `data:${contentType};base64,${b64}`
  } catch {
    return null
  }
}

export async function extractBrandUniverse(
  brandInfo: BrandInfo,
  strategy: Strategy | null,
  referenceUrls?: string[],
  referenceAssets?: BrandAsset[]
): Promise<{ success: boolean; data?: BrandUniverse; error?: string }> {
  try {
    // Collect all image URLs to analyze
    const urlsToAnalyze: string[] = []
    
    if (referenceUrls) {
      urlsToAnalyze.push(...referenceUrls)
    }
    
    if (referenceAssets) {
      const imgAssets = referenceAssets.filter(a => a.type === 'image' || a.type === 'webp')
      urlsToAnalyze.push(...imgAssets.map(a => a.url))
    }
    
    // Also include brand references from the store if available
    if (brandInfo.brandReferences) {
      const imgAssets = brandInfo.brandReferences.filter(a => a.type === 'image' || a.type === 'webp')
      urlsToAnalyze.push(...imgAssets.map(a => a.url))
    }

    // Deduplicate and limit to top 4 to prevent payload limits
    const uniqueUrls = Array.from(new Set(urlsToAnalyze)).slice(0, 4)
    
    if (uniqueUrls.length === 0) {
      return { success: false, error: 'No valid image references provided to analyze.' }
    }

    const parts: any[] = []
    
    // Add textual context
    const audienceContext = strategy?.targetAudience || brandInfo.primaryAudiences?.join(', ') || 'General Audience'
    const psychographics = strategy?.psychographicTriggers || brandInfo.psychographics || 'Unknown'
    const brandTone = strategy?.persona || brandInfo.tone?.join(', ') || 'Professional'

    parts.push({
      text: `You are the world's most elite Creative Director and Visual Psychologist.
You are tasked with analyzing the provided reference images to extract a strict "Brand Universe Matrix".

CONTEXT:
Brand: ${brandInfo.name} (${brandInfo.industry})
Target Audience (TG): ${audienceContext}
Psychographics/Triggers: ${psychographics}
Brand Persona: ${brandTone}

YOUR MISSION:
Analyze these images and tell me EXACTLY how to replicate this visual aesthetic, but TRANSLATE IT into psychological rules that appeal to the TG.
Do not just say "use dark lighting." Say "Use harsh, moody shadows to evoke a sense of late-night hustle that resonates with the entrepreneurial TG."

Provide a JSON object with these EXACT keys:
{
  "lightingCode": "Specific, actionable lighting instructions. E.g., 'Harsh direct flash', 'Soft natural window light', 'Neon rim lighting'.",
  "compositionCode": "How the frame is structured. E.g., 'Subjects dead-center, extreme close-up macro', 'Wide shots with negative space at the top'.",
  "colorGrading": "The precise color palette and grading style. E.g., 'Desaturated greens, highly saturated reds, warm amber highlights, crushed blacks'.",
  "textureCode": "The tactile feel of the image. E.g., 'Heavy 35mm film grain, slightly soft focus, glossy reflections'.",
  "tgRelatability": "A 2-sentence explanation of HOW this aesthetic grounds the image in the TG's reality. E.g., 'This aesthetic feels raw and unfiltered, placing the product in messy, lived-in environments that the Gen Z audience finds authentic and relatable.'",
  "negativeRules": ["Top rule 1 the AI MUST NOT DO", "Top rule 2 the AI MUST NOT DO", "Top rule 3 the AI MUST NOT DO"]
}

CRITICAL RULES:
- The negativeRules MUST be actionable constraints to prevent hallucination (e.g., "NEVER use flat, corporate, evenly-lit studio setups").
- Ensure your output is purely JSON. No markdown wrappers, no backticks, no preamble.`
    })

    // Process images
    for (const url of uniqueUrls) {
      let b64Url = url
      if (!url.startsWith('data:')) {
        const fetched = await fetchImageAsBase64(url)
        if (fetched) b64Url = fetched
      }
      
      const match = b64Url.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          }
        })
      }
    }

    if (parts.length === 1) {
      throw new Error("Failed to load any of the provided images.")
    }

    const response = await withRetry(() => googleAI.models.generateContent({
      model: 'gemini-3-pro-image-preview', // Pro multimodal can see and reason about images deeply
      contents: [{ role: 'user', parts }],
      config: {
        temperature: 0.2, // Keep it highly analytical and consistent
      }
    }))

    const textOutput = response.candidates?.[0]?.content?.parts?.[0]?.text
    if (!textOutput) throw new Error("No analysis returned from the Vision model.")

    let cleaned = textOutput.trim()
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
    cleaned = cleaned.trim()

    const parsed = requireParseJSON(cleaned) as BrandUniverse

    return { success: true, data: parsed }
  } catch (error: any) {
    console.error('Brand Universe extraction failed:', error)
    return { success: false, error: sanitizeActionError(error.message) || 'Failed to extract Brand Universe' }
  }
}
