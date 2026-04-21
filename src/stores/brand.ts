// src/stores/brand.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Strategy {
  targetAudience: string
  persona: string
  coreNarratives: string

  // Legendary Marketer Extensions
  oneLineStrategy?: string
  strategyGrid?: string
  socialCreativeKit?: string
  socialMediaSpine?: string
  measurementPlan?: string
  riskOpportunityMap?: string
  competitorAnalysis?: string
  psychographicTriggers?: string

  // Platform Native Strategies
  platformPlaybooks?: Record<string, PlatformPlaybook>

  // Content Distribution
  pillars?: { title: string; val: string }[]
  competitors?: string[]

  // Content Pillars & Buckets (per-platform)
  contentPillars?: Record<string, ContentPillar[]> // keyed by platform name

  // Strategic Pattern Library
  strategicPatterns?: StrategicPattern[]

  // Compiled Brand OS — knowledge base baked in during strategy generation
  // so downstream calls (content, calendar, concepts) never load the full KB again.
  compiledBrandOS?: CompiledBrandOS

  lastRefreshed?: string // ISO string
}

export interface CompiledBrandOS {
  platformRules: Record<string, string>        // platform name → algorithm rules for THIS brand's platforms only
  categoryContext: {
    categoryName: string
    clichesToAvoid: string[]
    whitespaceOpportunities: string[]
    differentiationSignals: string[]
  }
  formatBlueprints: Record<string, string>     // format name → structural pattern (hook/body/CTA anatomy)
  antiPatternChecklist: Array<{
    pattern: string
    detectionMarker: string
    fix: string
  }>
  qualityRules: {
    bannedWords: string[]
    categoryCliches: string[]
    bossChecklist: string[]
  }
  compiledAt: string                            // ISO timestamp
}

export interface StrategicPattern {
  id: string       // e.g., "Pattern 01"
  name: string     // e.g., "Polarization-as-Positioning"
  family: string   // e.g., "Positioning Moves"
  description: string
  executionMarkers: string[]
}

// ── Content Pillars & Buckets ──
export interface ContentPillar {
  id: string
  name: string           // e.g. "Product Spotlight"
  description: string    // e.g. "Showcasing our core products in aspirational contexts"
  buckets: ContentBucket[]
}

export interface ContentBucket {
  id: string
  name: string           // e.g. "Hero Product Close-Ups"
  description: string    // e.g. "Macro shots of signature sandwiches with ingredient callouts"
  pillarId: string       // links back to ContentPillar.id
  suggestedMinPerMonth: number  // e.g. 2
  suggestedMaxPerMonth: number  // e.g. 4
  formats?: string[]     // e.g. ["Static", "Carousel"] — preferred formats for this bucket
}

export interface PlatformPlaybook {
  role: string // e.g. "Brand Awareness & Visual Lifestyle"
  mechanics: string // e.g. "70% high-contrast Reels, 30% Carousels. No static images."
  toneModifier: string // e.g. "Dial up the aesthetic aggression by 20%"
  cadence: string // e.g. "Post 2x a week, heavily indexed on Wednesday mornings."
}

export interface PredictedMetrics {
  reach: { value: string, trend: string }
  engagement: { value: string, trend: string }
  visits: { value: string, trend: string }
  roi: { value: string, status: string }
  growthData: { x: number, y: number }[]
}

// ── Product/Service Intelligence ──
export interface ProductEntry {
  name: string
  description: string
  features: string[]
  priceRange?: string
  targetSegment?: string
}

export interface ServiceEntry {
  name: string
  description: string
  deliverables: string[]
  targetSegment?: string
}

export interface UploadedDoc {
  name: string
  type: 'pdf' | 'image' | 'doc' | 'url'
  url: string              // Supabase storage URL or local blob
  extractedContent?: string // AI-extracted text
}

// ── AI Evolution Tracking ──
export interface GenerationEvent {
  postId: string
  platform: string
  format: string
  contentIntent?: string
  generatedAt: string       // ISO date
  editDistanceScore?: number // 0.0 = rewritten, 1.0 = kept as-is
  regenerationCount: number
  timeToApprovalSeconds?: number
  status: 'generated' | 'approved' | 'edited' | 'regenerated' | 'deleted'
  qualityScore?: number     // 1-10 from quality scorer (audit mode)
}

export interface BrandInfo {
  name: string
  industry: string
  industryCustom?: string
  website?: string

  // AI Copilot Mode
  aiResearchMode?: boolean

