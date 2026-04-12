/**
 * Platform-Native Content Specification Engine
 * 
 * This is the knowledge base that dictates WHAT fields each platform+format
 * combination needs in a content draft. It drives both:
 *   1. The AI generation prompt (what to ask for)
 *   2. The modal UI (what to display)
 * 
 * Last researched: April 2026
 */

export interface DraftField {
  key: string       // Unique key for the field in ContentDraft.platformFields
  label: string     // Display label
  type: 'text' | 'textarea' | 'select' | 'chips'
  placeholder?: string
  options?: string[] // For 'select' type
  required?: boolean
  maxLength?: number
  rows?: number     // For 'textarea'
}

export interface PlatformFormatSpec {
  platformKey: string     // Matches CalendarPost.platform
  formatKey: string       // Matches CalendarPost.format
  displayName: string     // e.g. "Instagram Reel"
  draftFields: DraftField[]
  aiPromptInstructions: string  // Injected into the AI prompt for this format
  bestPractices: string[]       // Quick tips shown in the UI
}

// ═══════════════════════════════════════════════════════
// META (INSTAGRAM & FACEBOOK)
// ═══════════════════════════════════════════════════════

const META_REEL: PlatformFormatSpec = {
  platformKey: "Meta (Instagram & Facebook)",
  formatKey: "Reel",
  displayName: "Instagram/Facebook Reel",
  draftFields: [
    { key: "hookScript", label: "Hook Script (0-3s)", type: "textarea", placeholder: "The first 3 seconds — stop the scroll. Bold visual + text overlay.", rows: 2, required: true },
    { key: "bodyScript", label: "Body Script (3-20s)", type: "textarea", placeholder: "Core value delivery. One idea, punchy cuts every 3-5 seconds.", rows: 3, required: true },
    { key: "ctaScript", label: "Closing CTA (last 3s)", type: "text", placeholder: "e.g. 'Save this for later' or 'Comment RECIPE for the full guide'", required: true },
    { key: "onScreenText", label: "On-Screen Text Cues", type: "textarea", placeholder: "Text overlays that appear during the reel (one per line)", rows: 3 },
    { key: "musicDirection", label: "Music / Audio Direction", type: "text", placeholder: "e.g. 'Trending upbeat lo-fi' or 'Original voiceover only'" },
    { key: "caption", label: "Caption", type: "textarea", placeholder: "Instagram caption with hooks, value, and CTA", rows: 4, required: true },
    { key: "hashtags", label: "Hashtags", type: "text", placeholder: "#branded #niche #trending (3-8 max)" },
    { key: "visualDirective", label: "Visual Directive", type: "textarea", placeholder: "Art direction: what the viewer sees, lighting, setting, mood", rows: 3 }
  ],
  aiPromptInstructions: `Generate an Instagram Reel draft. Structure:
    - hookScript: The opening 0-3 second script. Must freeze the thumb. Use a bold visual hook + text overlay.
    - bodyScript: The 3-20 second body. Deliver the core value. One idea per cut. Pacing: jump cuts every 3-5 seconds.
    - ctaScript: Final 3 seconds. Specific high-value CTA (not generic "follow for more").
    - onScreenText: Each line = one text overlay that appears on screen during the reel.
    - musicDirection: Music/audio suggestion (trending audio or original voiceover).
    - caption: Full Instagram caption. Hook line, value, CTA.
    - hashtags: 3-8 relevant hashtags.
    - visualDirective: Shot-by-shot visual direction. Setting, lighting, camera movement.
    Duration target: 7-30 seconds. Format: 9:16 vertical. Style: authentic/lo-fi over polished.`,
  bestPractices: [
    "Hook in first 3 seconds or you're dead",
    "Jump cuts every 3-5 seconds boost retention",
    "Lo-fi authentic > overproduced ads",
    "7-30 seconds sweet spot",
    "Use trending audio only if it fits naturally"
  ]
}

