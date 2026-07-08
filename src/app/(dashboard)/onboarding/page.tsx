'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useBrandStore, BrandInfo, ProductEntry, ServiceEntry, UploadedDoc } from '@/stores/brand'
// generateBrandStrategy moved to API route to avoid 60s serverless timeout
import { researchBrand, BrandResearch, ToneSample, startBrandDeepResearch, pollDeepResearch, synthesizeResearchReport } from '@/actions/research'
import { generateOnboardingQuestions, DynamicOnboardingQuestions } from '@/actions/onboardingQuestions'
import { ResearchWaiting } from '@/components/ui/ResearchWaiting'
import { extractEpiphany } from '@/actions/epiphany'
import { extractFromMultipleSources } from '@/actions/productExtractor'
import { generateClarifyingQuestions, ClarifyingQuestion } from '@/actions/clarify'
import { AskAIButton, ExpandAIButton } from '@/components/ui/AskAIButton'
import { 
  Sparkles, ArrowRight, ArrowLeft, Building2, Users, Palette, 
  CheckCircle2, Link as LinkIcon, Plus, X, UploadCloud,
  Activity, RefreshCw, Camera, Briefcase, MessageSquare, Play, Globe, Music,
  Search, Brain, MessageCircle, Loader2, Paperclip, SkipForward, Infinity, Download,
  FileText, Wand2, Trash2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sanitizeErrorForUI } from '@/lib/error-sanitizer'
import { parseStreamedResponse } from '@/lib/streaming-fetch'

const PLATFORM_ICONS: Record<string, any> = {
  "Meta (Instagram & Facebook)": Infinity, "LinkedIn": Briefcase, "X (Twitter)": MessageSquare,
  "TikTok": Music, "YouTube": Play, "Pinterest": Camera,
  "Google Search (SEO)": Search, "Google Ads": Activity, "Amazon": Building2,
  "Swiggy/Zomato": Building2, "Discord": Users, "Reddit": MessageCircle,
  "default": Globe
}

export const MASTER_PLATFORM_LIBRARY = [
  // 1. Traditional Social & Micro-Blogging
  "Meta (Instagram & Facebook)", "LinkedIn", "X (Twitter)", "TikTok", "YouTube", "Pinterest", "Snapchat", "Threads",
  
  // 2. Search & SEO
  "Google Search (SEO)", "Google Ads (Search)", "YouTube SEO", "Pinterest Search", "Bing SEO",
  
  // 3. Quick-Commerce & Delivery (Q-Comm)
  "Amazon", "Flipkart", "Swiggy/Zomato", "Blinkit/Zepto", "Uber Eats / DoorDash",
  
  // 4. Niche & Dark Social
  "Discord", "Reddit", "Telegram", "WhatsApp Channels", "Quora",
  
  // 5. Programmatic & Display Ads
  "Google Display Network", "Connected TV (CTV)", "Taboola / Outbrain",
  
  // 6. Travel, Payment & Utility Apps
  "MakeMyTrip/Booking.com", "Google Pay/PhonePe/Paytm", "CRED", "Tinder/Bumble", "In-Game Ads (Roblox/Mobile)"
]

const INDUSTRIES = [
  "B2B SaaS", "E-commerce & D2C", "Real Estate", "Healthcare", "Financial Services", 
  "Creative Agency", "Education/Coaching", "FMCG", "HORECA", "Automobile", 
  "Consumer Electronics", "Fashion & Apparel", "Other (Custom)"
]

const AUDIENCE_ARCHETYPES = [
  "Gen-Z Trend Followers", "Busy Working Parents", "High-Net-Worth Individuals", 
  "C-Suite Executives", "Tech-Savvy Early Adopters", "Local Community Seekers", 
  "Creative Professionals", "Budget-Conscious Shoppers"
]

const GOALS = [
  "Drive Direct Sales & Conversions", "Build Thought Leadership & Trust", 
  "Grow Community & Organic Engagement", "Lead Generation & Email Capture", 
  "Brand Awareness & Virality"
]

const COMMUNICATION_STYLES = ["Short & Punchy", "Long-form Storytelling", "Highly Data-Driven", "Visual & Aesthetic-First"]
const PLATFORMS = ["Meta (Instagram & Facebook)", "LinkedIn", "X (Twitter)", "TikTok", "YouTube"]
const CONTENT_FREQUENCIES = ["Daily", "5x per week", "3x per week", "2x per week", "Weekly"]

const STEP_LABELS = ['Brand Entry', 'AI Research', 'Audience & Goals', 'Brand Voice', 'Platforms & Edge', 'Visual DNA', 'Open Floor', 'Review']