  // Strict Questionnaire Matrices
  primaryAudiences: string[]
  secondaryAudience?: string
  ageRange?: string
  psychographics?: string
  primaryGoals: string[]
  tone: string[] // e.g. ["Playful", "Disruptive"]
  communicationStyle: string

  // Strategic Depth
  platforms: string[] // e.g., ["Instagram", "LinkedIn", "Twitter", "TikTok"]
  contentFrequency?: Record<string, string> // Map platform to frequency text
  competitors?: string
  usp?: string

  // Visual DNA
  primaryColorHex?: string
  secondaryColorHex?: string
  additionalColors?: string[]
  referenceUrls: string[]
  brandAssets?: string[] // Stores Supabase asset URLs

  extraNotes?: string

  // The Dynamic Brain
  aiKnowledgeBase?: string[]
  pendingInsights?: string[]

  // Product/Service Intelligence
  coreProducts?: string[] // Anti-hallucination anchor: exact product/menu names the AI MUST use
  brandType?: 'product' | 'service' | 'hybrid'
  productCatalog?: ProductEntry[]
  serviceOfferings?: ServiceEntry[]
  productPageUrls?: string[]       // Links the AI can scrape for product features
  uploadedDocs?: UploadedDoc[]     // Pitch decks, PDFs, feature lists

  // Brand Media Library
  brandReferences?: BrandAsset[]   // Moodboards, reference images, PPTs, docs
  productImages?: BrandAsset[]     // Product photos mapped to productCatalog
  brandLogos?: BrandAsset[]        // Logo files (PNG, SVG, WebP)

  // Typography
  headingFont?: string             // e.g. "Playfair Display", "Montserrat Bold"
  bodyFont?: string                // e.g. "Inter", "Open Sans"
  fontSpecimenImages?: BrandAsset[] // Screenshots/samples of the brand fonts in use

  // Visual Guardrails (AI-derived + user-edited)
  visualGuardrails?: VisualGuardrail[]
}

export interface BrandAsset {
  id: string
  name: string
  type: 'image' | 'pdf' | 'doc' | 'ppt' | 'webp' | 'other'
  url: string          // base64 data URL or blob URL
  thumbnailUrl?: string
  size?: number        // bytes
  addedAt: string      // ISO date
  linkedProductName?: string // for productImages: which product this belongs to
}

export interface PostReference {
  id: string
  category: 'product' | 'character' | 'scene' | 'aesthetic' | 'general'
  url: string          // base64 data URL
  name: string
}

export interface VisualGuardrail {
  id: string
  type: 'do' | 'dont'
  rule: string         // e.g. "Use warm golden lighting in food shots"
  source: 'ai' | 'user'
}

export type FeedAesthetic = 'pastel' | 'bright' | 'monochrome' | 'earthy' | 'neon' | 'minimal' | null

export interface CalendarPost {
  id: string
  date: string // ISO Date string e.g., "toISOString().split('T')[0]"
  platform: string // e.g. "Instagram", "LinkedIn"
  format: 'Reel' | 'Carousel' | 'Static' | 'Story' | 'Text' | 'Thread'
  pillar: string
  topic: string
  eventContext?: string // e.g., "Diwali Special", "Product Launch"

  // Content Bucket Tracking
  bucketId?: string     // links to ContentBucket.id
  bucketName?: string   // e.g. "Hero Product Close-Ups"

  // Per-Post Marketing Intelligence (AI-generated)
  psychTrigger?: string // e.g. "Attacks the Nostalgia lever by evoking childhood kitchen memories"
  usageStory?: string // e.g. "Shows the product in a morning chai ritual context"
  strategicPatternId?: string // e.g. "Pattern 01"
  strategicPatternName?: string // e.g. "Polarization-as-Positioning"

  // Story-Specific Fields (only for format: 'Story')
  storyMediaType?: 'video' | 'static' // Video clip or static image
  storyFeature?: string // Instagram feature: Poll, Quiz, Question Box, Countdown, Emoji Slider, Link, Music, Mention
  storyCopy?: string // The actual text overlay copy for the story frame

  // Visual References (AI-found moodboard links)
  visualReferences?: VisualRef[]
  activeReferenceId?: string | null  // which reference is approved/selected
  referenceSearchQuery?: string      // the query used (for re-searching)
}