const META_CAROUSEL: PlatformFormatSpec = {
  platformKey: "Meta (Instagram & Facebook)",
  formatKey: "Carousel",
  displayName: "Instagram/Facebook Carousel",
  draftFields: [
    { key: "coverSlide", label: "Cover Slide (Slide 1)", type: "textarea", placeholder: "The scroll-stopping headline. This is your hook.", rows: 2, required: true },
    { key: "slideBreakdown", label: "Slide-by-Slide Breakdown", type: "textarea", placeholder: "Slide 2: [Headline] — [Body]\nSlide 3: [Headline] — [Body]\n...", rows: 8, required: true },
    { key: "closingSlide", label: "Closing Slide / CTA", type: "textarea", placeholder: "The final slide. CTA or summary punch.", rows: 2, required: true },
    { key: "caption", label: "Caption", type: "textarea", placeholder: "Caption with context, story, and engagement prompt", rows: 4, required: true },
    { key: "hashtags", label: "Hashtags", type: "text", placeholder: "#branded #niche (3-8 max)" },
    { key: "visualDirective", label: "Design Direction", type: "textarea", placeholder: "Color palette, typography, layout style for all slides", rows: 3 }
  ],
  aiPromptInstructions: `Generate an Instagram Carousel draft. Structure:
    - coverSlide: The first slide headline/hook. Must make users swipe.
    - slideBreakdown: Full slide-by-slide content. Format each as "Slide N: [Headline] — [Body text]". Aim for 5-10 slides. Each slide = one clear idea.
    - closingSlide: Final slide with CTA or powerful summary.
    - caption: Full caption with storytelling hook and engagement prompt.
    - hashtags: 3-8 relevant hashtags.
    - visualDirective: Design system for the carousel (colors, fonts, layout).
    Best practice: Carousels max engagement via "dwell time" (swiping). Each slide must compel the next swipe.`,
  bestPractices: [
    "Cover slide is everything — it's your ad",
    "One idea per slide, max 30 words",
    "5-10 slides optimal for engagement",
    "End with a clear CTA slide",
    "Consistent design system across slides"
  ]
}

const META_STATIC: PlatformFormatSpec = {
  platformKey: "Meta (Instagram & Facebook)",
  formatKey: "Static",
  displayName: "Instagram/Facebook Static Post",
  draftFields: [
    { key: "creativeHeadline", label: "Creative Headline", type: "text", placeholder: "The bold text on the image itself", required: true },
    { key: "creativeBody", label: "Creative Body Text", type: "textarea", placeholder: "Supporting text on the image (if any)", rows: 2 },
    { key: "caption", label: "Caption", type: "textarea", placeholder: "Full caption with hook, story, and CTA", rows: 5, required: true },
    { key: "hashtags", label: "Hashtags", type: "text", placeholder: "#branded #niche (3-8 max)" },
    { key: "visualDirective", label: "Visual Directive", type: "textarea", placeholder: "Describe the image: subject, composition, mood, colors", rows: 3, required: true }
  ],
  aiPromptInstructions: `Generate an Instagram Static Post draft. Structure:
    - creativeHeadline: Bold, punchy text that appears ON the image.
    - creativeBody: Any supporting text on the image (keep minimal).
    - caption: Full Instagram caption. Storytelling hook → value → CTA.
    - hashtags: 3-8 relevant hashtags.
    - visualDirective: Detailed image description — subject, composition, lighting, palette.
    Best practice: Static posts must work as visual-first content. The image alone should convey the message without needing the caption.`,
  bestPractices: [
    "Image must work standalone without caption",
    "Bold typography on creative catches eyes",
    "Caption storytelling drives saves",
    "Square (1:1) or Portrait (4:5) formats",
    "High contrast colors outperform muted tones"
  ]
}

