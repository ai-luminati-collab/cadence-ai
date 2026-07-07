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


import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { CalendarPost, ContentDraft, BrandInfo, Strategy, BrandAsset, PostReference, FeedAesthetic, VisualGuardrail, VisualRef } from '@/stores/brand'

const getGoogleAI = () => new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Available image generation models
export type ImageModel = 
  | 'nano-banana-pro'    // Gemini 3 Pro Image - professional quality, 4K, best reasoning
  | 'nano-banana-2'      // Gemini 3.1 Flash Image - fast, cost-efficient
  | 'gpt-image-1.5'      // OpenAI GPT Image 1.5 - best text rendering
  | 'gpt-image-mini'     // OpenAI GPT Image Mini - cost-effective

const MODEL_MAP = {
  'nano-banana-pro': 'gemini-3-pro-image-preview',
  'nano-banana-2': 'gemini-3.1-flash-image-preview',
  'gpt-image-1.5': 'gpt-image-1.5',
  'gpt-image-mini': 'gpt-image-1-mini',
} as const

const DEFAULT_MODEL: ImageModel = 'nano-banana-pro'

// ──────────────────────────────────────
// Core Generation - Routes to correct provider
// ──────────────────────────────────────

async function generateImage(
  prompt: string, 
  model: ImageModel = DEFAULT_MODEL, 
  referenceImages?: string[]
): Promise<string> {
  if (model === 'gpt-image-1.5' || model === 'gpt-image-mini') {
    return generateViaOpenAI(prompt, MODEL_MAP[model])
  } else {
    return generateViaGoogle(prompt, MODEL_MAP[model], referenceImages)
  }
}

/**
 * Generate via Google Nano Banana with optional reference image input.
 * Nano Banana Pro supports multi-modal input (text + images).
 */
async function generateViaGoogle(prompt: string, modelId: string, referenceImages?: string[]): Promise<string> {
  // Build content parts: text prompt + reference images
  const parts: any[] = [{ text: prompt }]
  
  if (referenceImages && referenceImages.length > 0) {
    // Take up to 3 reference images to avoid overloading
    for (const refImg of referenceImages.slice(0, 3)) {
      // Extract base64 data from data URL
      const match = refImg.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          }
        })
      }
    }
  }

  const response = await getGoogleAI().models.generateContent({
    model: modelId,
    contents: parts.length > 1 ? [{ role: 'user', parts }] : prompt,
  })

  const candidates = response.candidates
  if (!candidates || candidates.length === 0) {
    throw new Error('No candidates returned from Nano Banana')
  }

  const responseParts = candidates[0].content?.parts
  if (!responseParts) throw new Error('No parts in response')

  for (const part of responseParts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || 'image/png'
      return `data:${mimeType};base64,${part.inlineData.data}`
    }
  }

  throw new Error('No image data found in Nano Banana response')
}

/**
 * Generate via OpenAI GPT Image.
 */
async function generateViaOpenAI(prompt: string, modelId: string): Promise<string> {
  const response = await getOpenAI().images.generate({
    model: modelId,
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'high',
    response_format: 'b64_json',
  })

  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error('No image data returned from GPT Image')

  return `data:image/png;base64,${b64}`
}

// ──────────────────────────────────────
// Fetch URL → base64 (for visual refs)
// ──────────────────────────────────────

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return null
    const buffer = await res.arrayBuffer()
    const b64 = Buffer.from(buffer).toString('base64')
    return `data:${contentType};base64,${b64}`
  } catch {
    console.warn(`⚠️ Could not fetch visual reference: ${url}`)
    return null
  }
}

// ──────────────────────────────────────
// Reference Image Collector
// ──────────────────────────────────────