export default function OnboardingPage() {
  const router = useRouter()
  const { createBrand, setStrategy, setOnboardingPath, setResearchData } = useBrandStore()
  
  const [step, setStep] = React.useState(0)
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [isEditingResearch, setIsEditingResearch] = React.useState(false)
  const [isResearching, setIsResearching] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [research, setResearch] = React.useState<BrandResearch | null>(null)
  const [dynamicQ, setDynamicQ] = React.useState<DynamicOnboardingQuestions | null>(null)
  const [isCustomizingQuestions, setIsCustomizingQuestions] = React.useState(false)
  const [deepResearchId, setDeepResearchId] = React.useState<string | null>(null)
  const [researchElapsed, setResearchElapsed] = React.useState(0)
  const timerRef = React.useRef<NodeJS.Timeout | null>(null)
  const isResearchingRef = React.useRef<boolean>(false)
  const [clarifyingQuestions, setClarifyingQuestions] = React.useState<ClarifyingQuestion[]>([])
  const [clarifyingAnswers, setClarifyingAnswers] = React.useState<Record<string, string>>({})
  const [isLoadingQuestions, setIsLoadingQuestions] = React.useState(false)
  const [openFloorIndex, setOpenFloorIndex] = React.useState(0)
  const [openFloorFiles, setOpenFloorFiles] = React.useState<Record<string, string[]>>({})

  // ── Smart Product Importer state ──
  const [importerFiles, setImporterFiles] = React.useState<File[]>([])
  const [importerUrls, setImporterUrls] = React.useState<string[]>([])
  const [importerUrlInput, setImporterUrlInput] = React.useState('')
  const [importerLoading, setImporterLoading] = React.useState(false)
  const [importerStatus, setImporterStatus] = React.useState<string>('')
  const [importerError, setImporterError] = React.useState<string | null>(null)
  const [importedProducts, setImportedProducts] = React.useState<ProductEntry[]>([])
  const [importedServices, setImportedServices] = React.useState<ServiceEntry[]>([])
  const [importerWarnings, setImporterWarnings] = React.useState<string[]>([])

  async function runProductImporter() {
    setImporterError(null)
    setImporterWarnings([])
    setImportedProducts([])
    setImportedServices([])

    const urls: string[] = []
    if (formData.website?.trim()) urls.push(formData.website.trim())
    for (const u of importerUrls) if (u.trim()) urls.push(u.trim())

    if (!importerFiles.length && !urls.length) {
      setImporterError('Add at least one file or URL (your website URL counts).')
      return
    }

    setImporterLoading(true)
    try {
      // 1) Parse files server-side — one file per request to dodge Vercel's
      //    4.5 MB request body cap. Run with light concurrency.
      let parsedDocs: { source: string; text: string }[] = []
      if (importerFiles.length) {
        setImporterStatus(`Reading ${importerFiles.length} file(s) — vision OCR may take a minute…`)
        const CONCURRENCY = 3
        const queue = [...importerFiles]
        let completed = 0

        const uploadOne = async (file: File): Promise<{ source: string; text: string } | null> => {
          const fd = new FormData()
          fd.append('files', file)
          const res = await fetch('/api/upload', { method: 'POST', body: fd })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            setImporterWarnings((w) => [...w, `${file.name}: ${err.error || `upload failed (${res.status})`}`])
            return null
          }
          const json = await res.json()
          if (json.errors?.length) setImporterWarnings((w) => [...w, ...json.errors])
          return (json.documents && json.documents[0]) || null
        }

        const workers: Promise<void>[] = []
        for (let w = 0; w < CONCURRENCY; w++) {
          workers.push((async () => {
            while (queue.length) {
              const f = queue.shift()
              if (!f) break
              const doc = await uploadOne(f)
              if (doc) parsedDocs.push(doc)
              completed += 1
              setImporterStatus(`Read ${completed}/${importerFiles.length} file(s) — vision OCR is slow on big PDFs…`)
            }
          })())
        }
        await Promise.all(workers)
      }

      // 2) Combine + extract products
      setImporterStatus('Extracting products with AI…')
      const extraction = await extractFromMultipleSources({ parsedDocs, urls })
      if (!extraction.success) throw new Error(extraction.error || 'Extraction failed')
      setImportedProducts(extraction.data?.products || [])
      setImportedServices(extraction.data?.services || [])
      if (extraction.warnings?.length) setImporterWarnings((w) => [...w, ...(extraction.warnings || [])])
      setImporterStatus(
        `Extracted ${extraction.data?.products?.length || 0} product(s), ${extraction.data?.services?.length || 0} service(s).`
      )
    } catch (e: any) {
      setImporterError(e?.message || 'Import failed')
      setImporterStatus('')
    } finally {
      setImporterLoading(false)
    }
  }

  function commitImportedToBrand() {
    const existingNames = new Set((formData.coreProducts || []).map((n) => n.toLowerCase()))
    const newNames = importedProducts
      .map((p) => p.name)
      .filter((n) => n && !existingNames.has(n.toLowerCase()))

    const mergedCatalog = [...(formData.productCatalog || []), ...importedProducts]
    const mergedServices = [...(formData.serviceOfferings || []), ...importedServices]
    const mergedUrls = Array.from(
      new Set([...(formData.productPageUrls || []), ...importerUrls.filter(Boolean)])
    )
    const newDocs: UploadedDoc[] = importerFiles.map((f) => ({
      name: f.name,
      type: f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
        ? 'pdf'
        : f.type.startsWith('image/')
        ? 'image'
        : 'doc',
      url: '', // stateless v1 — file not persisted
    }))

    setFormData((prev) => ({
      ...prev,
      coreProducts: [...(prev.coreProducts || []), ...newNames],
      productCatalog: mergedCatalog,
      serviceOfferings: mergedServices,
      productPageUrls: mergedUrls,
      uploadedDocs: [...(prev.uploadedDocs || []), ...newDocs],
    }))

    // Reset importer
    setImportedProducts([])
    setImportedServices([])
    setImporterFiles([])
    setImporterUrls([])
    setImporterStatus(`✓ Saved ${newNames.length} product(s) to brand.`)
  }

  const [customChips, setCustomChips] = React.useState({
    primaryAudiences: [] as string[],
    primaryGoals: [] as string[],
    tone: [] as string[],
    platforms: [] as string[]
  })

  const [formData, setFormData] = React.useState<Partial<BrandInfo>>({
    name: '', industry: '', industryCustom: '', website: '',
    primaryAudiences: [], secondaryAudience: '', ageRange: '', psychographics: '',
    primaryGoals: [], tone: [], aiResearchMode: false,
    communicationStyle: '', platforms: [], competitors: '', usp: '',
    contentFrequency: {},
    primaryColorHex: '#0f172a', secondaryColorHex: '#ffffff',
    referenceUrls: [], brandAssets: [], extraNotes: ''
  })
  
  const [tempUrl, setTempUrl] = React.useState('')
  const [isUploading, setIsUploading] = React.useState(false)
  const [isThinking, setIsThinking] = React.useState(false)

  // --- Epiphany Background Worker ---
  const triggerEpiphany = async (fieldLabel: string, value: string) => {
    if (!value || value.trim() === '') return
    setIsThinking(true)
    try {
       const res = await extractEpiphany(fieldLabel, value, {
         brandName: formData.name, 
         industry: formData.industry, 
         websiteContext: research?.summary
       })
       if (res.success && res.insight) {
         setFormData(prev => ({ 
           ...prev, 
           aiKnowledgeBase: [res.insight as string, ...(prev.aiKnowledgeBase || [])].slice(0, 5)
         }))
       }
    } catch (e) {
      console.error(e)
    } finally {
      setIsThinking(false)
    }
  }

  // --- Helpers ---
  const updateForm = (key: string, value: any) => setFormData(prev => ({ ...prev, [key]: value }))
  
  const toggleItem = (key: 'primaryAudiences' | 'primaryGoals' | 'tone' | 'platforms', item: string, max = 3) => {
    const current = (formData[key] as string[]) || []
    if (current.includes(item)) {
      updateForm(key, current.filter((i: string) => i !== item))
    } else {
      triggerEpiphany(key, item)
      if (key !== 'platforms' && current.length >= max) {
         updateForm(key, [...current.slice(1), item]) // remove oldest, add new
      } else {
         updateForm(key, [...current, item])
      }
    }
  }

  const aiContext = React.useMemo(() => ({
    brandName: formData.name || '',
    industry: formData.industry || '',
    website: formData.website,
    researchSummary: research?.summary,
    previousAnswers: {
      ...(formData.ageRange ? { 'Age Range': formData.ageRange } : {}),
      ...(formData.psychographics ? { 'Psychographics': formData.psychographics } : {}),
      ...(formData.usp ? { 'USP': formData.usp } : {}),
      ...(formData.competitors ? { 'Competitors': formData.competitors } : {}),
    }
  }), [formData, research])

  // --- AI Research (Deep Research with fallback) ---
  const applyResearchData = (data: BrandResearch) => {
    setResearch(data)

    // Fire-and-forget: have the premium reasoning model rewrite the
    // remaining onboarding questions + options around this research.
    // Static options render until (and unless) this resolves.
    setDynamicQ(null)
    setIsCustomizingQuestions(true)
    generateOnboardingQuestions(data, formData.name || '', formData.industry || '')
      .then(res => { if (res.success && res.data) setDynamicQ(res.data) })
      .catch(() => {})
      .finally(() => setIsCustomizingQuestions(false))

    // Auto-populate brand name & industry if research discovered them
    if (data.brandName && !formData.name) updateForm('name', data.brandName)
    if (data.industry && !formData.industry) updateForm('industry', data.industry)

    // Step 2: Audience & Goals
    if (data.discoveredAudiences?.length) updateForm('primaryAudiences', data.discoveredAudiences.slice(0, 3))
    if (data.discoveredGoals?.length) updateForm('primaryGoals', data.discoveredGoals.slice(0, 3))
    if (data.audienceInsight && !formData.ageRange) updateForm('ageRange', data.audienceInsight)
    if (data.discoveredAudiences?.length > 3 && !formData.secondaryAudience) {
      updateForm('secondaryAudience', data.discoveredAudiences.slice(3).join(', '))
    }

    // Step 3: Brand Voice & Communication Style
    if (data.suggestedTone?.length) updateForm('tone', data.suggestedTone.slice(0, 3))
    if (data.communicationStyle) updateForm('communicationStyle', data.communicationStyle)

    // Step 4: Platforms & Content Frequency
    if (data.suggestedPlatforms?.length) {
      // Normalize AI-returned strings (e.g. "Instagram", "facebook") to MASTER_PLATFORM_LIBRARY entries
      // so Step 1 checkbox state + Step 5 frequency mapping line up.
      const normalize = (raw: string): string | null => {
        const s = raw.trim().toLowerCase()
        const exact = MASTER_PLATFORM_LIBRARY.find(p => p.toLowerCase() === s)
        if (exact) return exact
        if (/instagram|facebook|\bmeta\b/.test(s)) return "Meta (Instagram & Facebook)"
        if (/linkedin/.test(s)) return "LinkedIn"
        if (/twitter|\bx\b/.test(s)) return "X (Twitter)"
        if (/tiktok/.test(s)) return "TikTok"
        if (/youtube/.test(s)) return "YouTube"
        if (/pinterest/.test(s)) return "Pinterest"
        if (/snapchat/.test(s)) return "Snapchat"
        if (/threads/.test(s)) return "Threads"
        const partial = MASTER_PLATFORM_LIBRARY.find(p => p.toLowerCase().includes(s) || s.includes(p.toLowerCase()))
        return partial || null
      }
      const normalized = Array.from(new Set(
        (data.suggestedPlatforms || []).map(normalize).filter((p): p is string => !!p)
      ))
      data.suggestedPlatforms = normalized
      updateForm('platforms', normalized)

      // Auto-populate content frequency per platform from research
      if (data.contentFrequency && normalized.length > 0) {
        const freqMap = normalized.reduce((acc: Record<string, string>, p: string) => {
          acc[p] = data.contentFrequency!
          return acc
        }, {})
        updateForm('contentFrequency', freqMap)
      }
    }

    // Step 5: Visual DNA & Psychographics
    if (data.visualDirective) updateForm('visualDirective', data.visualDirective)
    if (data.psychographicTriggers) updateForm('psychographics', data.psychographicTriggers)

    // Step 6: USP & Competitor Intelligence
    if (data.uspHypothesis) updateForm('usp', data.uspHypothesis)
    if (data.competitorAnalysis) updateForm('competitors', data.competitorAnalysis)

    // Auto-populate core products from research (user can edit later)
    if (data.coreProducts?.length && !(formData.coreProducts?.length)) {
      updateForm('coreProducts', data.coreProducts)
    }
  }

  const runResearch = async () => {
    setIsResearching(true)
    isResearchingRef.current = true
    setError(null)
    setResearchElapsed(0)

    // Start timer immediately — works for both deep and fallback paths
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setResearchElapsed(prev => prev + 1), 1000)

    // Helper: run quick research (Claude Opus → GPT-5.5 fallback)
    const runQuickResearch = async (): Promise<boolean> => {
      try {
        console.log('⚡ Running quick research...')
        const res = await researchBrand(
          formData.name || '', formData.industry || '',
          formData.website, formData.extraNotes
        )
        if (res.success && res.data) {
          applyResearchData(res.data)
          return true
        }
      } catch (err) {
        console.error('Quick research threw:', err)
      }
      return false
    }

    try {
      // ──────────────────────────────────────────────
      // LAYER 1: OpenAI Deep Research (best quality)
      // ──────────────────────────────────────────────
      let deepResearchWorked = false
      try {
        const startRes = await startBrandDeepResearch(
          formData.name || '', formData.industry || '',
          formData.website, formData.extraNotes
        )

        if (startRes.success && startRes.interactionId) {
          setDeepResearchId(startRes.interactionId)

          let attempts = 0
          const maxAttempts = 120
          while (attempts < maxAttempts) {
            if (!isResearchingRef.current) return
            await new Promise(r => setTimeout(r, 10000))
            attempts++
            if (!isResearchingRef.current) return

            const status = await pollDeepResearch(startRes.interactionId)

            if (status.status === 'completed' && status.report) {
              console.log('🔬 Deep Research complete! Synthesizing...')
              try {
                const synthRes = await synthesizeResearchReport(
                  status.report, formData.name || '', formData.industry || ''
                )
                if (synthRes.success && synthRes.data) {
                  applyResearchData(synthRes.data)
                  deepResearchWorked = true
                }
              } catch (synthErr) {
                console.warn('⚠️ Synthesis threw:', synthErr)
              }
              break
            }

            if (status.status === 'failed') {
              console.warn('⚠️ Deep Research failed')
              break
            }
          }
        }
      } catch (deepErr) {
        console.warn('⚠️ Deep Research init failed:', deepErr)
      }

      if (deepResearchWorked) {
        setError(null)
        return // Done — best quality path succeeded
      }

      // ──────────────────────────────────────────────
      // LAYER 2: Quick research (Claude Opus → GPT-5.5)
      // ──────────────────────────────────────────────
      console.log('⚠️ Deep research did not produce results, trying quick research...')
      setDeepResearchId(null)
      const quickWorked = await runQuickResearch()

      if (quickWorked) {
        setError(null)
        return
      }

      // ──────────────────────────────────────────────
      // LAYER 3: Last resort — show retry, never crash
      // ──────────────────────────────────────────────
      console.error('❌ All research paths exhausted')
      setError('Research is temporarily unavailable. Please click Retry Research.')

    } catch (e: any) {
      console.error('Research top-level error:', e)
      setError('Research is temporarily unavailable. Please click Retry Research.')
    } finally {
      if (timerRef.current) clearInterval(timerRef.current)
      setIsResearching(false)
      isResearchingRef.current = false
      setDeepResearchId(null)
    }
  }

  const cancelDeepResearch = async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    isResearchingRef.current = false
    setDeepResearchId(null)
    setResearchElapsed(0)
    setError(null)
    setIsResearching(true)

    try {
      const res = await researchBrand(
        formData.name || '', formData.industry || '',
        formData.website, formData.extraNotes
      )
      if (res.success && res.data) {
        applyResearchData(res.data)
        setError(null)
      } else {
        setError('Quick research unavailable. Please try again.')
      }
    } catch {
      setError('Quick research unavailable. Please try again.')
    } finally {
      setIsResearching(false)
      isResearchingRef.current = false
    }
  }

  // --- Clarifying Questions ---
  const loadClarifyingQuestions = async () => {
    setIsLoadingQuestions(true)
    setOpenFloorIndex(0)
    try {
      const res = await generateClarifyingQuestions({
        brandName: formData.name || '', industry: formData.industry || '',
        website: formData.website, audiences: formData.primaryAudiences,
        goals: formData.primaryGoals, tone: formData.tone,
        platforms: formData.platforms, usp: formData.usp,
        competitors: formData.competitors, psychographics: formData.psychographics,
        extraNotes: formData.extraNotes
      })
      if (res.success && res.questions) setClarifyingQuestions(res.questions)
    } catch (e) { console.error("Failed to load questions:", e) }
    finally { setIsLoadingQuestions(false) }
  }

  // --- File Upload ---
  const processFiles = async (files: FileList | File[], target: 'assets' | 'openfloor') => {
    const arr = Array.from(files)
    if (!arr.length) return
    setIsUploading(true)
    setError(null)
    try {
      for (const file of arr) {
        const publicUrl = URL.createObjectURL(file)
        if (target === 'assets') {
          setFormData(prev => ({ ...prev, brandAssets: [...(prev.brandAssets || []), publicUrl] }))
        } else {
          const qId = clarifyingQuestions[openFloorIndex]?.id || 'general'
          setOpenFloorFiles(prev => ({ ...prev, [qId]: [...(prev[qId] || []), publicUrl] }))
        }
      }
    } catch (err: any) {
      setError(sanitizeErrorForUI(err?.message || 'Upload failed'))
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'assets' | 'openfloor') => {
    const files = e.target.files
    if (!files?.length) return
    await processFiles(files, target)
    e.target.value = ''
  }

  const addBrandReferences = async (files: FileList | File[]) => {
    const arr = Array.from(files)
    const existing = formData.brandReferences || []
    const slots = 15 - existing.length
    if (slots <= 0) return
    const newRefs: import('@/stores/brand').BrandAsset[] = []
    for (let i = 0; i < Math.min(arr.length, slots); i++) {
      const file = arr[i]; if (!file.type.startsWith('image/')) continue
      const url = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(file) })
      newRefs.push({ id: `ref-${Date.now()}-${i}-${Math.random().toString(36).slice(2,6)}`, name: file.name, type: file.type.includes('webp') ? 'webp' : 'image', url, size: file.size, addedAt: new Date().toISOString() })
    }
    updateForm('brandReferences', [...existing, ...newRefs])
  }

  // --- Navigation ---
  const handleNext = () => {
    if (step === 0) { setStep(1); runResearch() }
    else if (step === 5) { setStep(6); loadClarifyingQuestions() }
    else { setStep(s => Math.min(s + 1, 7)) }
  }
  const handlePrev = () => setStep(s => Math.max(s - 1, 0))

  // --- Submit ---
  async function handleSubmit() {
    setIsGenerating(true)
    setError(null)
    const brandId = `brand_${Date.now()}`
    
    const clarifyNotes = Object.entries(clarifyingAnswers)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => {
        const q = Array.isArray(clarifyingQuestions) ? clarifyingQuestions.find(q => q.id === k) : null
        return `Q: ${q?.question || k}\nA: ${v}`
      }).join('\n\n')
    
    const finalFormData = { 
      ...formData, 
      extraNotes: [formData.extraNotes, clarifyNotes].filter(Boolean).join('\n\n')
    } as BrandInfo

    // Set onboarding timestamp for Brand OS Evolution Engine
    finalFormData.onboardedAt = new Date().toISOString()
    finalFormData.learningPhase = 'calibration'

    createBrand(brandId, finalFormData)
    setOnboardingPath('ai')

    try {
      // Strip massive base64 strings and blob URLs before sending to the backend 
      // Vercel serverless has a 4.5MB request size limit, which truncates the JSON if exceeded.
      const lightFormData = {
        ...finalFormData,
        brandReferences: finalFormData.brandReferences?.map(r => ({ ...r, url: '' })),
        brandAssets: [] 
      } as BrandInfo

      const MAX_RETRIES = 2
      let lastErr: string | null = null

      try { await createClient().auth.getSession() } catch {}

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          // Exponential backoff: ~3s, ~6s
          const delay = 3000 * Math.pow(2, attempt - 1) + Math.random() * 1000
          console.log(`🔄 Strategy retry ${attempt}/${MAX_RETRIES} after ${Math.round(delay)}ms...`)
          await new Promise(r => setTimeout(r, delay))
        }

        let res: Response
        try {
          res = await fetch('/api/generate-marketing-strategy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandInfo: lightFormData }),
          })
        } catch (networkErr: any) {
          // Network-level failure (offline, DNS, etc.)
          lastErr = 'Network error. Please check your connection and try again.'
          continue
        }

        // Handle gateway/server errors BEFORE trying to parse
        // Note: our streaming route returns 200 even on errors (error is in the JSON payload).
        // But Vercel's gateway can still return 502/503/504 if the function dies.
        if (res.status === 504 || res.status === 502 || res.status === 503) {
          console.warn(`⚠️ Gateway error ${res.status} on strategy generation (attempt ${attempt + 1})`)
          lastErr = 'AI is taking longer than expected. Retrying...'
          if (attempt < MAX_RETRIES) continue
          lastErr = 'Strategy generation timed out. The AI engine is under heavy load — please wait a moment and try again.'
          break
        }

        if (res.status === 413) {
          lastErr = 'Brand data is too large. Try removing some uploaded assets and retry.'
          break
        }

        if (!res.ok) {
          let errorMsg = `Server error (${res.status}).`
          try { errorMsg = (await res.json())?.error || errorMsg } catch {}
          if (res.status === 500 && attempt < MAX_RETRIES) { lastErr = errorMsg; continue }
          lastErr = errorMsg
          break
        }

        // Parse streamed response (handles heartbeat whitespace + __JSON__ delimiter)
        let response: any
        try {
          response = await parseStreamedResponse(res)
        } catch (parseErr: any) {
          console.error("Strategy response parse failed:", parseErr)
          lastErr = parseErr?.message || 'Received an invalid response from the server. Please try again.'
          break
        }

        if (response.success && response.data) {
          setStrategy(response.data)
          if (research) setResearchData(research)
          setError(null)
          router.push('/strategy')
          return // Success — exit the function entirely
        } else {
          console.error('❌ Strategy response not successful:', response.error)
          lastErr = response.error || "Strategy generation failed."
          // Retry on AI service errors, don't retry on logical failures
          if (attempt < MAX_RETRIES && /unavailable|busy|timed out|configuration/i.test(lastErr || '')) continue
          break
        }
      }

      // If we reach here, all attempts failed
      console.error('❌ All strategy attempts failed:', lastErr)
      setError(sanitizeErrorForUI(lastErr || "Strategy generation failed. Please try again."))
    } catch (err: any) {
      setError(sanitizeErrorForUI(err?.message || "An unexpected error occurred."))
    } finally {
      setIsGenerating(false)
    }
  }

  // --- Validation ---
  const isStep0Valid = formData.name && formData.industry && (formData.website || formData.extraNotes)
  const isStep2Valid = (formData.primaryAudiences?.length || 0) > 0 && (formData.primaryGoals?.length || 0) > 0
  const isStep3Valid = (formData.tone?.length || 0) > 0 && formData.communicationStyle
  const isStep4Valid = (formData.platforms?.length || 0) > 0

  // --- Shared Styles ---
  const inputClass = "w-full h-12 rounded-xl border-2 border-slate-200 bg-white px-4 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
  const textareaClass = "w-full min-h-[140px] py-4 rounded-xl border-2 border-slate-200 bg-white px-4 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-y text-sm leading-relaxed transition-all"

  const chipSelected = (selected: boolean, colorSet: 'blue' | 'green' | 'amber' | 'purple' = 'blue') => {
    const colors = {
      blue: selected ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200 font-bold shadow-sm scale-[1.02]' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
      green: selected ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200 font-bold shadow-sm scale-[1.02]' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
      amber: selected ? 'border-amber-500 bg-amber-50 text-amber-700 ring-2 ring-amber-200 font-bold shadow-sm scale-[1.02]' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
      purple: selected ? 'border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200 font-bold shadow-sm scale-[1.02]' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
    }
    return `px-4 py-3 rounded-xl text-sm font-medium transition-all text-left border-2 flex items-center justify-between cursor-pointer ${colors[colorSet]}`
  }

  return (
    <div className="max-w-4xl mx-auto py-16 px-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative min-h-screen flex flex-col">
      <div className="absolute top-[5%] left-[50%] translate-x-[-50%] w-[70%] h-[50%] bg-blue-500 opacity-5 blur-[120px] rounded-full pointer-events-none" />

      {/* Live Epiphany Feed */}
      {(formData.aiKnowledgeBase?.length || 0) > 0 && (
        <div className="fixed right-6 top-32 w-[340px] max-h-[80vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-xl shadow-blue-900/20 hidden 2xl:flex animate-in slide-in-from-right-8 z-50">
           <div className="p-5 border-b border-white/10 flex flex-col items-center justify-center relative">
              {isThinking && (
                <div className="absolute top-5 right-5 flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase text-amber-500 tracking-widest animate-pulse">Thinking</span>
                  <div className="w-3 h-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin"/>
                </div>
              )}
              <Brain className="w-7 h-7 text-blue-400 mb-2" />
              <h3 className="text-xs font-black uppercase tracking-widest text-white">Live AI Knowledge Base</h3>
              <p className="text-[10px] text-slate-400 font-medium text-center mt-1">
                The agent is continuously reading your inputs, researching implications, and learning.
              </p>
           </div>
           <div className="p-5 overflow-y-auto space-y-4 flex-1 flex flex-col-reverse">
             {formData.aiKnowledgeBase?.map((fact, i) => (
               <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-300 font-medium leading-relaxed animate-in fade-in slide-in-from-top-4">
                 <span className="font-bold text-blue-400 mr-1">💡 Epiphany:</span> {fact}
               </div>
             ))}
           </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-8 relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{STEP_LABELS[step]}</span>
          <span className="text-xs font-bold text-slate-400">Step {step + 1} of {STEP_LABELS.length}</span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-500 shadow-sm" style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }} />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-8 md:p-10 shadow-lg relative z-10 transition-all duration-300 min-h-[520px] flex flex-col justify-between overflow-hidden">
        
        <div className="flex-1">

          {/* ═══ STEP 0: Brand Entry ═══ */}
          {step === 0 && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="mb-8">
                <h2 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-3">
                  <Building2 className="w-8 h-8 text-blue-500"/> Brand Entry
                </h2>
                <p className="text-slate-500 mt-2">Tell us the basics — our AI will research everything else.</p>
              </div>

                <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Brand Name *</label>
                  <input value={formData.name} onChange={e => updateForm('name', e.target.value)} placeholder="e.g. Sandwizzaa, Allmile, Nike" className={inputClass} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Primary Industry *</label>
                  <select 
                    value={formData.industryCustom ? 'Other (Custom)' : formData.industry} 
                    onChange={e => {
                       const val = e.target.value;
                       updateForm('industry', val);
                       if (val !== 'Other (Custom)') updateForm('industryCustom', '');
                    }} 
                    className={inputClass}
                  >
                    <option value="" disabled>Select an industry...</option>
                    {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                  </select>
                  {formData.industry === 'Other (Custom)' && (
                     <input value={formData.industryCustom} onChange={e => updateForm('industryCustom', e.target.value)} placeholder="Type your custom industry..." className={inputClass + ' mt-2'} />
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Website</label>
                  <div className="relative">
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={formData.website} onChange={e => updateForm('website', e.target.value)} placeholder="https://yourbrand.com" className={inputClass + ' pl-12 font-mono text-sm'} />
                  </div>
                </div>

                <div className="space-y-3 animate-in fade-in duration-300">
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Brand Description / Extra Notes *</label>
                  <p className="text-xs text-blue-600/80 mb-2">The more detail you share, the smarter our AI gets. Try to cover: product, target audience, and what makes you different.</p>
                  <textarea 
                    value={formData.extraNotes} onChange={e => updateForm('extraNotes', e.target.value)} 
                    placeholder={"e.g. We make premium artisan sandwiches for office-goers in Mumbai and Bangalore. Our USP is locally-sourced sourdough bread..."}
                    rows={6} className={textareaClass} 
                  />
                </div>

                {/* Core Products moved to Step 5 ("What do you sell?"). Step 0 is brand-level only. */}
              </div>
            </div>
          )}

          {/* ═══ STEP 1: AI Research Phase ═══ */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="mb-8 flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-3">
                    <Search className="w-8 h-8 text-blue-500"/> AI Research
                  </h2>
                  <p className="text-slate-500 mt-2">Our AI is analyzing your brand. Review the findings below.</p>
                </div>
                {research && !isResearching && (
                  <button onClick={() => setIsEditingResearch(!isEditingResearch)} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors border border-slate-200 shadow-sm flex items-center gap-2">
                    {isEditingResearch ? <><CheckCircle2 className="w-4 h-4 text-emerald-500"/> Save Findings</> : 'Edit AI Findings'}
                  </button>
                )}
              </div>

              {isResearching ? (
                <ResearchWaiting 
                  brandName={formData.name || 'your brand'}
                  elapsedSeconds={researchElapsed}
                  onCancel={deepResearchId ? cancelDeepResearch : undefined}
                />
              ) : research ? (
                <div className="space-y-4">
                  <div className="p-5 rounded-xl bg-blue-50 border border-blue-100">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Executive Summary</p>
                    {isEditingResearch ? (
                      <textarea value={research.summary} onChange={e => setResearch({...research, summary: e.target.value})} className={textareaClass} rows={4} />
                    ) : (
                      <p className="text-sm text-slate-800 leading-relaxed font-medium">{research.summary}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Users className="w-3 h-3" /> Audiences</p>
                      {isEditingResearch ? (
                         <div className="space-y-2">
                            {research.discoveredAudiences?.map((a, i) => (
                              <div key={i} className="flex gap-2">
                                 <input type="text" value={a} onChange={(e) => {
                                    const newA = [...(research.discoveredAudiences || [])]
                                    newA[i] = e.target.value
                                    setResearch({...research, discoveredAudiences: newA})
                                 }} className={`${textareaClass.replace('min-h-[120px]', '')} h-9 py-1`} />
                                 <button onClick={() => {
                                    const newA = [...(research.discoveredAudiences || [])]
                                    newA.splice(i, 1)
                                    setResearch({...research, discoveredAudiences: newA})
                                 }} className="px-2 text-red-500 hover:bg-red-50 rounded"><X className="w-4 h-4"/></button>
                              </div>
                            ))}
                            <button onClick={() => setResearch({...research, discoveredAudiences: [...(research.discoveredAudiences || []), '']})} className="text-xs font-bold text-blue-500 flex items-center gap-1 mt-2 hover:underline"><Plus className="w-3 h-3"/> Add Audience</button>
                         </div>
                      ) : (
                         <div className="space-y-1.5">
                           {research.discoveredAudiences?.map((a, i) => (
                             <div key={i} className="text-xs font-medium text-slate-600 flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-blue-400 flex-shrink-0" /> {a}</div>
                           ))}
                         </div>
                      )}
                    </div>
                    <div className="p-5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-xs font-black text-purple-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Globe className="w-4 h-4" /> Platforms</p>
                      {isEditingResearch ? (
                        <div className="max-h-80 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                           <div className="flex flex-wrap gap-2.5">
                             {MASTER_PLATFORM_LIBRARY.map((platform, idx) => {
                               const isActive = research.suggestedPlatforms?.includes(platform)
                               const Icon = PLATFORM_ICONS[platform] || PLATFORM_ICONS.default
                               return (
                                 <button
                                   key={idx}
                                   onClick={() => {
                                      const current = research.suggestedPlatforms || []
                                      const updated = isActive ? current.filter(p => p !== platform) : [...current, platform]
                                      setResearch({...research, suggestedPlatforms: updated})
                                      // Keep formData.platforms in sync so Step 5 frequency mapping sees all picks.
                                      updateForm('platforms', updated)
                                   }}
                                   className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl border transition-all ${isActive ? 'bg-purple-500 text-white border-purple-500 shadow-md scale-[1.02]' : 'bg-white text-slate-500 border-slate-200 hover:border-purple-300 hover:bg-purple-50'}`}
                                 >
                                   <Icon className="w-4 h-4" />
                                   {platform}
                                 </button>
                               )
                             })}
                           </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2.5">
                          {research.suggestedPlatforms?.map((p, i) => {
                            const Icon = PLATFORM_ICONS[p] || PLATFORM_ICONS.default
                            return <span key={i} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold rounded-xl bg-purple-50 border border-purple-100 text-purple-600"><Icon className="w-4 h-4" /> {p}</span>
                          })}
                        </div>
                      )}
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2"><Activity className="w-3 h-3 inline" /> Industry</p>
                      {isEditingResearch ? (
                        <textarea value={research.industryContext} onChange={e => setResearch({...research, industryContext: e.target.value})} className={textareaClass} rows={4} />
                      ) : (
                        <p className="text-xs text-slate-600 leading-relaxed">{research.industryContext}</p>
                      )}
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2"><Sparkles className="w-3 h-3 inline" /> USP Hypothesis</p>
                      {isEditingResearch ? (
                        <textarea value={research.uspHypothesis} onChange={e => setResearch({...research, uspHypothesis: e.target.value})} className={textareaClass} rows={4} />
                      ) : (() => {
                        // Split a long USP hypothesis into bullets on "1." "2." "3." or "•" / newline patterns.
                        const raw = (research.uspHypothesis || '').trim()
                        const parts = raw
                          .split(/(?:\n|\s*(?:\d+\.|•|—)\s+)/)
                          .map(s => s.trim())
                          .filter(s => s.length > 4)
                        if (parts.length <= 1) {
                          return <p className="text-xs text-slate-600 leading-relaxed">{raw}</p>
                        }
                        return (
                          <ul className="space-y-1.5">
                            {parts.map((p, i) => (
                              <li key={i} className="text-xs text-slate-600 leading-relaxed flex gap-2">
                                <span className="text-emerald-500 flex-shrink-0">•</span>
                                <span>{p.replace(/^[.\-—]+\s*/, '')}</span>
                              </li>
                            ))}
                          </ul>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <p className="text-xs font-bold text-emerald-700">Research complete. We've pre-selected some options for the next steps. Review and customize everything.</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-slate-400">Research data will appear here.</p>
                  <button onClick={runResearch} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-500 transition-colors">
                    <RefreshCw className="w-4 h-4 inline mr-2" /> Retry Research
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 2: Audience & Goals ═══ */}
          {step === 2 && (
            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="mb-4">
                <h2 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-3"><Users className="w-8 h-8 text-blue-500"/> Audience & Goals</h2>
                <p className="text-slate-500 mt-2">{dynamicQ?.audienceQuestion || "We've pre-selected based on research. Adjust to match your vision."}</p>
                {isCustomizingQuestions && (
                  <p className="text-xs text-blue-500 mt-1 animate-pulse">✦ Personalizing these questions for your brand…</p>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Primary Audiences (up to 3) *</label>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {Array.from(new Set([...(dynamicQ?.audienceOptions || []), ...(research?.discoveredAudiences || []), ...(formData.primaryAudiences || []), ...customChips.primaryAudiences, ...(dynamicQ ? [] : AUDIENCE_ARCHETYPES)])).map(arch => (
                    <button key={arch} type="button" onClick={() => toggleItem('primaryAudiences', arch)} className={chipSelected(formData.primaryAudiences?.includes(arch) || false, 'blue')}>
                      {arch}
                      {formData.primaryAudiences?.includes(arch) && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                    </button>
                  ))}
                  <input type="text" placeholder="+ Type custom..." onKeyDown={e => {
                     if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim()
                        if (val) {
                          setCustomChips(prev => ({...prev, primaryAudiences: [...prev.primaryAudiences, val]}))
                          if (!(formData.primaryAudiences || []).includes(val)) toggleItem('primaryAudiences', val)
                          e.currentTarget.value = ''
                        }
                        e.preventDefault()
                     }
                  }} className="w-full px-4 py-3 rounded-xl text-sm font-medium bg-slate-50 border-2 border-dashed border-slate-300 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder-slate-400" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Secondary Audience (optional)</label>
                <p className="text-[11px] text-slate-400">AI may have filled this from research. Edit or add your own niche segment.</p>
                <div className="flex flex-wrap gap-2">
                  <AskAIButton fieldName="Secondary Audience" fieldDescription="A niche secondary audience segment beyond the primary archetypes" context={aiContext} onSelect={v => updateForm('secondaryAudience', v)} currentValue={formData.secondaryAudience} />
                  <ExpandAIButton fieldName="Secondary Audience" fieldDescription="Expand the secondary audience description" context={aiContext} currentValue={formData.secondaryAudience || ''} onExpand={v => updateForm('secondaryAudience', v)} />
                </div>
                <textarea value={formData.secondaryAudience} onChange={e => updateForm('secondaryAudience', e.target.value)} placeholder="Describe any niche audience segment not covered above..." rows={3} className={textareaClass} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Age Profile</label>
                <div className="flex flex-wrap gap-2">
                  <AskAIButton fieldName="Age Profile" fieldDescription="The primary age range and demographic" context={aiContext} onSelect={v => updateForm('ageRange', v)} currentValue={formData.ageRange} />
                  <ExpandAIButton fieldName="Age Profile" fieldDescription="Expand age profile details" context={aiContext} currentValue={formData.ageRange || ''} onExpand={v => updateForm('ageRange', v)} />
                </div>
                <textarea value={formData.ageRange} onChange={e => updateForm('ageRange', e.target.value)} placeholder="e.g. 22-35 urban millennials who eat out 3-4 times a week..." rows={3} className={textareaClass} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Psychographic Hooks</label>
                <div className="flex flex-wrap gap-2">
                  <AskAIButton fieldName="Psychographic Hooks" fieldDescription="What the target audience hates, desires, fears, and aspires to" context={aiContext} onSelect={v => updateForm('psychographics', v)} currentValue={formData.psychographics} />
                  <ExpandAIButton fieldName="Psychographic Hooks" fieldDescription="Expand psychographic insight" context={aiContext} currentValue={formData.psychographics || ''} onExpand={v => updateForm('psychographics', v)} />
                </div>
                <textarea value={formData.psychographics} onChange={e => updateForm('psychographics', e.target.value)} placeholder="What do they hate? What do they desire? What triggers them to buy?" rows={4} className={textareaClass} />
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-100">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Strategic Goals (up to 3) *</label>
                {dynamicQ?.goalQuestion && <p className="text-xs text-slate-400">{dynamicQ.goalQuestion}</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Array.from(new Set([...(dynamicQ?.goalOptions || []), ...(research?.discoveredGoals || []), ...(formData.primaryGoals || []), ...customChips.primaryGoals, ...(dynamicQ ? [] : GOALS)])).map(goal => (
                    <button key={goal} type="button" onClick={() => toggleItem('primaryGoals', goal)} className={chipSelected(formData.primaryGoals?.includes(goal) || false, 'green')}>
                      {goal}
                      {formData.primaryGoals?.includes(goal) && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    </button>
                  ))}
                  <input type="text" placeholder="+ Type custom..." onKeyDown={e => {
                     if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim()
                        if (val) {
                          setCustomChips(prev => ({...prev, primaryGoals: [...prev.primaryGoals, val]}))
                          if (!(formData.primaryGoals || []).includes(val)) toggleItem('primaryGoals', val)
                          e.currentTarget.value = ''
                        }
                        e.preventDefault()
                     }
                  }} className="w-full px-4 py-3 rounded-xl text-sm font-medium bg-slate-50 border-2 border-dashed border-slate-300 focus:border-emerald-500 focus:bg-white outline-none transition-all placeholder-slate-400" />
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 3: Brand Voice (Sample Copy Cards) ═══ */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="mb-4">
                <h2 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-3"><Sparkles className="w-8 h-8 text-blue-500"/> Brand Voice</h2>
                <p className="text-slate-500 mt-2">{dynamicQ?.voiceQuestion || "Pick the voice that sounds like your brand. Each card shows a real sample caption."}</p>
                {isCustomizingQuestions && (
                  <p className="text-xs text-blue-500 mt-1 animate-pulse">✦ Personalizing these questions for your brand…</p>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Tone — pick 1-3 that resonate</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(research?.toneSamples || []).map((sample: ToneSample) => {
                    const isSelected = formData.tone?.includes(sample.tone) || false
                    return (
                      <button key={sample.tone} type="button" onClick={() => toggleItem('tone', sample.tone)}
                        className={`p-5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                          isSelected 
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-md scale-[1.01]' 
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm font-black uppercase tracking-wider ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{sample.tone}</span>
                          {isSelected && <CheckCircle2 className="w-5 h-5 text-blue-500" />}
                        </div>
                        <p className={`text-sm leading-relaxed mb-2 italic ${isSelected ? 'text-blue-800' : 'text-slate-700'}`}>"{sample.caption}"</p>
                        <p className="text-[11px] text-slate-400">{sample.description}</p>
                      </button>
                    )
                  })}
                </div>

                {/* Fallback if no tone samples */}
                {(!research?.toneSamples || research.toneSamples.length === 0) && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from(new Set([...(research?.suggestedTone || []), ...(formData.tone || []), ...customChips.tone, "Playful", "Serious", "Disruptive", "Safe/Corporate", "Authoritative", "Peer-like", "Educational", "Inspirational"])).map(tone => (
                      <button key={tone} type="button" onClick={() => toggleItem('tone', tone)} className={chipSelected(formData.tone?.includes(tone) || false, 'blue')}>
                        {tone}
                        {formData.tone?.includes(tone) && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                      </button>
                    ))}
                    <input type="text" placeholder="+ Custom..." onKeyDown={e => {
                       if (e.key === 'Enter') {
                          const val = e.currentTarget.value.trim()
                          if (val) {
                            setCustomChips(prev => ({...prev, tone: [...prev.tone, val]}))
                            if (!(formData.tone || []).includes(val)) toggleItem('tone', val, 3)
                            e.currentTarget.value = ''
                          }
                          e.preventDefault()
                       }
                    }} className="w-full px-4 py-3 rounded-xl text-sm font-medium bg-slate-50 border-2 border-dashed border-slate-300 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder-slate-400" />
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-100">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Communication Style *</label>
                {dynamicQ?.styleQuestion && <p className="text-xs text-slate-400">{dynamicQ.styleQuestion}</p>}
                <div className="grid grid-cols-2 gap-3">
                  {Array.from(new Set([...(dynamicQ?.styleOptions || []), ...(dynamicQ ? [] : COMMUNICATION_STYLES), ...(formData.communicationStyle ? [formData.communicationStyle] : [])])).map(style => (
                    <button key={style} type="button" onClick={() => updateForm('communicationStyle', style)}
                      className={`px-4 py-4 rounded-xl text-sm font-bold transition-all text-center border-2 cursor-pointer ${
                        formData.communicationStyle === style 
                          ? 'border-amber-500 bg-amber-50 text-amber-700 ring-2 ring-amber-200 shadow-sm' 
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}>
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 4: Platforms & Edge ═══ */}
          {step === 4 && (
            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="mb-4">
                <h2 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-3"><Activity className="w-8 h-8 text-amber-500"/> Platforms & Edge</h2>
                <p className="text-slate-500 mt-2">{dynamicQ?.platformQuestion || "Where you'll compete and what makes you different."}</p>
              </div>

              {dynamicQ?.platformRecommendations && dynamicQ.platformRecommendations.length > 0 && (
                <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl space-y-2">
                  <p className="text-xs font-black uppercase tracking-wider text-purple-600">✦ AI Platform Playbook for your brand</p>
                  {dynamicQ.platformRecommendations.map(rec => (
                    <div key={rec.platform} className="text-sm text-slate-700">
                      <span className="font-bold">{rec.platform}</span>
                      <span className="text-purple-600 font-semibold"> · {rec.frequency}</span>
                      <span className="text-slate-500"> — {rec.rationale}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Scope of Work (Content Frequency)</label>
                <div className="space-y-3">
                  {formData.platforms?.map(platform => {
                     const currentFreq = formData.contentFrequency?.[platform]
                     return (
                        <div key={platform} className="p-4 bg-white border border-slate-200 rounded-xl">
                           <p className="text-xs font-black text-slate-700 uppercase mb-3 flex items-center gap-2">
                             <Activity className="w-3.5 h-3.5 text-purple-500"/> {platform}
                           </p>
                           <div className="flex flex-wrap gap-2">
                             {CONTENT_FREQUENCIES.map(freq => {
                               const isAIPick = dynamicQ?.platformRecommendations?.some(r => r.platform === platform && r.frequency === freq) || false
                               return (
                                 <button key={freq} type="button" onClick={() => setFormData(prev => ({...prev, contentFrequency: { ...prev.contentFrequency, [platform]: freq }}))}
                                   className={chipSelected(currentFreq === freq, 'purple')}>
                                   {freq}{isAIPick && <span className="ml-1.5 text-[9px] font-black text-purple-500 align-middle">✦ AI</span>}
                                 </button>
                               )
                             })}
                           </div>
                        </div>
                     )
                  })}
                  {(!formData.platforms || formData.platforms.length === 0) && (
                     <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm text-slate-500">
                        No Core Social Media platforms were selected in Step 1. Frequency mapping skipped.
                     </div>
                  )}
                </div>
              </div>

              {/* ── Product/Service Intelligence ── */}
              <div className="space-y-4 pt-6 border-t border-slate-100">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">What Do You Sell?</label>
                <p className="text-xs text-slate-400">Help the AI understand your products/services so content references real features, not generic fluff.</p>

                {/* Brand Type Selector */}
                <div className="flex gap-3">
                  {(['product', 'service', 'hybrid'] as const).map(type => (
                    <button key={type} type="button"
                      onClick={() => updateForm('brandType', type)}
                      className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${formData.brandType === type ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                      {type === 'product' ? 'Product' : type === 'service' ? 'Service' : 'Both'}
                    </button>
                  ))}
                </div>

                {/* AI Auto-Import — single unified section */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-bold text-slate-700">Import Products & Services</span>
                  </div>
                  <p className="text-xs text-slate-500">Drop files or paste URLs — AI will extract your full product/service catalog automatically.</p>

                  {/* File dropzone */}
                  <label
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-emerald-100') }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('bg-emerald-100') }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.currentTarget.classList.remove('bg-emerald-100')
                      const picked = Array.from(e.dataTransfer.files || [])
                      if (picked.length) setImporterFiles((prev) => [...prev, ...picked].slice(0, 10))
                    }}
                    className="block rounded-xl border-2 border-dashed border-slate-300 bg-white p-5 text-center cursor-pointer hover:bg-slate-50 transition">
                    <UploadCloud className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                    <div className="text-sm font-semibold text-slate-700">Drop PDFs, DOCX, PPTX, or images</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Up to 10 files · 50 MB each</div>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.docx,.pptx,.doc,.ppt,.png,.jpg,.jpeg,.webp,.gif,.txt,.md"
                      className="hidden"
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || [])
                        if (picked.length) setImporterFiles((prev) => [...prev, ...picked].slice(0, 10))
                        e.currentTarget.value = ''
                      }}
                    />
                  </label>
                  {importerFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {importerFiles.map((f, i) => (
                        <div key={i} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 flex items-center gap-2">
                          <Paperclip className="w-3 h-3" /> {f.name}
                          <button type="button" onClick={() => setImporterFiles((prev) => prev.filter((_, j) => j !== i))}>
                            <X className="w-3 h-3 text-slate-400 hover:text-red-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* URL input */}
                  <div className="flex gap-2">
                    <input
                      value={importerUrlInput}
                      onChange={(e) => setImporterUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && importerUrlInput.trim()) {
                          e.preventDefault()
                          setImporterUrls((prev) => [...prev, importerUrlInput.trim()])
                          setImporterUrlInput('')
                        }
                      }}
                      placeholder="https://yoursite.com/products — press Enter to add"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-400 focus:outline-none bg-white"
                    />
                    <button type="button" onClick={() => {
                      if (importerUrlInput.trim()) {
                        setImporterUrls((prev) => [...prev, importerUrlInput.trim()])
                        setImporterUrlInput('')
                      }
                    }} className="px-3 py-2 bg-slate-700 text-white text-xs font-bold rounded-lg hover:bg-slate-600">Add</button>
                  </div>
                  {importerUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {importerUrls.map((u, i) => (
                        <div key={i} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 flex items-center gap-2">
                          <LinkIcon className="w-3 h-3" /> {u}
                          <button type="button" onClick={() => setImporterUrls((prev) => prev.filter((_, j) => j !== i))}>
                            <X className="w-3 h-3 text-slate-400 hover:text-red-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={importerLoading || (!importerFiles.length && !importerUrls.length && !formData.website?.trim())}
                    onClick={runProductImporter}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <Wand2 className="w-4 h-4" /> {importerLoading ? 'Extracting…' : 'Extract with AI'}
                  </button>
                  {importerStatus && (
                    <p className="text-xs text-slate-500 text-center">{importerStatus}</p>
                  )}

                  {importerError && (
                    <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{importerError}</div>
                  )}
                  {importerWarnings.length > 0 && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2 space-y-0.5">
                      {importerWarnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                    </div>
                  )}

                  {/* Preview + commit */}
                  {(importedProducts.length > 0 || importedServices.length > 0) && (
                    <div className="rounded-xl bg-white border border-blue-200 p-3 space-y-3">
                      <div className="text-xs font-black text-blue-700 uppercase tracking-widest">Extracted — review before saving</div>
                      {importedProducts.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-bold text-blue-700 uppercase">Products ({importedProducts.length})</div>
                          {importedProducts.map((p, i) => (
                            <div key={i} className="text-xs text-slate-700 border-l-2 border-blue-300 pl-2">
                              <span className="font-semibold">{p.name}</span>
                              {p.description && <span className="text-slate-500"> — {p.description}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {importedServices.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-bold text-emerald-700 uppercase">Services ({importedServices.length})</div>
                          {importedServices.map((s, i) => (
                            <div key={i} className="text-xs text-slate-700 border-l-2 border-emerald-300 pl-2">
                              <span className="font-semibold">{s.name}</span>
                              {s.description && <span className="text-slate-500"> — {s.description}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      <button type="button" onClick={commitImportedToBrand} className="w-full px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-500 flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> Save to Brand
                      </button>
                    </div>
                  )}
                </div>

                {/* Manual entries — collapsed by default */}
                {(formData.productCatalog?.length || formData.serviceOfferings?.length) ? (
                  <div className="space-y-3">
                    {(formData.productCatalog || []).map((product, idx) => (
                      <div key={idx} className="p-3 bg-white rounded-lg border border-blue-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <input value={product.name} onChange={e => {
                            const catalog = [...(formData.productCatalog || [])]
                            catalog[idx] = { ...catalog[idx], name: e.target.value }
                            updateForm('productCatalog', catalog)
                          }} placeholder="Product name" className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-blue-400 focus:outline-none" />
                          <button type="button" onClick={() => {
                            const catalog = [...(formData.productCatalog || [])]
                            catalog.splice(idx, 1)
                            updateForm('productCatalog', catalog)
                          }} className="p-1 text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                        </div>
                        <textarea value={product.description} onChange={e => {
                          const catalog = [...(formData.productCatalog || [])]
                          catalog[idx] = { ...catalog[idx], description: e.target.value }
                          updateForm('productCatalog', catalog)
                        }} placeholder="Quick description + key features" rows={2} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-blue-400 focus:outline-none resize-none" />
                      </div>
                    ))}
                    {(formData.serviceOfferings || []).map((service, idx) => (
                      <div key={idx} className="p-3 bg-white rounded-lg border border-emerald-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <input value={service.name} onChange={e => {
                            const services = [...(formData.serviceOfferings || [])]
                            services[idx] = { ...services[idx], name: e.target.value }
                            updateForm('serviceOfferings', services)
                          }} placeholder="Service name" className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-emerald-400 focus:outline-none" />
                          <button type="button" onClick={() => {
                            const services = [...(formData.serviceOfferings || [])]
                            services.splice(idx, 1)
                            updateForm('serviceOfferings', services)
                          }} className="p-1 text-slate-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                        </div>
                        <textarea value={service.description} onChange={e => {
                          const services = [...(formData.serviceOfferings || [])]
                          services[idx] = { ...services[idx], description: e.target.value }
                          updateForm('serviceOfferings', services)
                        }} placeholder="What you deliver + key deliverables" rows={2} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-emerald-400 focus:outline-none resize-none" />
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex gap-3">
                  <button type="button" onClick={() => {
                    const catalog = [...(formData.productCatalog || []), { name: '', description: '', features: [], priceRange: '', targetSegment: '' }]
                    updateForm('productCatalog', catalog)
                  }} className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Product Manually
                  </button>
                  <button type="button" onClick={() => {
                    const services = [...(formData.serviceOfferings || []), { name: '', description: '', deliverables: [], targetSegment: '' }]
                    updateForm('serviceOfferings', services)
                  }} className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Service Manually
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Key Competitors</label>
                <p className="text-[11px] text-slate-400">Auto-filled from research. Refine if needed.</p>
                <div className="flex flex-wrap gap-2">
                  <AskAIButton fieldName="Key Competitors" fieldDescription="Main competitors in the brand's market" context={aiContext} onSelect={v => updateForm('competitors', v)} currentValue={formData.competitors} />
                  <ExpandAIButton fieldName="Key Competitors" fieldDescription="Expand competitor analysis" context={aiContext} currentValue={formData.competitors || ''} onExpand={v => updateForm('competitors', v)} />
                </div>
                <textarea value={formData.competitors} onChange={e => updateForm('competitors', e.target.value)} placeholder="Who are your competitors? What do they do well? What do they miss?" rows={4} className={textareaClass} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Your Secret Sauce (USP)</label>
                <p className="text-[11px] text-slate-400">AI suggested this from research. Only you know your real edge — edit freely.</p>
                <div className="flex flex-wrap gap-2">
                  <AskAIButton fieldName="Unique Selling Proposition" fieldDescription="What makes this brand uniquely valuable" context={aiContext} onSelect={v => updateForm('usp', v)} currentValue={formData.usp} />
                  <ExpandAIButton fieldName="USP" fieldDescription="Expand the unique selling proposition" context={aiContext} currentValue={formData.usp || ''} onExpand={v => updateForm('usp', v)} />
                </div>
                <textarea value={formData.usp} onChange={e => updateForm('usp', e.target.value)} placeholder="Why you? What's the magic that competitors can't copy?" rows={4} className={textareaClass} />
              </div>
            </div>
          )}

          {/* ═══ STEP 5: Visual DNA ═══ */}
          {step === 5 && (
            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="mb-4">
                <h2 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-3"><Palette className="w-8 h-8 text-emerald-500"/> Visual DNA</h2>
                <p className="text-slate-500 mt-2">Colors, references, and brand assets. <span className="text-blue-500 font-semibold">These need your input — AI can&apos;t guess your visual identity.</span></p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Primary Brand Color</label>
                <p className="text-[10px] text-blue-400 font-medium">Pick your brand color</p>
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border-2 border-slate-200">
                    <input type="color" value={formData.primaryColorHex} onChange={e => updateForm('primaryColorHex', e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent" />
                    <span className="text-sm text-slate-700 uppercase font-mono">{formData.primaryColorHex}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Secondary Color</label>
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border-2 border-slate-200">
                    <input type="color" value={formData.secondaryColorHex} onChange={e => updateForm('secondaryColorHex', e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent" />
                    <span className="text-sm text-slate-700 uppercase font-mono">{formData.secondaryColorHex}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Additional Palette Colors</label>
                <div className="flex flex-wrap gap-3">
                  {(formData.additionalColors || []).map((color, i) => (
                    <div key={i} className="flex items-center gap-2 bg-white p-2 rounded-xl border-2 border-slate-200">
                      <input type="color" value={color} onChange={e => {
                        const newColors = [...(formData.additionalColors || [])]
                        newColors[i] = e.target.value
                        updateForm('additionalColors', newColors)
                      }} className="w-8 h-8 rounded-lg cursor-pointer border-none bg-transparent" />
                      <button type="button" onClick={() => {
                        const newColors = [...(formData.additionalColors || [])]
                        newColors.splice(i, 1)
                        updateForm('additionalColors', newColors)
                      }} className="text-red-500 hover:text-red-700 p-1"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => {
                     updateForm('additionalColors', [...(formData.additionalColors || []), '#e2e8f0'])
                  }} className="flex items-center justify-center w-[52px] h-[52px] rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-600 transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>


              <div className="space-y-3 pt-4 border-t border-slate-100">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Reference URLs (websites, portfolios, competitors)</label>
                <p className="text-[11px] text-blue-400 font-medium">Share visual references that inspire your brand&apos;s look and feel.</p>
                <div className="flex gap-2">
                  <input value={tempUrl} onChange={e => setTempUrl(e.target.value)} placeholder="https://example.com or any reference link" className={inputClass + ' flex-1'} />
                  <button type="button" onClick={() => { if (tempUrl && (formData.referenceUrls?.length || 0) < 5) { updateForm('referenceUrls', [...(formData.referenceUrls || []), tempUrl]); setTempUrl('') }}} 
                    className="h-12 px-6 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-bold flex items-center transition-colors">
                    <Plus className="w-4 h-4 mr-2" /> Add
                  </button>
                </div>
                {formData.referenceUrls?.map((url, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs font-mono text-slate-500">
                    <LinkIcon className="w-3 h-3 flex-shrink-0" />
                    <span className="flex-1 truncate">{url}</span>
                    <button type="button" onClick={() => { const arr = [...(formData.referenceUrls || [])]; arr.splice(i, 1); updateForm('referenceUrls', arr) }}><X className="w-3 h-3 text-slate-400 hover:text-red-500 transition-colors" /></button>
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-100">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Brand Assets (logos, moodboards, guidelines)</label>
                <p className="text-xs text-blue-400 font-medium">Upload your logo, brand guide, or moodboard so AI can match your style.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {formData.brandAssets?.map((url, i) => {
                    const isDoc = url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('.ppt') || url.toLowerCase().includes('.zip') || url.toLowerCase().includes('.doc')
                    return (
                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group bg-slate-50 flex flex-col items-center justify-center">
                        {isDoc ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center w-full h-full text-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <Paperclip className="w-8 h-8 mb-2" />
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 text-center w-full truncate">Download Doc {i+1}</span>
                          </a>
                        ) : (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="w-full h-full block">
                            <img src={url} className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" alt="" />
                          </a>
                        )}
                        <button type="button" onClick={(e) => { e.preventDefault(); const arr = [...(formData.brandAssets || [])]; arr.splice(i, 1); updateForm('brandAssets', arr) }} className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10"><X className="w-3 h-3"/></button>
                      </div>
                    )
                  })}
                  <label
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50') }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50') }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50')
                      if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files, 'assets')
                    }}
                    className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors text-slate-400">
                    <UploadCloud className="w-6 h-6 mb-1" />
                    <span className="text-[10px] font-bold">{isUploading ? 'Uploading...' : 'Upload or Drop'}</span>
                    <input type="file" className="hidden" onChange={e => handleFileUpload(e, 'assets')} disabled={isUploading} multiple accept="image/*,.pdf,.ppt,.pptx,.zip" />
                  </label>
                </div>
              </div>

              {/* ── Visual References (10-15 images) ── */}
              <div className="space-y-3 pt-6 border-t border-slate-100">
                <div>
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Camera className="w-4 h-4 text-pink-500" /> Visual References
                  </label>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Drop 10-15 images that represent your brand's vibe. Past social posts, Pinterest boards, competitor posts, product photoshoots, moodboards. <span className="text-pink-500 font-bold">Images only.</span> The AI will learn your visual language from these.
                  </p>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                  {(formData.brandReferences || []).filter(r => r.type === 'image' || r.type === 'webp').map((ref, i) => (
                    <div key={ref.id || i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group bg-slate-50 shadow-sm">
                      <img src={ref.url} className="w-full h-full object-cover" alt={ref.name} />
                      <button type="button" onClick={() => { updateForm('brandReferences', (formData.brandReferences || []).filter(r => r.id !== ref.id)) }} className="absolute top-1 right-1 p-1.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3"/></button>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-1.5">
                        <span className="text-[8px] font-bold text-white/80 truncate block">{ref.name}</span>
                      </div>
                    </div>
                  ))}
                  <label
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-pink-500', 'bg-pink-50') }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('border-pink-500', 'bg-pink-50') }}
                    onDrop={async (e) => {
                      e.preventDefault()
                      e.currentTarget.classList.remove('border-pink-500', 'bg-pink-50')
                      const files = e.dataTransfer.files
                      if (files?.length) await addBrandReferences(files)
                    }}
                    className="aspect-square rounded-xl border-2 border-dashed border-pink-300 flex flex-col items-center justify-center cursor-pointer hover:border-pink-500 hover:bg-pink-50 transition-all text-pink-400 gap-1">
                    <UploadCloud className="w-6 h-6" />
                    <span className="text-[9px] font-black uppercase tracking-wider">Add or Drop</span>
                    <span className="text-[8px] text-pink-300">{(formData.brandReferences || []).length}/15</span>
                    <input type="file" className="hidden" multiple accept="image/png,image/jpeg,image/webp,image/jpg" onChange={async (e) => {
                      if (e.target.files) await addBrandReferences(e.target.files)
                      e.target.value = ''
                    }} />
                  </label>
                </div>
                {(formData.brandReferences || []).length > 0 && (
                  <p className="text-[10px] text-emerald-500 font-bold">{(formData.brandReferences || []).length} reference{(formData.brandReferences || []).length > 1 ? 's' : ''} added</p>
                )}
              </div>
            </div>
          )}

          {/* ═══ STEP 6: Open Floor (One Question at a Time) ═══ */}
          {step === 6 && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="mb-4">
                <h2 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-3"><MessageCircle className="w-8 h-8 text-blue-500"/> Open Floor</h2>
                <p className="text-slate-500 mt-2">Our AI has a few targeted questions. Answer what you can — skip what you can't.</p>
              </div>

              {isLoadingQuestions ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <p className="text-sm font-bold text-slate-400">Analyzing your brief for gaps...</p>
                </div>
              ) : clarifyingQuestions.length > 0 ? (
                <div className="space-y-6">
                  {/* Progress */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">Question {openFloorIndex + 1} of {clarifyingQuestions.length}</span>
                    <div className="flex gap-1.5">
                      {clarifyingQuestions.map((_, i) => (
                        <div key={i} className={`w-2.5 h-2.5 rounded-full transition-all ${i === openFloorIndex ? 'bg-blue-500 scale-125' : i < openFloorIndex ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                      ))}
                    </div>
                  </div>

                  {/* Current Question */}
                  {openFloorIndex < clarifyingQuestions.length ? (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300" key={openFloorIndex}>
                      {(() => {
                        const q = clarifyingQuestions[openFloorIndex]
                        return (
                          <div className="space-y-4">
                            <div className="p-6 rounded-xl bg-blue-50 border border-blue-100">
                              <p className="text-lg font-bold text-slate-900 leading-relaxed mb-2">{q.question}</p>
                              <p className="text-xs text-blue-600/70 italic">Why this matters: {q.why}</p>
                            </div>

                            <textarea 
                              value={clarifyingAnswers[q.id] || ''}
                              onChange={e => setClarifyingAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                              placeholder={q.placeholder}
                              rows={6}
                              className={textareaClass}
                            />

                            {/* File attachments */}
                            <div className="flex items-center gap-3">
                              <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                                <Paperclip className="w-3.5 h-3.5" />
                                Attach Files
                                <input type="file" className="hidden" onChange={e => handleFileUpload(e, 'openfloor')} multiple accept="image/*,.pdf,.ppt,.pptx,.zip,.jpg,.jpeg,.png" />
                              </label>
                              <span className="text-[10px] text-slate-400">PDF, PNG, JPG, PPT, ZIP — up to 100MB</span>
                            </div>

                            {/* Attached files list */}
                            {(openFloorFiles[q.id] || []).length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {openFloorFiles[q.id].map((url, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg truncate max-w-[200px]">
                                    <Paperclip className="w-2.5 h-2.5 flex-shrink-0" />
                                    {url.split('/').pop()}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Navigation */}
                            <div className="flex items-center justify-between pt-4">
                              <button type="button" onClick={() => setOpenFloorIndex(i => i + 1)} className="text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
                                <SkipForward className="w-3 h-3" /> Skip this question
                              </button>
                              <button type="button" onClick={() => setOpenFloorIndex(i => i + 1)}
                                className="px-6 py-2.5 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-500 transition-colors flex items-center gap-2">
                                {openFloorIndex < clarifyingQuestions.length - 1 ? 'Next Question' : 'Finish Questions'} <ArrowRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <div className="text-center py-10 space-y-4">
                      <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                      <p className="text-lg font-bold text-slate-900">All questions answered!</p>
                      <p className="text-sm text-slate-400">Continue to review your complete brand DNA.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-slate-400">No additional questions needed.</p>
                </div>
              )}

              {/* Extra Notes */}
              <div className="space-y-2 pt-4 border-t border-slate-100">
                <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Anything Else?</label>
                <div className="flex flex-wrap gap-2">
                  <AskAIButton fieldName="Extra Context" fieldDescription="Additional context about the brand, founder story, upcoming launches" context={aiContext} onSelect={v => updateForm('extraNotes', v)} currentValue={formData.extraNotes} />
                  <ExpandAIButton fieldName="Extra Context" fieldDescription="Expand with more detail" context={aiContext} currentValue={formData.extraNotes || ''} onExpand={v => updateForm('extraNotes', v)} />
                </div>
                <textarea value={formData.extraNotes} onChange={e => updateForm('extraNotes', e.target.value)} placeholder="Founder story, upcoming launches, anything else the AI should know..." rows={4} className={textareaClass} />
              </div>
            </div>
          )}
          {/* ═══ STEP 7: Review & Launch ═══ */}
          {step === 7 && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-3"><Brain className="w-8 h-8 text-emerald-500"/> Review & Launch</h2>
                  <p className="text-slate-500 mt-2">Your brand DNA is ready. Review and launch your AI strategist.</p>
                </div>
                <button onClick={async () => {
                  try {
                    const html2canvas = (await import('html2canvas')).default;
                    const jsPDF = (await import('jspdf')).default;
                    const element = document.getElementById('brand-dna-export');
                    if (!element) return;
                    const canvas = await html2canvas(element, { scale: 2 });
                    const imgData = canvas.toDataURL('image/png');
                    const pdf = new jsPDF('p', 'mm', 'a4');
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                    pdf.save(`${formData.name?.replace(/\s+/g, '_')}_Brand_DNA.pdf`);
                  } catch (err) {
                    console.error("PDF Export Error", err);
                  }
                }} className="px-4 py-2 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-2 transition-all shadow-sm">
                  <Download className="w-4 h-4"/> Export PDF
                </button>
              </div>

              <div id="brand-dna-export" className="space-y-4 bg-white p-2 rounded-xl">
                <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 shadow-xl border border-slate-700 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none"><Brain className="w-32 h-32"/></div>
                  <div className="relative z-10">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Brand Identifier</span>
                    <p className="text-3xl font-display font-bold text-white mt-1">{formData.name}</p>
                    <p className="text-sm font-medium text-slate-300 mt-1">{formData.industry}</p>
                    {formData.website && <p className="text-xs font-mono text-emerald-400 mt-3">{formData.website}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md uppercase tracking-widest">Core Audiences</span>
                    <ul className="mt-4 space-y-2">
                      {formData.primaryAudiences?.map((a, i) => <li key={i} className="text-sm font-medium text-slate-700 flex items-start gap-2.5"><div className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 shrink-0"/>{a}</li>)}
                    </ul>
                  </div>
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-2 py-1 rounded-md uppercase tracking-widest">Strategic Goals</span>
                    <ul className="mt-4 space-y-2">
                      {formData.primaryGoals?.map((g, i) => <li key={i} className="text-sm font-medium text-slate-700 flex items-start gap-2.5"><div className="w-1.5 h-1.5 bg-purple-400 rounded-full mt-1.5 shrink-0"/>{g}</li>)}
                    </ul>
                  </div>
                  
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-md uppercase tracking-widest">Voice & Tone</span>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {formData.tone?.map((t, i) => <span key={i} className="px-3 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg border border-amber-100">{t}</span>)}
                    </div>
                    <p className="text-sm font-medium text-slate-500 mt-4 border-t border-slate-100 pt-3">{formData.communicationStyle}</p>
                  </div>
                  
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase tracking-widest">Ecosystem Distribution</span>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {formData.platforms?.map((p, i) => {
                        const Icon = PLATFORM_ICONS[p] || PLATFORM_ICONS.default
                        const currentFreq = formData.contentFrequency?.[p];
                        return (
                          <div key={i} className="inline-flex items-center gap-2 px-2.5 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 shadow-sm">
                             <Icon className="w-4 h-4 shrink-0" />
                             <div className="flex flex-col">
                               <span className="leading-tight">{p}</span>
                               {currentFreq && <span className="text-[9px] text-slate-400 font-medium leading-none mt-0.5">{currentFreq}</span>}
                             </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {formData.usp && (
                  <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 shadow-sm">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2"><Sparkles className="w-3.5 h-3.5"/> Secret Sauce (Unique Angle)</span>
                    <p className="text-sm font-bold text-slate-800 mt-3 leading-relaxed">{formData.usp}</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Error */}
        {error && (
          <div className="p-4 mt-6 bg-red-50 border-2 border-red-200 text-red-700 rounded-xl text-sm font-bold">
            {error}
          </div>
        )}

        {/* Footer Nav */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
          {step > 0 ? (
            <button type="button" onClick={handlePrev} disabled={isGenerating || isResearching}
              className="px-6 py-2.5 flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-700 disabled:opacity-30 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : <div />}
          
          {step < 7 ? (
            <button 
              type="button"
              onClick={handleNext}
              disabled={
                (step === 0 && !isStep0Valid) || 
                (step === 1 && isResearching) || 
                (step === 2 && !isStep2Valid) || 
                (step === 3 && !isStep3Valid) ||
                (step === 4 && !isStep4Valid)
              }
              className="px-8 py-3 bg-slate-900 text-white flex items-center gap-2 text-sm font-black rounded-full disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 transition-all shadow-lg uppercase tracking-tighter">
              {step === 0 ? 'Research My Brand' : step === 1 ? 'Continue with Findings' : 'Next Phase'} <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button 
              type="button"
              onClick={handleSubmit} disabled={isGenerating}
              className="h-14 bg-blue-600 hover:bg-blue-500 text-white px-10 rounded-full shadow-lg transition-all font-black text-sm tracking-widest uppercase flex items-center justify-center gap-3 transform hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:pointer-events-none">
              {isGenerating ? (
                <><RefreshCw className="w-5 h-5 animate-spin" /> Building Strategy...</>
              ) : (
                <>Launch AI Strategist <Sparkles className="w-5 h-5" /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