export interface VisualRef {
  id: string
  title: string
  imageUrl: string       // direct image URL
  sourceUrl: string      // Pinterest/Insta page link
  sourcePlatform: string // 'pinterest' | 'instagram' | 'behance' | 'dribbble' | 'other'
  description: string    // why this reference matches
  status: 'suggested' | 'approved' | 'custom'  // custom = user pasted their own
}

export interface ContentDraft {
  // Legacy fields (backward compat - used by older drafts)
  hooks: string[]
  caption: string
  visualDescription: string
  hashtags: string

  // Platform-native fields (keyed by DraftField.key from platform-specs.ts)
  platformFields?: Record<string, string>

  // Visual generation
  generatedVisuals?: string[] // base64 image URLs

  // Hook selection
  approvedHookIndex?: number // which hook the user selected

  // Per-post reference images (categorized)
  postReferences?: PostReference[]
}

export interface ToneFingerprint {
  avgSentenceLength: number
  emojiFrequency: number // per 100 words
  hinglishRatio: number // 0-1
  questionFrequency: number // per post
  hashtagDensity: number // avg per post
  topWords: string[] // most used non-stop words
  punchiness: number // 1-10 scale
  analyzedAt: string // ISO date
  sampleSize: number // how many drafts analyzed
}

export interface BrandData {
  id: string
  hasOnboarded: boolean
  brandInfo: BrandInfo | null
  strategy: Strategy | null
  calendar: CalendarPost[] | null
  contentDrafts: Record<string, ContentDraft>
  draftHistory: Record<string, ContentDraft[]> // A/B Memory: previous variants per post
  predictedMetrics: PredictedMetrics | null
  onboardingPath: 'ai' | 'manual' | null
  researchData: any | null
  toneFingerprint: ToneFingerprint | null
  lastKbAudit: string | null // ISO date of last knowledge base audit
  generationEvents: GenerationEvent[] // AI evolution: tracks every generation + user action
  editEvents: EditEventRecord[]       // Pattern detection: tracks every content edit
  dismissedPatterns: string[]          // Pattern keys the user dismissed (don't nag again)
}

// Stored version of EditEvent (matches lib/edit-pattern-detector.ts but avoids circular import)
export interface EditEventRecord {
  id: string
  postId: string
  platform: string
  format: string
  fieldName: string
  editType: string
  originalText: string
  editedText: string
  timestamp: string
  similarity: number
}

interface BrandState {
  brands: Record<string, BrandData>
  activeBrandId: string | null

  createBrand: (id: string, info: BrandInfo) => void
  setActiveBrand: (id: string) => void
  clearActiveBrand: () => void
  deleteBrand: (id: string) => void

  // Actions for the active brand
  setBrandInfo: (info: BrandInfo) => void
  setStrategy: (strategy: Strategy) => void
  completeOnboarding: () => void

  setCalendar: (posts: CalendarPost[]) => void
  updateCalendarPost: (postId: string, postData: Partial<CalendarPost>) => void
  saveDraft: (postId: string, draft: ContentDraft) => void
  saveDraftVariant: (postId: string, draft: ContentDraft) => void // pushes current draft to history, saves new one
  resetActiveBrand: () => void
  setPredictedMetrics: (metrics: PredictedMetrics) => void
  setOnboardingPath: (path: 'ai' | 'manual') => void
  setResearchData: (data: any) => void
  addAiKnowledge: (fact: string) => void
  addPendingInsight: (insight: string) => void
  approveInsight: (index: number) => void
  rejectInsight: (index: number) => void
  setToneFingerprint: (fp: ToneFingerprint) => void
  setLastKbAudit: (date: string) => void

  // AI Evolution Tracking
  trackGeneration: (event: GenerationEvent) => void
  logEditDistance: (postId: string, score: number) => void

  // Edit Pattern Detection
  addEditEvent: (event: EditEventRecord) => void
  dismissPattern: (patternKey: string) => void
}

const initialBrandData = (): Omit<BrandData, 'id'> => ({
  hasOnboarded: false,
  brandInfo: null,
  strategy: null,
  calendar: null,
  contentDrafts: {},
  draftHistory: {},
  predictedMetrics: null,
  onboardingPath: null,
  researchData: null,
  toneFingerprint: null,
  lastKbAudit: null,
  generationEvents: [],
  editEvents: [],
  dismissedPatterns: []
})