async function collectReferenceImages(
  brandInfo: BrandInfo,
  tenureRefs?: BrandAsset[],
  postRefs?: PostReference[],
  approvedVisualRef?: string | null, // URL of the approved Pinterest/Instagram moodboard
): Promise<string[]> {
  const refs: string[] = []

  // Priority 0: Approved visual reference from AI search (most specific — user explicitly approved this)
  if (approvedVisualRef) {
    const b64 = await fetchImageAsBase64(approvedVisualRef)
    if (b64) refs.push(b64)
  }

  // Priority 1: Per-post references (most specific)
  if (postRefs?.length) {
    for (const ref of postRefs) {
      if (ref.url.startsWith('data:')) {
        refs.push(ref.url)
      }
    }
  }

  // Priority 2: Tenure references (override brand-level for this calendar period)
  if (tenureRefs?.length) {
    for (const ref of tenureRefs) {
      if ((ref.type === 'image' || ref.type === 'webp') && ref.url.startsWith('data:')) {
        refs.push(ref.url)
      }
    }
  }

  // Priority 3: Brand-level references (fallback)
  if (refs.length < 3 && brandInfo.brandReferences?.length) {
    for (const ref of brandInfo.brandReferences) {
      if ((ref.type === 'image' || ref.type === 'webp') && ref.url.startsWith('data:')) {
        refs.push(ref.url)
      }
    }
  }

  if (refs.length < 3 && brandInfo.productImages?.length) {
    for (const img of brandInfo.productImages) {
      if ((img.type === 'image' || img.type === 'webp') && img.url.startsWith('data:')) {
        refs.push(img.url)
      }
    }
  }

  if (refs.length < 3 && brandInfo.brandLogos?.length) {
    for (const logo of brandInfo.brandLogos) {
      if ((logo.type === 'image' || logo.type === 'webp') && logo.url.startsWith('data:')) {
        refs.push(logo.url)
      }
    }
  }

  return refs.slice(0, 3) // Max 3 reference images
}

// ──────────────────────────────────────
// Get approved visual reference URL from post
// ──────────────────────────────────────

function getApprovedVisualRefUrl(post: CalendarPost): string | null {
  if (!post.activeReferenceId || !post.visualReferences?.length) return null
  const approved = post.visualReferences.find(r => r.id === post.activeReferenceId)
  return approved?.imageUrl || null
}

// ──────────────────────────────────────
// Public API: Static, Carousel, Story
// ──────────────────────────────────────

export async function generateStaticVisual(
  post: CalendarPost,
  draft: ContentDraft,
  brandInfo: BrandInfo,
  strategy: Strategy,
  model: ImageModel = DEFAULT_MODEL,
  feedAesthetic?: FeedAesthetic,
  tenureRefs?: BrandAsset[],
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  try {
    const onImageCopy = draft.platformFields?.creativeHeadline || ''
    const bodyText = draft.platformFields?.creativeBody || ''
    const visualDirective = draft.platformFields?.visualDirective || draft.visualDescription || ''

    const prompt = buildImagePrompt({
      type: 'static',
      brandInfo,
      persona: strategy.persona,
      onImageCopy,
      bodyText,
      visualDirective,
      concept: post.topic,
      pillar: post.pillar,
      feedAesthetic,
      guardrails: brandInfo.visualGuardrails,
      postRefs: draft.postReferences,
    })

    const approvedRef = getApprovedVisualRefUrl(post)
    const refs = await collectReferenceImages(brandInfo, tenureRefs, draft.postReferences, approvedRef)
    const imageUrl = await generateImage(prompt, model, refs.length > 0 ? refs : undefined)
    return { success: true, imageUrl }
  } catch (error: any) {
    console.error('Static visual generation failed:', error)
    return { success: false, error: sanitizeActionError(error.message) || 'Failed to generate static visual' }
  }
}