const META_STORY: PlatformFormatSpec = {
  platformKey: "Meta (Instagram & Facebook)",
  formatKey: "Story",
  displayName: "Instagram/Facebook Story",
  draftFields: [
    { key: "storyCopy", label: "Story Text Overlay", type: "text", placeholder: "The punchy text on the story frame (under 15 words)", required: true, maxLength: 80 },
    { key: "storyMediaType", label: "Media Type", type: "select", options: ["Video (5-15s clip)", "Static (designed frame)"], required: true },
    { key: "storyFeature", label: "Interactive Feature", type: "select", options: ["Poll", "Quiz", "Question Box", "Countdown", "Emoji Slider", "Link Sticker", "Music", "Mention", "None"], required: true },
    { key: "featureConfig", label: "Feature Configuration", type: "text", placeholder: "e.g. Poll: 'Which flavour? 🔥 Spicy vs 🌿 Mild'" },
    { key: "visualDirective", label: "Visual Directive", type: "textarea", placeholder: "Background, styling, sticker placement", rows: 2 },
    { key: "caption", label: "Reply CTA / Swipe-Up Text", type: "text", placeholder: "e.g. 'Reply with your pick!' or 'Swipe up to order'" }
  ],
  aiPromptInstructions: `Generate an Instagram Story draft. Structure:
    - storyCopy: The punchy text overlay on the story frame. Under 15 words. Native, casual tone.
    - storyMediaType: Either "Video (5-15s clip)" or "Static (designed frame)".
    - storyFeature: Which IG interactive sticker to use: Poll, Quiz, Question Box, Countdown, Emoji Slider, Link Sticker, Music, Mention, or None.
    - featureConfig: How the feature is configured (e.g. poll options, quiz question).
    - visualDirective: Background and styling direction.
    - caption: The reply CTA or swipe-up text.
    Stories are ephemeral — they should feel raw, urgent, and interactive. Not polished.`,
  bestPractices: [
    "Stories vanish in 24h — create urgency",
    "Interactive stickers boost reach 2-3x",
    "Keep text under 15 words per frame",
    "Video stories outperform static 60%+",
    "Use the first frame to hook — no slow intros"
  ]
}

// ═══════════════════════════════════════════════════════
// X (TWITTER)
// ═══════════════════════════════════════════════════════

const X_TEXT: PlatformFormatSpec = {
  platformKey: "X (Twitter)",
  formatKey: "Text",
  displayName: "X / Twitter Post",
  draftFields: [
    { key: "tweetBody", label: "Tweet Copy", type: "textarea", placeholder: "The full tweet (280 chars max). Front-load the hook.", rows: 3, required: true, maxLength: 280 },
    { key: "engagementHook", label: "Engagement Hook", type: "text", placeholder: "The closing question or CTA to drive replies" },
    { key: "hashtags", label: "Hashtags (1-3 max)", type: "text", placeholder: "#relevant #tags" },
    { key: "quoteIdea", label: "Quote Tweet Bait", type: "text", placeholder: "A spicy take that makes people QT with their own opinion" }
  ],
  aiPromptInstructions: `Generate a Tweet (X post) draft. Structure:
    - tweetBody: The full tweet. MAX 280 characters. Front-load the value. Bold opener. No fluff.
    - engagementHook: A closing question/CTA designed to spark replies (replies > likes in algorithm).
    - hashtags: 1-3 relevant hashtags only.
    - quoteIdea: A spicy/contrarian angle that encourages Quote Tweets.
    Tweets must be punchy, opinionated, and feel like a real human wrote them. No corporate tone.`,
  bestPractices: [
    "280 chars max — every word must earn its place",
    "Replies & QTs are worth 10x a like",
    "1-3 hashtags only — over-tagging kills reach",
    "Post and reply in first 30 min = algorithm boost",
    "Contrarian takes outperform safe opinions"
  ]
}

const X_THREAD: PlatformFormatSpec = {
  platformKey: "X (Twitter)",
  formatKey: "Thread",
  displayName: "X / Twitter Thread",
  draftFields: [
    { key: "hookTweet", label: "Hook Tweet (1/n)", type: "textarea", placeholder: "The opening tweet. Must be specific, bold, and promise value.", rows: 2, required: true, maxLength: 280 },
    { key: "threadBody", label: "Thread Body (2/n → n-1/n)", type: "textarea", placeholder: "Tweet 2/n: ...\nTweet 3/n: ...\n(One idea per tweet, numbered)", rows: 10, required: true },
    { key: "closingTweet", label: "Closing Tweet (n/n)", type: "textarea", placeholder: "Summary + single CTA. Link or engagement prompt.", rows: 2, required: true, maxLength: 280 },
    { key: "hashtags", label: "Hashtags (hook tweet only)", type: "text", placeholder: "#relevant" }
  ],
  aiPromptInstructions: `Generate an X Thread draft. Structure:
    - hookTweet: Opening tweet (280 chars max). Must promise specific value. Bold opener.
    - threadBody: Full thread body. Format as "Tweet 2/n: [content]" per tweet. One idea per tweet. 5-10 tweets ideal. Use images/data references where helpful.
    - closingTweet: Final tweet (280 chars). Summarize and give ONE CTA.
    - hashtags: 1-3 for the hook tweet only.
    Threads outperform single tweets because of "dwell time." Each tweet must compel reading the next.`,
  bestPractices: [
    "Number your tweets (1/n, 2/n) for tracking",
    "One idea per tweet — don't cram",
    "5-10 tweets is the sweet spot",
    "Hook tweet IS your ad — make it irresistible",
    "Closing CTA: one clear action, not three"
  ]
}