export const useBrandStore = create<BrandState>()(
  persist(
    (set) => ({
      brands: {},
      activeBrandId: null,

      createBrand: (id, info) => set((state) => ({
        brands: { ...state.brands, [id]: { id, ...initialBrandData(), brandInfo: info } },
        activeBrandId: id
      })),

      setActiveBrand: (id) => set({ activeBrandId: id }),
      clearActiveBrand: () => set({ activeBrandId: null }),

      deleteBrand: (id) => set((state) => {
        const newBrands = { ...state.brands }
        delete newBrands[id]
        return {
          brands: newBrands,
          activeBrandId: state.activeBrandId === id ? (Object.keys(newBrands)[0] || null) : state.activeBrandId
        }
      }),

      setBrandInfo: (info) => set((state) => {
        if (!state.activeBrandId) return state;
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...state.brands[state.activeBrandId], brandInfo: info }
          }
        }
      }),

      addAiKnowledge: (fact) => set((state) => {
        if (!state.activeBrandId) return state;
        const brand = state.brands[state.activeBrandId]
        if (!brand || !brand.brandInfo) return state;

        const currentKb = brand.brandInfo.aiKnowledgeBase || []
        const newKb = [fact, ...currentKb].slice(0, 20)

        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: {
              ...brand,
              brandInfo: { ...brand.brandInfo, aiKnowledgeBase: newKb }
            }
          }
        }
      }),

      addPendingInsight: (insight) => set((state) => {
        if (!state.activeBrandId) return state;
        const brand = state.brands[state.activeBrandId]
        if (!brand || !brand.brandInfo) return state;

        const currentPending = brand.brandInfo.pendingInsights || []
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: {
              ...brand,
              brandInfo: { ...brand.brandInfo, pendingInsights: [insight, ...currentPending] }
            }
          }
        }
      }),

      approveInsight: (index) => set((state) => {
        if (!state.activeBrandId) return state;
        const brand = state.brands[state.activeBrandId]
        if (!brand || !brand.brandInfo) return state;

        const pending = [...(brand.brandInfo.pendingInsights || [])]
        const insight = pending.splice(index, 1)[0]
        if (!insight) return state;

        const currentKb = brand.brandInfo.aiKnowledgeBase || []

        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: {
              ...brand,
              brandInfo: {
                ...brand.brandInfo,
                pendingInsights: pending,
                aiKnowledgeBase: [insight, ...currentKb].slice(0, 20)
              }
            }
          }
        }
      }),

      rejectInsight: (index) => set((state) => {
        if (!state.activeBrandId) return state;
        const brand = state.brands[state.activeBrandId]
        if (!brand || !brand.brandInfo) return state;

        const pending = [...(brand.brandInfo.pendingInsights || [])]
        pending.splice(index, 1)

        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: {
              ...brand,
              brandInfo: { ...brand.brandInfo, pendingInsights: pending }
            }
          }
        }
      }),

      setStrategy: (strategy) => set((state) => {
        if (!state.activeBrandId) return state;
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...state.brands[state.activeBrandId], strategy }
          }
        }
      }),

      completeOnboarding: () => set((state) => {
        if (!state.activeBrandId) return state;
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...state.brands[state.activeBrandId], hasOnboarded: true }
          }
        }
      }),

      setCalendar: (posts) => set((state) => {
        if (!state.activeBrandId) return state;
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...state.brands[state.activeBrandId], calendar: posts }
          }
        }
      }),

      updateCalendarPost: (postId, postData) => set((state) => {
        if (!state.activeBrandId) return state;
        const brand = state.brands[state.activeBrandId]
        if (!brand.calendar) return state;
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: {
              ...brand,
              calendar: brand.calendar.map(p => p.id === postId ? { ...p, ...postData } : p)
            }
          }
        }
      }),

      saveDraft: (postId, draft) => set((state) => {
        if (!state.activeBrandId) return state;
        const brand = state.brands[state.activeBrandId]
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: {
              ...brand,
              contentDrafts: { ...brand.contentDrafts, [postId]: draft }
            }
          }
        }
      }),

      resetActiveBrand: () => set((state) => {
        if (!state.activeBrandId) return state;
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { id: state.activeBrandId, ...initialBrandData() }
          }
        }
      }),

      setPredictedMetrics: (metrics) => set((state) => {
        if (!state.activeBrandId) return state;
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...state.brands[state.activeBrandId], predictedMetrics: metrics }
          }
        }
      }),

      setOnboardingPath: (path) => set((state) => {
        if (!state.activeBrandId) return state;
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...state.brands[state.activeBrandId], onboardingPath: path }
          }
        }
      }),

      setResearchData: (data) => set((state) => {
        if (!state.activeBrandId) return state;
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...state.brands[state.activeBrandId], researchData: data }
          }
        }
      }),

      saveDraftVariant: (postId, draft) => set((state) => {
        if (!state.activeBrandId) return state;
        const brand = state.brands[state.activeBrandId]
        const currentDraft = brand.contentDrafts[postId]
        const currentHistory = brand.draftHistory?.[postId] || []

        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: {
              ...brand,
              contentDrafts: { ...brand.contentDrafts, [postId]: draft },
              draftHistory: {
                ...brand.draftHistory,
                [postId]: currentDraft
                  ? [...currentHistory, currentDraft].slice(-5) // Keep last 5 variants max
                  : currentHistory
              }
            }
          }
        }
      }),

      setToneFingerprint: (fp) => set((state) => {
        if (!state.activeBrandId) return state;
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...state.brands[state.activeBrandId], toneFingerprint: fp }
          }
        }
      }),

      setLastKbAudit: (date) => set((state) => {
        if (!state.activeBrandId) return state;
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...state.brands[state.activeBrandId], lastKbAudit: date }
          }
        }
      }),

      // ── AI Evolution Tracking ──
      trackGeneration: (event) => set((state) => {
        if (!state.activeBrandId) return state;
        const brand = state.brands[state.activeBrandId]
        const events = [...(brand.generationEvents || []), event].slice(-500)
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...brand, generationEvents: events }
          }
        }
      }),

      logEditDistance: (postId, score) => set((state) => {
        if (!state.activeBrandId) return state;
        const brand = state.brands[state.activeBrandId]
        const events = [...(brand.generationEvents || [])]
        for (let i = events.length - 1; i >= 0; i--) {
          if (events[i].postId === postId && events[i].status === 'generated') {
            events[i] = { ...events[i], editDistanceScore: score, status: score > 0.85 ? 'approved' : 'edited' }
            break
          }
        }
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...brand, generationEvents: events }
          }
        }
      }),

      // ── Edit Pattern Detection ──
      addEditEvent: (event) => set((state) => {
        if (!state.activeBrandId) return state;
        const brand = state.brands[state.activeBrandId]
        // Keep last 200 edit events per brand
        const events = [...(brand.editEvents || []), event].slice(-200)
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...brand, editEvents: events }
          }
        }
      }),

      dismissPattern: (patternKey) => set((state) => {
        if (!state.activeBrandId) return state;
        const brand = state.brands[state.activeBrandId]
        const dismissed = [...(brand.dismissedPatterns || []), patternKey]
        return {
          brands: {
            ...state.brands,
            [state.activeBrandId]: { ...brand, dismissedPatterns: dismissed }
          }
        }
      }),
    }),
    {
      name: 'cadence-brand-storage',
      storage: {
        getItem: async (name) => {
          if (typeof window === 'undefined') return null
          const { get } = await import('idb-keyval')
          const key = await getUserStorageKey(name)
          const val = await get(key)
          // Fallback: migrate from old un-keyed storage if exists
          if (!val) {
            const oldVal = await get(name)
            if (oldVal) {
              const { set } = await import('idb-keyval')
              await set(key, oldVal) // migrate to user-keyed
              return JSON.parse(oldVal as string)
            }
            // Also check localStorage
            if (typeof localStorage !== 'undefined') {
              const lsVal = localStorage.getItem(name)
              if (lsVal) {
                const { set } = await import('idb-keyval')
                await set(key, lsVal)
                localStorage.removeItem(name)
                return JSON.parse(lsVal)
              }
            }
          }
          return val ? JSON.parse(val as string) : null
        },
        setItem: async (name, value) => {
          if (typeof window === 'undefined') return
          const { set } = await import('idb-keyval')
          const key = await getUserStorageKey(name)
          await set(key, JSON.stringify(value))
        },
        removeItem: async (name) => {
          if (typeof window === 'undefined') return
          const { del } = await import('idb-keyval')
          const key = await getUserStorageKey(name)
          await del(key)
        },
      },
    }
  )
)

/** Get a user-specific storage key so each login gets isolated data */
async function getUserStorageKey(baseName: string): Promise<string> {
  if (typeof window === 'undefined') return baseName
  try {
    const { createBrowserClient } = await import('@supabase/ssr')
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await supabase.auth.getUser()
    if (data?.user?.id) {
      return `${baseName}::${data.user.id}`
    }
  } catch {
    // Auth not ready yet, use base key
  }
  return baseName
}