export async function generateCarouselVisuals(
  post: CalendarPost,
  draft: ContentDraft,
  brandInfo: BrandInfo,
  strategy: Strategy,
  slideCount: number = 3,
  model: ImageModel = DEFAULT_MODEL,
  feedAesthetic?: FeedAesthetic,
  tenureRefs?: BrandAsset[],
): Promise<{ success: boolean; imageUrls?: string[]; error?: string }> {
  try {
    const coverSlide = draft.platformFields?.coverSlide || ''
    const slideBreakdown = draft.platformFields?.slideBreakdown || ''
    const visualDirective = draft.platformFields?.visualDirective || draft.visualDescription || ''

    const slides = slideBreakdown
      .split(/\n/)
      .filter(l => l.trim().length > 0)
      .slice(0, slideCount)

    const approvedRef = getApprovedVisualRefUrl(post)
    const refs = await collectReferenceImages(brandInfo, tenureRefs, draft.postReferences, approvedRef)
    const imageUrls: string[] = []

    // Generate cover slide
    const coverPrompt = buildImagePrompt({
      type: 'carousel_cover',
      brandInfo,
      persona: strategy.persona,
      onImageCopy: coverSlide,
      bodyText: '',
      visualDirective,
      concept: post.topic,
      pillar: post.pillar,
      feedAesthetic,
      guardrails: brandInfo.visualGuardrails,
      postRefs: draft.postReferences,
    })

    const coverUrl = await generateImage(coverPrompt, model, refs.length > 0 ? refs : undefined)
    imageUrls.push(coverUrl)

    // Generate content slides
    for (let i = 0; i < Math.min(slides.length, 2); i++) {
      const slidePrompt = buildImagePrompt({
        type: 'carousel_slide',
        brandInfo,
        persona: strategy.persona,
        onImageCopy: slides[i],
        bodyText: '',
        visualDirective,
        concept: post.topic,
        pillar: post.pillar,
        slideNumber: i + 2,
        feedAesthetic,
        guardrails: brandInfo.visualGuardrails,
      })

      const slideUrl = await generateImage(slidePrompt, model, refs.length > 0 ? refs : undefined)
      imageUrls.push(slideUrl)
    }

    return { success: true, imageUrls }
  } catch (error: any) {
    console.error('Carousel generation failed:', error)
    return { success: false, error: sanitizeActionError(error.message) || 'Failed to generate carousel' }
  }
}

export async function generateStoryVisual(
  post: CalendarPost,
  draft: ContentDraft,
  brandInfo: BrandInfo,
  strategy: Strategy,
  model: ImageModel = DEFAULT_MODEL,
  feedAesthetic?: FeedAesthetic,
  tenureRefs?: BrandAsset[],
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  try {
    const storyCopy = post.storyCopy || draft.platformFields?.storyCopy || ''
    const visualDirective = draft.platformFields?.visualDirective || draft.visualDescription || ''

    const prompt = buildImagePrompt({
      type: 'story',
      brandInfo,
      persona: strategy.persona,
      onImageCopy: storyCopy,
      bodyText: '',
      visualDirective,
      concept: post.topic,
      pillar: post.pillar,
      feedAesthetic,
      guardrails: brandInfo.visualGuardrails,
      postRefs: draft.postReferences,
    })

    const approvedRef = getApprovedVisualRefUrl(post)
    const refs = await collectReferenceImages(brandInfo, tenureRefs, draft.postReferences, approvedRef)
    const imageUrl = await generateImage(prompt, model, refs.length > 0 ? refs : undefined)
    return { success: true, imageUrl }
  } catch (error: any) {
    console.error('Story generation failed:', error)
    return { success: false, error: sanitizeActionError(error.message) || 'Failed to generate story visual' }
  }
}

// ──────────────────────────────────────
// Massively Enhanced Prompt Builder
// ──────────────────────────────────────

interface ImagePromptParams {
  type: 'static' | 'carousel_cover' | 'carousel_slide' | 'story'
  brandInfo: BrandInfo
  persona: string
  onImageCopy: string
  bodyText: string
  visualDirective: string
  concept: string
  pillar: string
  slideNumber?: number
  feedAesthetic?: FeedAesthetic
  guardrails?: VisualGuardrail[]
  postRefs?: PostReference[]
}