// ═══════════════════════════════════════════════════════
// LINKEDIN
// ═══════════════════════════════════════════════════════

const LINKEDIN_TEXT: PlatformFormatSpec = {
  platformKey: "LinkedIn",
  formatKey: "Text",
  displayName: "LinkedIn Text Post",
  draftFields: [
    { key: "hookLine", label: "Hook (First 2 Lines)", type: "textarea", placeholder: "The first 2 lines visible before 'see more'. Make them count.", rows: 2, required: true },
    { key: "bodyNarrative", label: "Body Narrative", type: "textarea", placeholder: "The full story/insight. Short paragraphs, 1-2 sentences each. Storytelling format.", rows: 8, required: true },
    { key: "closingCTA", label: "Closing CTA", type: "textarea", placeholder: "End with a specific question or action prompt", rows: 2, required: true },
    { key: "hashtags", label: "Hashtags (3-5)", type: "text", placeholder: "#industry #topic #branded" }
  ],
  aiPromptInstructions: `Generate a LinkedIn Text Post draft. Structure:
    - hookLine: The first 2 lines (before "see more"). Must create instant tension, curiosity, or value promise. This is the ONLY thing most people read.
    - bodyNarrative: Full post body. Use short paragraphs (1-2 sentences each). Storytelling format: Setup → Tension → Resolution → Insight. NO corporate jargon.
    - closingCTA: End with a specific question to drive comments (comments are king on LinkedIn).
    - hashtags: 3-5 relevant industry/topic hashtags.
    LinkedIn rewards dwell time and comments. Write like a human sharing a real experience, not a brand broadcasting.`,
  bestPractices: [
    "First 2 lines must hook — it's all people see",
    "Short paragraphs (1-2 sentences) for readability",
    "Comments are 5x more valuable than likes",
    "NO links in post body (kills reach by 60%)",
    "Storytelling > bullet points for text posts"
  ]
}

const LINKEDIN_CAROUSEL: PlatformFormatSpec = {
  platformKey: "LinkedIn",
  formatKey: "Carousel",
  displayName: "LinkedIn Carousel (PDF)",
  draftFields: [
    { key: "coverSlide", label: "Cover Slide", type: "textarea", placeholder: "The headline that makes people start swiping", rows: 2, required: true },
    { key: "slideBreakdown", label: "Slide-by-Slide Content", type: "textarea", placeholder: "Slide 2: [Title] — [Key Point]\nSlide 3: [Title] — [Key Point]\n...", rows: 10, required: true },
    { key: "closingSlide", label: "Closing CTA Slide", type: "text", placeholder: "Final slide with follow/connect CTA", required: true },
    { key: "caption", label: "Post Caption", type: "textarea", placeholder: "Short caption that introduces the carousel topic", rows: 3, required: true },
    { key: "hashtags", label: "Hashtags (3-5)", type: "text", placeholder: "#industry #topic" }
  ],
  aiPromptInstructions: `Generate a LinkedIn Carousel (PDF document) draft. Structure:
    - coverSlide: First slide headline. Must be bold, specific, and promise a framework/guide.
    - slideBreakdown: Full slide content. Format as "Slide N: [Title] — [Key Point]". Aim for 8-12 slides. Educational/framework content. One idea per slide.
    - closingSlide: Final CTA slide text (follow, connect, save).
    - caption: Short post caption (2-3 sentences) introducing the carousel.
    - hashtags: 3-5 relevant hashtags.
    LinkedIn carousels (PDFs) generate the highest engagement on the platform. Dwell time from swiping signals quality to the algorithm.`,
  bestPractices: [
    "Carousels = #1 format on LinkedIn in 2026",
    "8-12 slides is optimal",
    "Educational/framework content performs best",
    "Consistent visual design across slides",
    "Upload as PDF for carousel format"
  ]
}