function buildImagePrompt(params: ImagePromptParams): string {
  const { brandInfo, type } = params

  // ── Format Specification ──
  const formatSpec = {
    static: 'a square (1:1, 1080x1080px) social media post image',
    carousel_cover: 'the COVER SLIDE (slide 1) of an Instagram carousel. Square 1:1 format (1080x1080px). This slide must be a SCROLL-STOPPER that makes people halt their feed',
    carousel_slide: `slide ${params.slideNumber || 2} of an Instagram carousel. Square 1:1 format (1080x1080px). Must maintain visual continuity with slide 1`,
    story: 'an Instagram Story in 9:16 vertical portrait format (1080x1920px). Full-bleed, edge-to-edge design optimized for a vertical phone screen',
  }[type]

  // ── Typography ──
  const headingFont = brandInfo.headingFont || 'a bold, modern sans-serif typeface like Montserrat Black or Poppins Bold'
  const bodyFont = brandInfo.bodyFont || 'a clean sans-serif like Inter or DM Sans'
  
  const typographyBlock = `TYPOGRAPHY SYSTEM:
- Heading text: Use ${headingFont} style. Bold, high-impact, large scale.
- Body/supporting text: Use ${bodyFont} style. Clean, readable, medium weight.
- Text hierarchy: Primary text at minimum 48pt equivalent, secondary at 24pt equivalent.
- Text placement: Use generous padding from edges (at least 80px safe zone from all edges).
- Text contrast: Ensure WCAG AAA contrast ratio. If over a photograph, add a semi-transparent gradient overlay or text shadow behind the text.`

  // ── Color System ──
  const primaryColor = brandInfo.primaryColorHex || '#1a1a2e'
  const secondaryColor = brandInfo.secondaryColorHex || '#e94560'
  
  const colorBlock = `COLOR PALETTE:
- Primary brand color: ${primaryColor} (use for backgrounds, key graphic elements, or text accents)
- Secondary brand color: ${secondaryColor} (use for highlights, CTAs, or contrast elements)
- Build a harmonious palette around these two colors. Use tints and shades for depth.
- Ensure the overall palette feels intentional, NOT default or generic.`

  // ── Text Rendering ──
  let textBlock: string
  if (params.onImageCopy) {
    const cleanCopy = params.onImageCopy.replace(/[—–]/g, '-').replace(/--+/g, '-')
    textBlock = `ON-IMAGE COPY (MUST RENDER):
"${cleanCopy}"
${params.bodyText ? `Supporting text: "${params.bodyText.replace(/[—–]/g, '-')}"` : ''}

TEXT RENDERING RULES:
- This text is the HERO element of the design. It must be large, bold, and immediately readable.
- Position the text with intentional graphic design placement (not just centered).
- Consider asymmetric layouts: text anchored to the left or bottom-third.
- Add visual depth: subtle drop shadows, gradient text fills, or knockout text over imagery.
- Ensure perfect spelling and rendering of every character.
- NEVER use em dashes or long dashes in the rendered text.`
  } else {
    textBlock = `NO TEXT OVERLAY on this image. Focus entirely on:
- Powerful, editorial-grade visual composition
- Cinematic lighting and depth of field
- Strong focal point with visual hierarchy through scale and position`
  }

  // ── Visual Art Direction & Brand Universe ──
  const visualDirective = params.visualDirective || ''
  let artDirection = ''

  if (brandInfo.brandUniverse) {
    const bu = brandInfo.brandUniverse
    artDirection = `=== BRAND UNIVERSE (STRICT VISUAL DNA) ===
You are restricted to the following design language. Tonality changes are absolutely forbidden.
- Lighting: ${bu.lightingCode}
- Composition: ${bu.compositionCode}
- Color Grading: ${bu.colorGrading}
- Texture/Feel: ${bu.textureCode}
- TG Relatability Context (WHY this works): ${bu.tgRelatability}

WARNING: You must apply this exact visual wrapper to the subject matter. Do not invent a new aesthetic.
========================================`
  } else {
    artDirection = visualDirective 
      ? `ART DIRECTION: ${visualDirective}`
      : `ART DIRECTION (DEFAULT):
- Create a premium, editorial-quality image that could appear in a leading magazine ad.
- Use dramatic, cinematic lighting (golden hour, studio rim lighting, or moody chiaroscuro).
- Apply a shallow depth-of-field for visual depth where appropriate.
- Composition: Rule of thirds, leading lines, or strong diagonal energy.
- Texture: Add tactile quality (grain, fabric texture, food photography macro detail).
- Mood: Aspirational, confident, warm. NOT clinical or corporate.
- Color grading: Apply a subtle, cohesive color grade (warm amber, cool teal, or rich chocolate tones).`
  }

  // ── Reference Context ──
  const hasReferences = (brandInfo.brandReferences?.length || 0) > 0
  const hasProductImages = (brandInfo.productImages?.length || 0) > 0
  const hasLogos = (brandInfo.brandLogos?.length || 0) > 0
  
  let referenceBlock = ''
  if (hasReferences || hasProductImages || hasLogos) {
    referenceBlock = `\nREFERENCE IMAGES PROVIDED:
${hasReferences ? '- Brand moodboard/reference images are attached. Match their visual language, color treatment, and aesthetic tone.' : ''}
${hasProductImages ? '- Product photography is attached. Integrate the product naturally into the composition with its real appearance.' : ''}
${hasLogos ? '- Brand logo is attached. You may subtly integrate the logo if it enhances brand recognition, but do NOT make it dominate the composition.' : ''}
- Use these references to inform your color palette, visual style, and overall brand feel.
- The output should feel like it belongs to the same visual ecosystem as these references.`
  }

  // ── Post References Context ──
  if (params.postRefs?.length) {
    const productRefs = params.postRefs.filter(r => r.category === 'product' || r.category === 'character')
    const sceneRefs = params.postRefs.filter(r => r.category === 'scene' || r.category === 'aesthetic')
    const generalRefs = params.postRefs.filter(r => r.category === 'general')
    
    referenceBlock += `\nPOST-SPECIFIC REFERENCES ATTACHED:
${productRefs.length > 0 ? `- ${productRefs.length} Product/Character refs: Match the product appearance, texture, and proportions from these images.` : ''}
${sceneRefs.length > 0 ? `- ${sceneRefs.length} Scene/Aesthetic refs: Replicate the environment, mood, lighting, and color grading from these images.` : ''}
${generalRefs.length > 0 ? `- ${generalRefs.length} General refs: Draw creative inspiration from these for overall composition and feel.` : ''}`
  }

  // ── Feed Aesthetic ──
  let aestheticBlock = ''
  if (params.feedAesthetic) {
    const aestheticDescriptions: Record<string, string> = {
      pastel: 'FEED AESTHETIC: PASTEL - Use soft, muted, desaturated tones. Think blush pinks, lavender, sage greens, powder blues, cream whites. Light and airy feel. Low saturation, high brightness. Dreamy, feminine, gentle energy.',
      bright: 'FEED AESTHETIC: BRIGHT - Use vibrant, fully saturated, punchy colors. Bold primary reds, electric blues, sunshine yellows, hot pinks. High energy, high contrast. The feed should pop with confidence and dynamism.',
      monochrome: 'FEED AESTHETIC: MONOCHROME - Strict black, white, and gray palette. High contrast editorial look. If any color accent appears, it must be minimal (a single red element, for example). Think fashion magazine, architectural photography.',
      earthy: 'FEED AESTHETIC: EARTHY - Warm, organic tones. Terracotta, burnt sienna, olive green, cream, warm brown, golden amber. Natural textures (wood, clay, linen). Warm lighting. Grounded, authentic, artisanal feel.',
      neon: 'FEED AESTHETIC: NEON - Dark backgrounds with electric, glowing accent colors. Neon greens, hot pinks, electric purples, cyber blues. Think nightlife, gaming, futuristic. High contrast between dark base and luminous accents.',
      minimal: 'FEED AESTHETIC: MINIMAL - Clean, spacious designs with lots of white/negative space. Single accent color from the brand palette. Simple geometric shapes. Uncluttered. Swiss design inspired. Typography-forward.',
    }
    aestheticBlock = aestheticDescriptions[params.feedAesthetic] || ''
  }

  // ── Visual Guardrails (Do's & Don'ts) ──
  let guardrailsBlock = ''
  const dos = params.guardrails?.filter(g => g.type === 'do' && g.rule.trim()).map(g => `  DO: ${g.rule}`) || []
  const donts = params.guardrails?.filter(g => g.type === 'dont' && g.rule.trim()).map(g => `  DON'T: ${g.rule}`) || []
  
  if (brandInfo.brandUniverse?.negativeRules) {
    brandInfo.brandUniverse.negativeRules.forEach(rule => donts.push(`  DON'T (CRITICAL): ${rule}`))
  }

  if (dos.length > 0 || donts.length > 0) {
    guardrailsBlock = `\nBRAND VISUAL GUARDRAILS (STRICT):
${dos.join('\n')}
${donts.join('\n')}
These rules are derived from the brand's visual DNA and are NON-NEGOTIABLE.`
  }

  // ── Layout System (per format) ──
  const layoutGuidance = {
    static: `LAYOUT GUIDANCE (Static Post):
- Create a single, powerful composition with one clear focal point.
- Consider these proven layouts: hero image with text overlay, split-screen (image + color block), or full-bleed editorial with floating text.
- Leave breathing room. Avoid cluttering the 1:1 frame.
- The design should feel like a page from a premium brand lookbook.`,
    
    carousel_cover: `LAYOUT GUIDANCE (Carousel Cover):
- This is the FIRST IMPRESSION. It must create curiosity and a swipe-impulse.
- Use a provocative visual hook: a close-up detail, dramatic crop, or unexpected angle.
- The cover text should tease the content without giving everything away.
- Consider a bold, full-bleed background with large text, or a theatrical product shot.
- Add subtle visual cues that suggest "there is more" (like a partial reveal or cut-off element).`,
    
    carousel_slide: `LAYOUT GUIDANCE (Carousel Content Slide):
- Maintain visual continuity with the cover slide (same color palette, same font style).
- This is an informational slide. Balance text readability with visual interest.
- Use a consistent layout grid: text zone on one side, visual on the other; or top-bottom split.
- Each slide should have ONE key takeaway, not multiple competing messages.
- Add visual markers (slide number, progress dots, or a consistent accent bar).`,
    
    story: `LAYOUT GUIDANCE (Story 9:16):
- Full vertical format. Use the entire canvas edge-to-edge.
- Account for Instagram UI: keep critical content in the middle 70% (avoid top 15% for username bar, bottom 15% for reply bar).
- Stories feel intimate and casual but still premium. Think editorial fashion photography meets personal storytelling.
- Consider dynamic angles: shot from below, overhead flat-lay, or tight crop on hands/details.
- Text should be bold and immediate. People view stories for 5 seconds maximum.`,
  }[type]

  // ── Core Products Anti-Hallucination ──
  let productBlock = ''
  if (brandInfo.coreProducts && brandInfo.coreProducts.length > 0) {
    productBlock = `\n═══ CORE PRODUCTS — ANTI-HALLUCINATION (STRICT) ═══
The brand "${brandInfo.name}" sells ONLY these items: ${brandInfo.coreProducts.join(', ')}.
If this visual features a product, it MUST be one of these items.
NEVER depict wraps, burgers, pizzas, or any item NOT on this list.
If the concept references "${params.concept}" and it mentions a product, cross-check against this list.
══════════════════════════════════════════════════════`
  }

  // ── Assemble Final Prompt (Subject First, Style Second) ──
  return `You are a world-class creative director and visual psychologist. Your goal is to create ${formatSpec} for the brand "${brandInfo.name}".

═══ 1. THE SUBJECT & USAGE STORY (ANCHOR) ═══
Brand: ${brandInfo.name} (${brandInfo.industry})
Content Concept (The Scene): ${params.concept}
Content Pillar: ${params.pillar}
${productBlock}
CRITICAL: Make sure the human element or product usage feels intensely relatable to the target audience. Do not make it abstract or confusing. The subject must be clearly visible and realistic.

═══ 2. THE BRAND UNIVERSE (VISUAL WRAPPER) ═══
${artDirection}
${referenceBlock}
${aestheticBlock}
${colorBlock}

═══ 3. TYPOGRAPHY & LAYOUT ═══
${layoutGuidance}
${typographyBlock}
${textBlock}

═══ 4. NON-NEGOTIABLE GUARDRAILS ═══
${guardrailsBlock}
1. PREMIUM QUALITY - Must look designed by a top agency, not a template tool.
2. NO STOCK PHOTO AESTHETIC - Avoid generic, evenly-lit, corporate imagery.
3. SUBJECT TRUMPS STYLE - If the aesthetic rules conflict with making the product visible/usable, prioritize making the product look good and realistic.
4. BRAND COHERENCE - Colors, mood, and tone must match the Brand Universe exactly. No hallucinations.
5. NO EM DASHES - Never render em dashes, en dashes, or long dashes in any text.
6. NO WATERMARKS - No "created by AI" labels, no stock photo ID overlays.
7. REFERENCE IMAGE FIDELITY - If reference images are provided, they are the PRIMARY source of truth for the product's visual appearance. Match the product shape, color, texture exactly.`
}