const LINKEDIN_STATIC: PlatformFormatSpec = {
  platformKey: "LinkedIn",
  formatKey: "Static",
  displayName: "LinkedIn Image Post",
  draftFields: [
    { key: "creativeHeadline", label: "Image Headline", type: "text", placeholder: "Bold text on the image", required: true },
    { key: "creativeBody", label: "Image Body Text", type: "textarea", placeholder: "Supporting text on the image", rows: 2 },
    { key: "caption", label: "Post Caption", type: "textarea", placeholder: "Caption with context and CTA", rows: 5, required: true },
    { key: "hashtags", label: "Hashtags (3-5)", type: "text", placeholder: "#industry #topic" },
    { key: "visualDirective", label: "Visual Directive", type: "textarea", placeholder: "Image composition, professional design direction", rows: 2 }
  ],
  aiPromptInstructions: `Generate a LinkedIn Image Post draft. Structure:
    - creativeHeadline: Bold headline text on the image.
    - creativeBody: Supporting text on the image.
    - caption: Full post caption with professional storytelling.
    - hashtags: 3-5 relevant hashtags.
    - visualDirective: Image style — professional, data-driven, clean.
    LinkedIn images should feel professional but not corporate. Data visualizations and quote cards perform well.`,
  bestPractices: [
    "Professional but not corporate",
    "Data visualizations & quote cards perform well",
    "4:5 portrait format recommended for mobile",
    "Caption should add context the image doesn't cover",
    "Tag relevant people/companies for extra reach"
  ]
}

// ═══════════════════════════════════════════════════════
// FALLBACK (for any platform+format not explicitly defined)
// ═══════════════════════════════════════════════════════

const DEFAULT_SPEC: PlatformFormatSpec = {
  platformKey: "default",
  formatKey: "default",
  displayName: "Content Draft",
  draftFields: [
    { key: "hooks", label: "Scroll-Stopping Hooks", type: "textarea", placeholder: "3 hook variations", rows: 3, required: true },
    { key: "caption", label: "Optimized Caption & Copy", type: "textarea", placeholder: "Full post copy", rows: 6, required: true },
    { key: "hashtags", label: "Hashtags", type: "text", placeholder: "#relevant #tags" },
    { key: "visualDirective", label: "Visual Directive", type: "textarea", placeholder: "Art direction for the visual", rows: 3 }
  ],
  aiPromptInstructions: `Generate a content draft with:
    - hooks: 3 scroll-stopping hook variations.
    - caption: Full optimized caption/copy.
    - hashtags: Relevant hashtags.
    - visualDirective: Visual art direction.`,
  bestPractices: [
    "Lead with a hook that stops the scroll",
    "One CTA per post — don't overwhelm",
    "Native content > cross-posted content",
    "Consistency builds algorithmic trust"
  ]
}

// ═══════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════

const ALL_SPECS: PlatformFormatSpec[] = [
  META_REEL, META_CAROUSEL, META_STATIC, META_STORY,
  X_TEXT, X_THREAD,
  LINKEDIN_TEXT, LINKEDIN_CAROUSEL, LINKEDIN_STATIC,
]

/**
 * Get the content specification for a given platform + format combination.
 * Falls back to DEFAULT_SPEC if no exact match is found.
 */
export function getContentSpec(platform: string, format: string): PlatformFormatSpec {
  const exact = ALL_SPECS.find(
    s => s.platformKey === platform && s.formatKey === format
  )
  if (exact) return exact

  // Try matching just the platform (any format)
  const platformMatch = ALL_SPECS.find(s => s.platformKey === platform)
  if (platformMatch) {
    // Clone but with adjusted display name
    return { ...DEFAULT_SPEC, platformKey: platform, formatKey: format, displayName: `${platform} — ${format}` }
  }

  return { ...DEFAULT_SPEC, displayName: `${platform} — ${format}` }
}

/**
 * Get the AI prompt instructions for a specific platform+format.
 */
export function getAIInstructions(platform: string, format: string): string {
  return getContentSpec(platform, format).aiPromptInstructions
}
