'use client'

import { useState, useEffect } from 'react'
import { 
  Calendar as CalendarIcon, Filter, Plus, FileVideo, Image as ImageIcon, Sparkles, X, Wand2, 
  ChevronLeft, ChevronRight, Settings2, CalendarDays, MousePointer2, Target, Brain, PenTool, RefreshCw,
  Infinity, Briefcase, MessageSquare, Play, Camera, Globe, Music, Search, Activity, Users, MessageCircle,
  LayoutGrid, List, Download, CheckCircle2, Film, UploadCloud
} from 'lucide-react'
import { useBrandStore } from '@/stores/brand'
import { type BucketSelection } from '@/actions/calendar'
import { generatePostContent } from '@/actions/content'
import { useRouter } from 'next/navigation'
import { Toast, useToast } from '@/components/ui/Toast'
import { PatternPrompt } from '@/components/ui/PatternPrompt'
import { useBrandOSSignals } from '@/hooks/useBrandOSSignals'
import { exportToPDF } from '@/lib/exportPdf'
import { getContentSpec } from '@/lib/platform-specs'
import { type ImageModel } from '@/actions/imageGen'
import { classifyEdit, classifyCopilotInstruction, detectPattern, getPatternKey, type EditEvent, type DetectedPattern } from '@/lib/edit-pattern-detector'
import { VisualReferences } from '@/components/ui/VisualReferences'
import { findVisualReferences, researchReferences } from '@/actions/references'
import type { VisualRef } from '@/stores/brand'
import { sanitizeErrorForUI } from '@/lib/error-sanitizer'
import { parseStreamedResponse } from '@/lib/streaming-fetch'

const PLATFORM_ICONS: Record<string, { icon: any, color: string }> = {
  "Meta (Instagram & Facebook)": { icon: Infinity, color: "text-blue-400" },
  "LinkedIn": { icon: Briefcase, color: "text-[#0077B5]" },
  "X (Twitter)": { icon: MessageSquare, color: "text-[var(--color-text-secondary)]" },
  "TikTok": { icon: Music, color: "text-[#ff0050]" },
  "YouTube": { icon: Play, color: "text-[#FF0000]" },
  "Pinterest": { icon: Camera, color: "text-[#E60023]" },
  "Google Search (SEO)": { icon: Search, color: "text-blue-500" },
  "Google Ads": { icon: Activity, color: "text-emerald-500" },
  "Amazon": { icon: Globe, color: "text-orange-400" },
  "Swiggy/Zomato": { icon: Globe, color: "text-red-400" },
  "Discord": { icon: Users, color: "text-[#5865F2]" },
  "Reddit": { icon: MessageCircle, color: "text-[#FF4500]" },
  "default": { icon: Globe, color: "text-[var(--color-text-muted)]" }
}

// Per-platform format options — what content types each platform supports
const PLATFORM_FORMATS: Record<string, { label: string; value: string }[]> = {
  "Meta (Instagram & Facebook)": [
    { label: 'Statics', value: 'Static' },
    { label: 'Carousels', value: 'Carousel' },
    { label: 'Reels / Videos', value: 'Reel' },
    { label: 'Stories', value: 'Story' },
  ],
  "LinkedIn": [
    { label: 'Text Posts', value: 'Text' },
    { label: 'Statics', value: 'Static' },
    { label: 'Carousels', value: 'Carousel' },
    { label: 'Videos', value: 'Reel' },
  ],
  "X (Twitter)": [
    { label: 'Text Posts', value: 'Text' },
    { label: 'Threads', value: 'Thread' },
    { label: 'Image Posts', value: 'Static' },
    { label: 'Videos', value: 'Reel' },
  ],
  "Pinterest": [
    { label: 'Statics / Pins', value: 'Static' },
    { label: 'Carousels', value: 'Carousel' },
    { label: 'Video Pins', value: 'Reel' },
  ],
  "YouTube": [
    { label: 'Shorts', value: 'Reel' },
    { label: 'Long-form Video', value: 'Video' },
  ],
  "TikTok": [
    { label: 'Short Videos', value: 'Reel' },
    { label: 'Carousel (Photo Mode)', value: 'Carousel' },
  ],
}

export default function CalendarPage() {
  const router = useRouter()
  const { brands, activeBrandId, setCalendar, updateCalendarPost, saveDraft, saveDraftVariant, addPendingInsight, addAiKnowledge, addEditEvent, dismissPattern } = useBrandStore()
  const signals = useBrandOSSignals() // Brand OS Evolution Engine
  const activeBrand = activeBrandId ? brands[activeBrandId] : null

  const brandInfo = activeBrand?.brandInfo
  const strategy = activeBrand?.strategy
  const calendar = activeBrand?.calendar
  const contentDrafts = activeBrand?.contentDrafts || {}
  const draftHistory = activeBrand?.draftHistory || {}
  const toneFingerprint = activeBrand?.toneFingerprint
  
  // State for Real-World Dates
  const [currentDate, setCurrentDate] = useState(() => {
     const now = new Date();
     return new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
  })

  // State for Generation Configuration Modal
  const [showConfig, setShowConfig] = useState(false)
  const [configStep, setConfigStep] = useState<'setup' | 'topicals' | 'loading'>('setup')
  const [isGeneratingCal, setIsGeneratingCal] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState<string>("Mapping Calendar Matrix...")

  // Live Month Calculations
  const [upcomingMonths] = useState(() => {
     return Array.from({length: 6}).map((_, i) => {
        const d = new Date()
        d.setMonth(d.getMonth() + i)
        return {
           label: d.toLocaleString('default', { month: 'short' }) + " '" + String(d.getFullYear()).slice(2),
           value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        }
     })
  })

  // Setup params
  const [selectedMonths, setSelectedMonths] = useState<string[]>([upcomingMonths[0].value])
  const [customEvents, setCustomEvents] = useState('')
  // Content Matrix: { "2026-04": { "YouTube": { "Reel": 4, "Video": 2 }, ... }, ... }
  const [contentMatrix, setContentMatrix] = useState<Record<string, Record<string, Record<string, number>>>>({})
  const [activeMatrixMonth, setActiveMatrixMonth] = useState<string>(upcomingMonths[0].value)
  const [applyToAllMonths, setApplyToAllMonths] = useState(false)

  // Content Buckets
  const [bucketMode, setBucketMode] = useState<'ai' | 'manual'>('ai')
  const [selectedBuckets, setSelectedBuckets] = useState<BucketSelection[]>([])

  useEffect(() => {
    if (selectedBuckets.length === 0 && strategy?.contentPillars) {
      const activePlatforms = [...new Set(brandInfo?.platforms || [])]
      const initial: BucketSelection[] = []
      activePlatforms.forEach(plat => {
        const platKey = Object.keys(strategy.contentPillars!).find(k => plat.includes(k) || k.includes(plat))
        if (platKey && Array.isArray(strategy.contentPillars![platKey])) {
          strategy.contentPillars![platKey].forEach(pillar => {
            if (!Array.isArray(pillar.buckets)) return
            pillar.buckets.forEach(bucket => {
              initial.push({
                bucketId: bucket.id,
                bucketName: bucket.name,
                pillarName: pillar.name,
                min: bucket.suggestedMinPerMonth,
                max: bucket.suggestedMaxPerMonth,
                count: Math.ceil((bucket.suggestedMinPerMonth + bucket.suggestedMaxPerMonth) / 2)
              })
            })
          })
        }
      })
      setSelectedBuckets(initial)
    }
  }, [brandInfo?.platforms, strategy?.contentPillars, selectedBuckets.length])


  // Helper: update content matrix, optionally mirroring to all months
  const updateMatrix = (month: string, platform: string, format: string, value: number) => {
    const updated = { ...contentMatrix }
    const applyTo = applyToAllMonths ? selectedMonths : [month]
    for (const m of applyTo) {
      if (!updated[m]) updated[m] = {}
      if (!updated[m][platform]) updated[m][platform] = {}
      if (value === 0) {
        delete updated[m][platform][format]
      } else {
        updated[m][platform][format] = value
      }
    }
    setContentMatrix({ ...updated })
  }

  // Topicals Data
  const [topicals, setTopicals] = useState<any[]>([])
  const [isExtractingTopicals, setIsExtractingTopicals] = useState(false)
  const [activePlatformFilter, setActivePlatformFilter] = useState<string>('Master')

  const [error, setError] = useState<string | null>(null)
  const { toast, showToast, hideToast } = useToast()

  // Drawer states
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [isGeneratingContent, setIsGeneratingContent] = useState(false)

  // Chat Copilot States
  const [chatInput, setChatInput] = useState('')
  const [isChatting, setIsChatting] = useState(false)

  // Concept Editing States
  const [conceptChatInput, setConceptChatInput] = useState('')
  const [isIteratingConcept, setIsIteratingConcept] = useState(false)
  const [isRerolling, setIsRerolling] = useState(false)
  const [isBatchGenerating, setIsBatchGenerating] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)

  // View Mode
  const [viewMode, setViewMode] = useState<'grid' | 'matrix'>('grid')
  const [isExporting, setIsExporting] = useState(false)
  
  // Image Generation
  const [isGeneratingVisual, setIsGeneratingVisual] = useState(false)
  const [visualGenProgress, setVisualGenProgress] = useState('')
  const [imageModel, setImageModel] = useState<ImageModel>('nano-banana-pro')
  
  // Feed Aesthetic & Tenure References
  const [feedAesthetic, setFeedAesthetic] = useState<import('@/stores/brand').FeedAesthetic>(null)
  const [tenureReferences, setTenureReferences] = useState<import('@/stores/brand').BrandAsset[]>([])

  // ── Visual References State ──
  const [isSearchingRefs, setIsSearchingRefs] = useState(false)

  // ── Pattern Detection State ──
  const [activePattern, setActivePattern] = useState<DetectedPattern | null>(null)
  const editEvents = activeBrand?.editEvents || []
  const dismissedPatterns = activeBrand?.dismissedPatterns || []

  // Track an edit, classify it, and check for patterns
  const trackAndDetectPattern = (
    postId: string,
    platform: string,
    format: string,
    fieldName: string,
    originalText: string,
    editedText: string
  ) => {
    // Classify the edit type using heuristics (no AI call)
    const editType = classifyEdit(originalText, editedText, fieldName)
    if (editType === 'unclassified') return // Skip noise

    // Calculate word overlap
    const set1 = new Set(originalText.toLowerCase().split(/\s+/))
    const set2 = new Set(editedText.toLowerCase().split(/\s+/))
    const intersection = [...set1].filter(w => set2.has(w)).length
    const union = new Set([...set1, ...set2]).size
    const similarity = union === 0 ? 1 : intersection / union

    const event = {
      id: `edit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      postId,
      platform,
      format,
      fieldName,
      editType,
      originalText: originalText.slice(0, 200), // Trim for storage
      editedText: editedText.slice(0, 200),
      timestamp: new Date().toISOString(),
      similarity
    }

    addEditEvent(event)

    // 🧠 Brand OS Evolution: Log content edit signal to server
    signals.logContentEdit(postId, platform, format, editType, originalText, editedText)

    // Check for patterns with the new event included
    const allEvents = [...editEvents, event]
    const pattern = detectPattern(allEvents as EditEvent[], platform)

    if (pattern && !dismissedPatterns.includes(getPatternKey(pattern))) {
      setActivePattern(pattern)
    }
  }

  // Track copilot instructions as edit signals
  const trackCopilotInstruction = (
    postId: string,
    platform: string,
    format: string,
    instruction: string
  ) => {
    const editType = classifyCopilotInstruction(instruction)

    const event = {
      id: `copilot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      postId,
      platform,
      format,
      fieldName: 'copilot_instruction',
      editType,
      originalText: '',
      editedText: instruction.slice(0, 200),
      timestamp: new Date().toISOString(),
      similarity: 0
    }

    addEditEvent(event)

    // 🧠 Brand OS Evolution: Log copilot instruction signal to server
    signals.logContentEdit(postId, platform, format, editType, '', instruction)

    const allEvents = [...editEvents, event]
    const pattern = detectPattern(allEvents as EditEvent[], platform)

    if (pattern && !dismissedPatterns.includes(getPatternKey(pattern))) {
      setActivePattern(pattern)
    }
  }

  // ── Visual Reference Handlers ──
  const getActivePost = () => selectedPostId ? calendar?.find(p => p.id === selectedPostId) : null

  const handleFindReferences = async () => {
    const post = getActivePost()
    if (!post || !brandInfo || isSearchingRefs) return
    setIsSearchingRefs(true)
    try {
      const result = await findVisualReferences(post, brandInfo, strategy || null)
      if (result.success && result.references) {
        const visualRefs: VisualRef[] = result.references.map(r => ({
          ...r,
          status: 'suggested' as const
        }))
        updateCalendarPost(post.id, {
          visualReferences: visualRefs,
          referenceSearchQuery: result.searchQuery
        })
        showToast(`Found ${visualRefs.length} visual references`, 'success')
      } else {
        showToast(result.error || 'No references found', 'error')
      }
    } catch (e: any) {
      showToast('Reference search failed', 'error')
    } finally {
      setIsSearchingRefs(false)
    }
  }

  const handleResearchReferences = async (query: string) => {
    const post = getActivePost()
    if (!post || !brandInfo || isSearchingRefs) return
    setIsSearchingRefs(true)
    try {
      const result = await researchReferences(query, post, brandInfo)
      if (result.success && result.references) {
        const visualRefs: VisualRef[] = result.references.map(r => ({
          ...r,
          status: 'suggested' as const
        }))
        const existing = (post.visualReferences || []).filter(r => r.status === 'approved' || r.status === 'custom')
        updateCalendarPost(post.id, {
          visualReferences: [...existing, ...visualRefs],
          referenceSearchQuery: query
        })
        showToast(`Found ${visualRefs.length} new references`, 'success')
      }
    } catch {
      showToast('Re-search failed', 'error')
    } finally {
      setIsSearchingRefs(false)
    }
  }

  const handleApproveReference = (refId: string) => {
    const post = getActivePost()
    if (!post) return
    const refs = (post.visualReferences || []).map(r => ({
      ...r,
      status: r.id === refId ? 'approved' as const : r.status === 'approved' ? 'suggested' as const : r.status
    }))
    updateCalendarPost(post.id, {
      visualReferences: refs,
      activeReferenceId: refId
    })
    showToast('Reference approved ✓', 'success')
  }

  const handleRemoveReference = (refId: string) => {
    const post = getActivePost()
    if (!post) return
    const refs = (post.visualReferences || []).filter(r => r.id !== refId)
    const newActiveId = post.activeReferenceId === refId ? null : post.activeReferenceId
    updateCalendarPost(post.id, {
      visualReferences: refs,
      activeReferenceId: newActiveId
    })
  }

  const handleAddCustomReference = (url: string) => {
    const post = getActivePost()
    if (!post) return
    const newRef: VisualRef = {
      id: `custom-${Date.now()}`,
      title: 'Custom Reference',
      imageUrl: url,
      sourceUrl: url,
      sourcePlatform: url.includes('pinterest') ? 'pinterest' : url.includes('instagram') ? 'instagram' : url.includes('behance') ? 'behance' : 'other',
      description: 'Added by user',
      status: 'custom'
    }
    const existing = post.visualReferences || []
    updateCalendarPost(post.id, {
      visualReferences: [...existing, newRef]
    })
    showToast('Custom reference added', 'success')
  }

  // Navigate between posts in modal
  const navigatePost = (dir: 'next' | 'prev') => {
    if (!selectedPostId || !calendar) return
    const currentIndex = calendar.findIndex(p => p.id === selectedPostId)
    if (currentIndex === -1) return
    const newIndex = dir === 'prev' ? currentIndex - 1 : currentIndex + 1
    if (newIndex >= 0 && newIndex < calendar.length) {
      setSelectedPostId(calendar[newIndex].id)
    }
  }

  // Keyboard Navigation for Posts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedPostId) setSelectedPostId(null)
        if (showConfig) setShowConfig(false)
        return
      }
      if (!selectedPostId || !calendar) return
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === 'ArrowLeft') navigatePost('prev')
      if (e.key === 'ArrowRight') navigatePost('next')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedPostId, calendar, showConfig])

  // Calendar Math Nav
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() // 0-11
  
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let firstDayIdx = new Date(year, month, 1).getDay()
  // Adjust to make Monday = index 0 (JS default is Sunday = 0)
  firstDayIdx = firstDayIdx === 0 ? 6 : firstDayIdx - 1
  
  const previousMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

  // Formatting helper for matching "YYYY-MM-DD"
  const getDateStr = (dayNum: number) => {
     const mm = String(month + 1).padStart(2, '0');
     const dd = String(dayNum).padStart(2, '0');
     return `${year}-${mm}-${dd}`;
  }

  // Action Handlers
  const handleExportCalendar = async () => {
     setIsExporting(true)
     showToast("Generating PDF Pitch...", "info")
     await exportToPDF('calendar-export-node', `${brandInfo?.name || 'Brand'}_Calendar.pdf`)
     setIsExporting(false)
     hideToast()
     showToast("Calendar Pitch exported successfully.", "success")
  }

  const handleBatchGenerate = async () => {
    if (!brandInfo || !strategy || !calendar) return
    const pendingPosts = calendar.filter(p => !contentDrafts[p.id])
    if (pendingPosts.length === 0) {
       showToast("All posts already have drafts!", "info")
       return
    }

    setIsBatchGenerating(true)
    setBatchProgress(0)
    for (let i = 0; i < pendingPosts.length; i++) {
       const post = pendingPosts[i]
       setBatchProgress(i + 1)
       try {
          const safeBrand = { name: brandInfo.name, industry: brandInfo.industry, primaryAudiences: brandInfo.primaryAudiences, tone: brandInfo.tone, communicationStyle: brandInfo.communicationStyle } as any
          const res = await generatePostContent(safeBrand, strategy, post)
          if (res.success && res.data) {
             saveDraft(post.id, res.data)
          }
       } catch (e) {
          console.error(`Batch fail for post ${post.id}:`, e)
       }
    }
    setIsBatchGenerating(false)
    showToast("Batch Generation Complete!", "success")
  }
  const handleExtractTopicals = async () => {
    if (!brandInfo) return
    setError(null)
    setIsExtractingTopicals(true)
    try {
      // Import dynamically to avoid top-level issues if needed, or assume it's imported
      // Actually we must import it at the top. We will mock the import call for now.
      const { generateTopicals } = await import('@/actions/topicals')
      
      // Sanitize payload to avoid 413 Payload Too Large on Vercel due to huge extracted PDF texts in BrandInfo
      const safeBrandInfo = {
        name: brandInfo.name,
        industry: brandInfo.industry,
        primaryAudiences: brandInfo.primaryAudiences || []
      } as any

      const res = await generateTopicals(safeBrandInfo, selectedMonths)
      
      if (res.success && res.data) {
         setTopicals(res.data.map(t => ({ ...t, selected: true, suggestedFormat: 'Static' })))
         setConfigStep('topicals')
      } else {
         setError(sanitizeErrorForUI(res.error || "Failed to extract topicals"))
      }
    } catch (e: any) {
      setError(sanitizeErrorForUI("AI Request Failed."))
    } finally {
      setIsExtractingTopicals(false)
    }
  }

  const handleGenerateCalendar = async () => {
    if (!brandInfo || !strategy) {
       router.push('/onboarding')
       return
    }
    setError(null)
    setIsGeneratingCal(true)
    setConfigStep('loading')
    
    // Pass selectedMonths[0] as start, and last selected month as end.
    // For now we'll mock pass them to the action.
    const sorted = [...selectedMonths].sort()
    const startStr = `${sorted[0]}-01` // 1st of month
    
    // Last day of last month selected
    const lastMonth = sorted[sorted.length - 1]
    const [y, m] = lastMonth.split('-')
    const endObj = new Date(parseInt(y), parseInt(m), 0)
    const endStr = `${endObj.getFullYear()}-${String(endObj.getMonth()+1).padStart(2,'0')}-${String(endObj.getDate()).padStart(2,'0')}`

    try {
       setLoadingStatus("Scraping Live Web for Market Traction...")
       const { synthesizeMarketTraction } = await import('@/actions/traction')
       
       // Just pull top competitors from strategy if any exist, or leave blank to rely on Industry
        const competitors = (brandInfo.competitors || '').split(',').map((s: string) => s.trim()).filter(Boolean)
        const safeBrand = { brandInfo: { name: brandInfo.name, industry: brandInfo.industry, website: brandInfo.website, primaryAudiences: brandInfo.primaryAudiences } } as any
        const tractionRes = await synthesizeMarketTraction(safeBrand, { competitors })
       let tractionData = ""
       if (tractionRes.success && tractionRes.data) {
           tractionData = tractionRes.data
       }

       setLoadingStatus("Generating Calendar via AI...")
       // Use API route instead of server action — avoids RSC serialization limits
       const safeBrandCal = { name: brandInfo.name, industry: brandInfo.industry, primaryAudiences: brandInfo.primaryAudiences, tone: brandInfo.tone, communicationStyle: brandInfo.communicationStyle, platforms: brandInfo.platforms, coreProducts: brandInfo.coreProducts, brandType: brandInfo.brandType, productCatalog: brandInfo.productCatalog, serviceOfferings: brandInfo.serviceOfferings, competitors: brandInfo.competitors, website: brandInfo.website, aiKnowledgeBase: brandInfo.aiKnowledgeBase } as any
       const safeStrategy = {
          persona: strategy.persona,
          targetAudience: strategy.targetAudience,
          coreNarratives: strategy.coreNarratives,
          platformPlaybooks: strategy.platformPlaybooks,
          strategicPatterns: strategy.strategicPatterns,
          compiledBrandOS: strategy.compiledBrandOS,
          contentPillars: strategy.contentPillars,
       } as any

       const calResponse = await fetch('/api/generate-calendar', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           brandInfo: safeBrandCal,
           strategy: safeStrategy,
           startDate: startStr,
           endDate: endStr,
           frequency: 'custom',
           customEvents,
           topicals,
           tractionData,
           contentMatrix: Object.keys(contentMatrix).length > 0 ? contentMatrix : undefined,
           selectedBuckets: selectedBuckets.length > 0 ? selectedBuckets : undefined,
           bucketMode
         })
       })

       // Handle gateway errors (Vercel killed the function)
       if (calResponse.status === 504 || calResponse.status === 502 || calResponse.status === 503) {
         throw new Error('Calendar generation timed out. The AI engine is under heavy load — please try again.')
       }

       if (!calResponse.ok) {
         let errMsg = `Server error (${calResponse.status}).`
         try { errMsg = (await calResponse.json())?.error || errMsg } catch {}
         throw new Error(sanitizeErrorForUI(errMsg))
       }

       // Parse streamed response (handles heartbeat whitespace + __JSON__ delimiter)
       let res: any;
       try {
         res = await parseStreamedResponse(calResponse);
       } catch (parseErr: any) {
         console.error("Calendar response parse failed:", parseErr);
         throw new Error(parseErr?.message || "Something went wrong. Please try again.");
       }

       if (res.success && res.data) {
          setCalendar(res.data)
          setShowConfig(false)
          setConfigStep('setup')
       } else {
          setError(sanitizeErrorForUI(res.error || "Generation malfunctioned"))
          setConfigStep('topicals')
       }
    } catch (e: any) {
       console.error('Calendar generation error:', e)
       setError(sanitizeErrorForUI(e?.message || 'Calendar generation failed. Please try again.'))
       setConfigStep('topicals')
    } finally {
       setIsGeneratingCal(false)
    }
  }

  // Track original topic for edit learning
  const [originalTopic, setOriginalTopic] = useState<string>('')

  const handleGenerateContent = async (postId: string) => {
    if (!brandInfo || !strategy || !calendar) return
    const targetPost = calendar.find(p => p.id === postId)
    if (!targetPost) return

    setIsGeneratingContent(true)
    try {
       const existingDraft = contentDrafts[postId]
       const safeBrand = { name: brandInfo.name, industry: brandInfo.industry, primaryAudiences: brandInfo.primaryAudiences, tone: brandInfo.tone, communicationStyle: brandInfo.communicationStyle } as any
       const res = await generatePostContent(safeBrand, strategy, targetPost, toneFingerprint)
       if (res.success && res.data) {
          // A/B Memory: if there's an existing draft, push it to history before saving new one
          if (existingDraft) {
            saveDraftVariant(postId, res.data)
          } else {
            saveDraft(postId, res.data)
          }
       } else {
           showToast('Content generation failed. ' + sanitizeErrorForUI(res.error || ''), 'error')
       }
    } catch (e: any) {
        console.error('Content generation error:', e)
        showToast(sanitizeErrorForUI(e?.message || 'Content generation failed.'), 'error')
    } finally {
       setIsGeneratingContent(false)
    }
  }

  const handleChatSubmit = async () => {
    const activePost = selectedPostId ? calendar?.find(p => p.id === selectedPostId) : null
    const activeDraft = selectedPostId ? contentDrafts[selectedPostId] : null

    if (!activeDraft || !activePost || !chatInput.trim()) return

    // Track the copilot instruction for pattern detection
    trackCopilotInstruction(activePost.id, activePost.platform, activePost.format, chatInput)

    setIsChatting(true)
    try {
      const { chatWithCopyCopilot } = await import('@/actions/chat')
      const postContext = `${activePost.date} - ${activePost.platform} - ${activePost.topic}`
      const res = await chatWithCopyCopilot(activeDraft, chatInput, postContext)
      if (res.success && res.data) {
        saveDraft(activePost.id, res.data)
        setChatInput('')
      } else {
        showToast('Chat update failed. ' + sanitizeErrorForUI(res.error || ''), 'error')
      }
    } catch (e) {
      showToast('Failed to chat.', 'error')
    } finally {
      setIsChatting(false)
    }
  }

  const handleConceptChatSubmit = async () => {
    const activePost = selectedPostId ? calendar?.find(p => p.id === selectedPostId) : null
    if (!activeBrand || !activePost || !conceptChatInput.trim()) return

    // Track concept refinement instruction for pattern detection
    trackCopilotInstruction(activePost.id, activePost.platform, activePost.format, conceptChatInput)

    setIsIteratingConcept(true)
    try {
      const { chatWithConcept } = await import('@/actions/concept')
      const res = await chatWithConcept(activeBrand, activePost, conceptChatInput)
      if (res.success && res.data) {
        if (!res.data.approved) {
           showToast(`🎬 Creative Director Pushback: ${res.data.feedback}`, 'info')
           // DO NOT clear the input so the user can modify their prompt
           return
        }
        
        updateCalendarPost(activePost.id, { topic: res.data.newTopic })
        setConceptChatInput('')
        if (res.data.epiphany) {
           useBrandStore.getState().addAiKnowledge(res.data.epiphany)
           showToast('Brilliant edit! Added to AI Knowledge Base.', 'success')
        }
      } else {
        showToast('Concept iteration failed. ' + sanitizeErrorForUI(res.error || ''), 'error')
      }
    } catch (e) {
      showToast('Failed to iterate concept.', 'error')
    } finally {
      setIsIteratingConcept(false)
    }
  }

  const handleRerollConcept = async () => {
     const activePost = selectedPostId ? calendar?.find(p => p.id === selectedPostId) : null
     if (!activeBrand || !activePost) return
     
     setIsRerolling(true)
     try {
       const { rerollConcept } = await import('@/actions/concept')
       const res = await rerollConcept(activeBrand, activePost)
       if (res.success && res.data) {
         updateCalendarPost(activePost.id, { topic: res.data })
       } else {
         showToast('Reroll failed. ' + sanitizeErrorForUI(res.error || ''), 'error')
       }
     } catch (e: any) {
        console.error('Reroll error:', e)
        showToast(sanitizeErrorForUI(e?.message || 'Reroll failed.'), 'error')
     } finally {
        setIsRerolling(false)
     }
  }

  // Image Generation Handler — uses API route to avoid RSC serialization crash on large base64
  const handleGenerateVisual = async () => {
    const activePost = selectedPostId ? calendar?.find(p => p.id === selectedPostId) : null
    const activeDraft = selectedPostId ? contentDrafts[selectedPostId] : null
    if (!activePost || !activeDraft || !brandInfo || !strategy) return

    setIsGeneratingVisual(true)
    setVisualGenProgress(activePost.format === 'Carousel' ? 'Generating carousel slides...' : activePost.format === 'Story' ? 'Generating story frame...' : 'Generating static visual...')

    try {
      // Strip base64 image data from payload to stay under Vercel's 4.5MB limit
      const stripBase64 = (assets?: any[]) => assets?.map(a => ({ ...a, url: a.url?.startsWith('data:') ? '' : a.url }))
      const lightDraft = { ...activeDraft, postReferences: activeDraft.postReferences?.map(r => ({ ...r, url: r.url?.startsWith('data:') ? '' : r.url })) }

      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post: activePost,
          draft: lightDraft,
          brandInfo: { name: brandInfo.name, industry: brandInfo.industry, primaryColorHex: brandInfo.primaryColorHex, secondaryColorHex: brandInfo.secondaryColorHex, headingFont: brandInfo.headingFont, bodyFont: brandInfo.bodyFont, visualGuardrails: brandInfo.visualGuardrails, coreProducts: brandInfo.coreProducts },
          strategy: { persona: strategy.persona, targetAudience: strategy.targetAudience },
          format: activePost.format,
          model: imageModel,
          slideCount: 3,
        }),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown server error')
        throw new Error(`Server error (${res.status}): ${errText.slice(0, 200)}`)
      }

      const result = await res.json()

      if (result.success) {
        if (result.imageUrls) {
          saveDraft(activePost.id, { ...activeDraft, generatedVisuals: result.imageUrls })
          showToast(`${result.imageUrls.length} carousel slides generated`, 'success')
        } else if (result.imageUrl) {
          saveDraft(activePost.id, { ...activeDraft, generatedVisuals: [result.imageUrl] })
          showToast('Visual generated', 'success')
        }
      } else {
        showToast('Visual generation failed. ' + sanitizeErrorForUI(result.error || ''), 'error')
      }
    } catch (e: any) {
      showToast(sanitizeErrorForUI(e?.message || 'Image generation failed.'), 'error')
    } finally {
      setIsGeneratingVisual(false)
      setVisualGenProgress('')
    }
  }

  // Setup Empty State & Overlays
  if (!activeBrand) {
    return (
       <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-center animate-in fade-in duration-500">
         <div className="w-20 h-20 rounded-full bg-[var(--color-bg-hover)] flex items-center justify-center mb-6 border border-[var(--color-border-default)]">
            <CalendarIcon className="w-10 h-10 text-[var(--color-text-tertiary)]" />
         </div>
         <h2 className="text-3xl font-display font-bold text-[var(--color-text-primary)] mb-3">Workspace Required</h2>
         <p className="text-[var(--color-text-secondary)] mb-8 max-w-md">The Content Intelligence Engine requires an active brand session. Exit to Dashboard to select your focus.</p>
         <button onClick={() => router.push('/dashboard')} className="bg-[var(--color-accent-600)] hover:bg-[var(--color-accent-500)] text-white px-8 py-3 rounded-full font-bold transition-all transform hover:-translate-y-0.5 shadow-[0_0_20px_var(--color-accent-glow)] uppercase tracking-tight text-xs">Return to Dashboard</button>
       </div>
    )
  }

  if (!activeBrand.socialStrategyGenerated) {
    return (
       <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-center animate-in fade-in duration-500">
         <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-6 border border-amber-500/30">
            <CalendarIcon className="w-10 h-10 text-amber-400" />
         </div>
         <h2 className="text-3xl font-display font-bold text-[var(--color-text-primary)] mb-3">Social Strategy Required</h2>
         <p className="text-[var(--color-text-secondary)] mb-8 max-w-md">You need to generate your Social Media Strategy before building a content calendar. Head to Brand OS and unlock it.</p>
         <button onClick={() => router.push('/strategy')} className="bg-[var(--color-accent-600)] hover:bg-[var(--color-accent-500)] text-white px-8 py-3 rounded-full font-bold transition-all transform hover:-translate-y-0.5 shadow-[0_0_20px_var(--color-accent-glow)] uppercase tracking-tight text-xs flex items-center gap-2">
           Go to Brand OS
         </button>
       </div>
    )
  }

  if ((!calendar || calendar.length === 0) && !showConfig) {
    return (
       <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-center animate-in fade-in duration-500 relative">
          <div className="absolute top-[20%] left-[50%] translate-x-[-50%] w-[40%] h-[50%] bg-[var(--color-accent-700)] opacity-10 blur-[100px] rounded-full pointer-events-none" />

          <div className="w-24 h-24 rounded-full bg-[var(--color-accent-900)]/30 flex items-center justify-center mb-8 border border-[var(--color-accent-500)]/30 shadow-[0_0_40px_var(--color-accent-glow)] relative z-10">
             <Sparkles className="w-12 h-12 text-[var(--color-accent-400)]" />
          </div>
          <h2 className="text-4xl font-display font-bold text-[var(--color-text-primary)] mb-4 relative z-10 tracking-tight">Zero Strategy Distribution</h2>
          <p className="text-[var(--color-text-secondary)] mb-10 max-w-lg relative z-10 text-lg leading-relaxed">Your Brand Strategy is mapped, but the calendar is empty. Launch the content engine to scatter your strategic pillars across real-world dates and cultural events.</p>

          <button 
             onClick={() => setShowConfig(true)}
             className="bg-[var(--color-accent-600)] hover:bg-[var(--color-accent-500)] text-white px-10 py-4 rounded-full font-black tracking-widest transition-all transform hover:-translate-y-1 shadow-[0_0_30px_var(--color-accent-glow)] flex items-center gap-3 relative z-10 uppercase text-xs"
          >
             <Settings2 className="w-4 h-4" />
             Boot Generator Engine
          </button>
          
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl relative z-10">
             <div className="p-6 bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl flex flex-col items-start gap-4 shadow-sm">
                <div className="p-2 bg-[var(--color-info)]/10 rounded-lg"><CalendarIcon className="w-5 h-5 text-[var(--color-info)]" /></div>
                <h4 className="font-bold text-[var(--color-text-primary)]">Real-World Dates</h4>
                <p className="text-sm text-[var(--color-text-tertiary)] text-left">We map your content against actual business days, holidays, and target-audience engagement peaks.</p>
             </div>
             <div className="p-6 bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl flex flex-col items-start gap-4 shadow-sm">
                <div className="p-2 bg-[var(--color-success)]/10 rounded-lg"><Sparkles className="w-5 h-5 text-[var(--color-success)]" /></div>
                <h4 className="font-bold text-[var(--color-text-primary)]">Strategic Pacing</h4>
                <p className="text-sm text-[var(--color-text-tertiary)] text-left">The AI calculates the optimal frequency to maintain authority without exhausting your audience.</p>
             </div>
             <div className="p-6 bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-2xl flex flex-col items-start gap-4 shadow-sm">
                <div className="p-2 bg-[var(--color-accent-500)]/10 rounded-lg"><MousePointer2 className="w-5 h-5 text-[var(--color-accent-400)]" /></div>
                <h4 className="font-bold text-[var(--color-text-primary)]">Native Execution</h4>
                <p className="text-sm text-[var(--color-text-tertiary)] text-left">Every post includes a platform-specific topic and hook ready to be drafted with one click.</p>
             </div>
          </div>
       </div>
    )
  }

  const activePost = selectedPostId ? calendar?.find(p => p.id === selectedPostId) : null
  const activeDraft = selectedPostId ? contentDrafts[selectedPostId] : null

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Pattern Detection Prompt */}
      {activePattern && (
        <PatternPrompt
          pattern={activePattern}
          onAccept={(rule) => {
            addAiKnowledge(rule)
            showToast('Rule added to AI Knowledge Base permanently', 'success')
            setActivePattern(null)
          }}
          onDismiss={() => {
            dismissPattern(getPatternKey(activePattern))
            setActivePattern(null)
          }}
          onEditRule={(rule) => {
            addAiKnowledge(rule)
            showToast('Custom rule saved to AI Knowledge Base', 'success')
            setActivePattern(null)
          }}
        />
      )}

      {/* Configuration Modal Overlay */}
      {showConfig && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-md bg-black/50 p-4">
           <div className="w-[860px] max-h-[95vh] bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-3xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative flex flex-col animate-in zoom-in-95 duration-300">
             <div className="absolute top-0 right-0 w-60 h-60 bg-[var(--color-accent-500)] opacity-5 blur-[80px] pointer-events-none"></div>
             
             <div className="flex justify-between items-start border-b border-[var(--color-border-default)] pb-6 mb-6 flex-shrink-0">
                <div>
                  <h3 className="text-2xl font-display font-bold text-[var(--color-text-primary)] flex items-center gap-3 tracking-tight">
                     <Sparkles className="w-6 h-6 text-[var(--color-accent-400)]"/> 
                     {configStep === 'setup' ? 'Generator Setup' : configStep === 'topicals' ? 'Cultural Alignment' : 'Agentic Mapping'}
                  </h3>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-1 font-medium">
                     {configStep === 'setup' ? 'Configure mapping parameters.' : configStep === 'topicals' ? 'Approve AI-researched macro moments to lock the grid.' : 'Writing calendar code...'}
                  </p>
                </div>
                <button onClick={() => setShowConfig(false)} className="text-[var(--color-text-tertiary)] hover:text-white transition-colors p-2 hover:bg-[var(--color-bg-hover)] rounded-full"><X className="w-5 h-5"/></button>
             </div>

             <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8">
                {configStep === 'setup' && (
                   <>
                     <div>
                        <label className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest block mb-3">Live Delivery Window (Select Months)</label>
                        <div className="grid grid-cols-3 gap-2">
                           {upcomingMonths.map(m => {
                              const isSelected = selectedMonths.includes(m.value)
                              return (
                              <button 
                                 key={m.value} 
                                 onClick={() => setSelectedMonths(prev => isSelected && prev.length > 1 ? prev.filter(x => x !== m.value) : [...new Set([...prev, m.value])])} 
                                 className={`py-3 rounded-xl border-2 text-xs font-black uppercase tracking-widest transition-all ${isSelected ? 'border-[var(--color-accent-500)] bg-[var(--color-accent-600)] text-white shadow-[0_0_15px_var(--color-accent-glow)] scale-[1.02]' : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] bg-[var(--color-bg-surface)]'}`}
                              >
                                 {m.label}
                              </button>
                           )})}
                        </div>
                     </div>

                      {/* ── Content Matrix: Month → Platform → Format → Count ── */}
                     <div className="space-y-4">
                        <div>
                           <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest">Content Scope Matrix</label>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                 <input 
                                    type="checkbox"
                                    checked={applyToAllMonths}
                                    onChange={(e) => setApplyToAllMonths(e.target.checked)}
                                    className="w-4 h-4 accent-[var(--color-accent-500)] rounded cursor-pointer"
                                 />
                                 <span className="text-[10px] font-bold text-[var(--color-text-secondary)]">Same scope for all months</span>
                              </label>
                           </div>
                           <p className="text-[9px] text-[var(--color-text-muted)]">Define exactly how many posts of each format per platform per month. The AI will follow this blueprint precisely.</p>
                        </div>

                        {/* Month Tabs */}
                        <div className="flex gap-1.5 border-b border-[var(--color-border-default)]">
                           {selectedMonths.sort().map(monthVal => {
                              const monthDate = new Date(parseInt(monthVal.split('-')[0]), parseInt(monthVal.split('-')[1]) - 1)
                              const label = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' })
                              const isActive = activeMatrixMonth === monthVal
                              return (
                                 <button
                                    key={monthVal}
                                    onClick={() => setActiveMatrixMonth(monthVal)}
                                    className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-all border-b-2 -mb-[1px] ${isActive ? 'border-[var(--color-accent-500)] text-[var(--color-accent-400)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}`}
                                 >
                                    {label}
                                 </button>
                              )
                           })}
                        </div>

                        {/* Platform Cards for Active Month */}
                        {(() => {
                           // Normalize platform names so "Instagram", "Facebook", "Meta" etc. all map to canonical names
                           const PLATFORM_ALIASES: Record<string, string> = {
                              'Instagram': 'Meta (Instagram & Facebook)',
                              'Facebook': 'Meta (Instagram & Facebook)',
                              'Meta': 'Meta (Instagram & Facebook)',
                              'Meta (Instagram & Facebook)': 'Meta (Instagram & Facebook)',
                              'Twitter': 'X (Twitter)',
                              'X': 'X (Twitter)',
                              'X (Twitter)': 'X (Twitter)',
                              'LinkedIn': 'LinkedIn',
                              'YouTube': 'YouTube',
                              'Pinterest': 'Pinterest',
                              'TikTok': 'TikTok',
                           }
                           const SOCIAL_KEYS = ['Meta (Instagram & Facebook)', 'LinkedIn', 'X (Twitter)', 'YouTube', 'Pinterest', 'TikTok']
                           const rawPlatforms = brandInfo?.platforms || []
                           const socialPlatforms = [...new Set(rawPlatforms.map(p => PLATFORM_ALIASES[p]).filter((p): p is string => !!p && SOCIAL_KEYS.includes(p)))]
                           
                           if (socialPlatforms.length === 0) {
                              return (
                                 <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-400 font-bold">
                                    No social media platforms configured. Go to Brand OS to add platforms first.
                                 </div>
                              )
                           }

                           // Get total for this month
                           const monthData = contentMatrix[activeMatrixMonth] || {}
                           const monthTotal = Object.values(monthData).reduce((sum, platFormats) => sum + Object.values(platFormats).reduce((s, c) => s + c, 0), 0)

                           return (
                              <div className="space-y-3">
                                 <div className="flex items-center justify-between">
                                    <span className="text-[9px] text-[var(--color-text-muted)] font-medium">Total posts this month</span>
                                    <span className={`text-sm font-black ${monthTotal > 0 ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-text-muted)]'}`}>{monthTotal} posts</span>
                                 </div>
                                 
                                 {socialPlatforms.map(plat => {
                                    const formats = PLATFORM_FORMATS[plat] || []
                                    const platIcon = PLATFORM_ICONS[plat] || PLATFORM_ICONS['default']
                                    const PlatIcon = platIcon.icon
                                    const platData = monthData[plat] || {}
                                    const platTotal = Object.values(platData).reduce((s, c) => s + c, 0)

                                    return (
                                       <div key={plat} className="rounded-xl border-2 border-[var(--color-border-default)] bg-[var(--color-bg-surface)] overflow-hidden">
                                          {/* Platform Header */}
                                          <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--color-bg-base)]">
                                             <div className="flex items-center gap-2">
                                                <PlatIcon className={`w-4 h-4 ${platIcon.color}`} />
                                                <span className="text-xs font-black uppercase tracking-widest text-[var(--color-text-primary)]">{plat.replace(' (Instagram & Facebook)', '').replace(' (Twitter)', '')}</span>
                                             </div>
                                             <span className={`text-[10px] font-bold ${platTotal > 0 ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-text-muted)]'}`}>{platTotal} posts</span>
                                          </div>
                                          
                                          {/* Format Rows */}
                                          <div className="divide-y divide-[var(--color-border-default)]">
                                             {formats.map(fmt => {
                                                const count = platData[fmt.value] || 0
                                                return (
                                                   <div key={fmt.value} className="flex items-center justify-between px-3 py-2">
                                                      <div className="flex items-center gap-2">
                                                         <span className="text-xs font-bold text-[var(--color-text-secondary)]">{fmt.label}</span>
                                                      </div>
                                                      <div className="flex items-center gap-1">
                                                         <button
                                                            onClick={() => {
                                                               if (count <= 0) return
                                                               updateMatrix(activeMatrixMonth, plat, fmt.value, count - 1)
                                                            }}
                                                            className="w-7 h-7 rounded-lg border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-hover)] transition-all text-sm font-bold"
                                                         >−</button>
                                                         <input
                                                            type="number"
                                                            min="0"
                                                            value={count}
                                                            onChange={(e) => {
                                                               const val = Math.max(0, parseInt(e.target.value) || 0)
                                                               updateMatrix(activeMatrixMonth, plat, fmt.value, val)
                                                            }}
                                                            className={`w-10 text-center text-sm font-black bg-transparent outline-none border-b-2 border-transparent focus:border-[var(--color-accent-500)] transition-colors ${count > 0 ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}
                                                         />
                                                         <button
                                                            onClick={() => {
                                                               updateMatrix(activeMatrixMonth, plat, fmt.value, count + 1)
                                                            }}
                                                            className="w-7 h-7 rounded-lg border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-accent-400)] hover:border-[var(--color-accent-500)] transition-all text-sm font-bold"
                                                         >+</button>
                                                      </div>
                                                   </div>
                                                )
                                             })}
                                          </div>
                                       </div>
                                    )
                                 })}
                              </div>
                           )
                        })()}
                     </div>

                     {/* ── Feed Aesthetic & Tenure References ── */}
                     <div className="space-y-4 pt-4 border-t border-[var(--color-border-default)]">

                        {/* Content Pillar / Bucket Mix */}
                        {strategy?.contentPillars && Object.keys(strategy.contentPillars).length > 0 && (
                          <div className="space-y-4">
                             <div>
                                <label className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest block mb-1 flex items-center gap-2">
                                  Content Bucket Mix
                                  <span className="px-2 py-0.5 rounded-full text-[8px] bg-purple-500/10 text-purple-400 border border-purple-500/20">Brand OS Data</span>
                                </label>
                                <p className="text-[9px] text-[var(--color-text-muted)]">Control how AI distributes posts across your strategic content buckets.</p>
                             </div>

                             <div className="flex gap-2">
                               <button 
                                 onClick={() => setBucketMode('ai')} 
                                 className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${bucketMode === 'ai' ? 'border-purple-500 bg-purple-500/5' : 'border-[var(--color-border-default)] hover:border-purple-500/50'}`}
                               >
                                 <h4 className={`text-xs font-black uppercase tracking-widest mb-1 ${bucketMode === 'ai' ? 'text-purple-400' : 'text-[var(--color-text-muted)]'}`}>AI-Guided</h4>
                                 <p className="text-[10px] text-[var(--color-text-tertiary)]">AI mixes buckets naturally within min/max limits.</p>
                               </button>
                               <button 
                                 onClick={() => setBucketMode('manual')} 
                                 className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${bucketMode === 'manual' ? 'border-sky-500 bg-sky-500/5' : 'border-[var(--color-border-default)] hover:border-sky-500/50'}`}
                               >
                                 <h4 className={`text-xs font-black uppercase tracking-widest mb-1 ${bucketMode === 'manual' ? 'text-sky-400' : 'text-[var(--color-text-muted)]'}`}>Strict Manual</h4>
                                 <p className="text-[10px] text-[var(--color-text-tertiary)]">Force exact post counts per bucket.</p>
                               </button>
                             </div>

                             <div className="space-y-3 bg-[var(--color-bg-surface)] p-4 rounded-xl border border-[var(--color-border-subtle)]">
                                {selectedBuckets.length > 0 ? (
                                   <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                     {selectedBuckets.map((b, idx) => (
                                       <div key={idx} className="flex items-center justify-between py-2 border-b border-[var(--color-border-subtle)] last:border-0">
                                         <div>
                                           <div className="flex items-center gap-1.5 mb-0.5">
                                             <span className="text-[8px] font-bold px-1.5 py-0.5 bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] rounded uppercase tracking-widest">{b.pillarName}</span>
                                           </div>
                                           <p className="text-xs font-bold text-[var(--color-text-secondary)]">{b.bucketName}</p>
                                         </div>
                                         <div className="flex items-center gap-3">
                                           {bucketMode === 'ai' ? (
                                             <div className="flex items-center gap-1.5 px-3 py-1 bg-[var(--color-bg-hover)] rounded-lg">
                                               <span className="text-[10px] font-black text-emerald-400">{b.min}</span>
                                               <span className="text-[10px] text-[var(--color-text-muted)]">-</span>
                                               <span className="text-[10px] font-black text-amber-400">{b.max}</span>
                                               <span className="text-[8px] uppercase tracking-widest text-[var(--color-text-tertiary)] ml-1">posts/mo</span>
                                             </div>
                                           ) : (
                                             <div className="flex items-center gap-2">
                                               <button onClick={() => {
                                                 const upd = [...selectedBuckets]
                                                 upd[idx].count = Math.max(0, (upd[idx].count || 0) - 1)
                                                 setSelectedBuckets(upd)
                                               }} className="w-6 h-6 rounded-md bg-[var(--color-bg-hover)] hover:bg-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)]">-</button>
                                               <span className="w-6 text-center text-xs font-black text-[var(--color-text-primary)]">{b.count || 0}</span>
                                               <button onClick={() => {
                                                 const upd = [...selectedBuckets]
                                                 upd[idx].count = (upd[idx].count || 0) + 1
                                                 setSelectedBuckets(upd)
                                               }} className="w-6 h-6 rounded-md bg-[var(--color-bg-hover)] hover:bg-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)]">+</button>
                                             </div>
                                           )}
                                         </div>
                                       </div>
                                     ))}
                                   </div>
                                 ) : (
                                   <div className="py-6 text-center">
                                     <div className="w-10 h-10 rounded-xl bg-[var(--color-bg-hover)] flex items-center justify-center mx-auto mb-3">
                                       <Activity className="w-5 h-5 text-[var(--color-text-muted)]" />
                                     </div>
                                     <p className="text-xs font-medium text-[var(--color-text-secondary)]">No buckets active.</p>
                                   </div>
                                 )}
                             </div>
                          </div>
                        )}

                        <div>
                           <label className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest block mb-1">Feed Aesthetic</label>
                           <p className="text-[9px] text-[var(--color-text-muted)]">Select the visual theme for this calendar tenure. This will guide AI image generation style.</p>
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                           {([
                              { id: 'pastel', label: 'Pastel', desc: 'Soft, muted tones', colors: ['#F8C8DC', '#D5B4E0', '#B5D8C7'], emoji: '' },
                              { id: 'bright', label: 'Bright', desc: 'Vibrant, saturated', colors: ['#FF4444', '#4488FF', '#FFCC00'], emoji: '' },
                              { id: 'monochrome', label: 'Mono', desc: 'B&W, high contrast', colors: ['#1a1a1a', '#888888', '#f0f0f0'], emoji: '' },
                              { id: 'earthy', label: 'Earthy', desc: 'Warm, organic', colors: ['#8B6914', '#A0522D', '#556B2F'], emoji: '' },
                              { id: 'neon', label: 'Neon', desc: 'Electric, glowing', colors: ['#39FF14', '#FF073A', '#9D00FF'], emoji: '' },
                              { id: 'minimal', label: 'Minimal', desc: 'Clean, spacious', colors: ['#FFFFFF', '#E8E8E8', '#333333'], emoji: '' },
                           ] as const).map(theme => {
                              const isActive = feedAesthetic === theme.id
                              return (
                                 <button
                                    key={theme.id}
                                    onClick={() => setFeedAesthetic(isActive ? null : theme.id)}
                                    className={`p-3 rounded-xl border-2 text-center transition-all space-y-2 ${isActive ? 'border-[var(--color-accent-500)] bg-[var(--color-accent-500)]/5 shadow-md scale-[1.02]' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-hover)] bg-[var(--color-bg-surface)]'}`}
                                 >
                                    <div className="flex gap-1 justify-center">
                                       {theme.colors.map((c, ci) => (
                                          <div key={ci} className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: c }} />
                                       ))}
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-wider block ${isActive ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-text-secondary)]'}`}>{theme.label}</span>
                                    <span className="text-[8px] text-[var(--color-text-muted)] block">{theme.desc}</span>
                                 </button>
                              )
                           })}
                        </div>

                        {/* Tenure References */}
                        <div className="mt-3">
                           <label className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest block mb-1">Tenure References</label>
                           <p className="text-[9px] text-[var(--color-text-muted)] mb-2">Add visual references specifically for this calendar period. These will guide AI for this tenure only.</p>
                           <div className="flex gap-2 items-center overflow-x-auto pb-2 custom-scrollbar">
                              {tenureReferences.map((ref, i) => (
                                 <div key={ref.id} className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-[var(--color-border-default)] group">
                                    <img src={ref.url} className="w-full h-full object-cover" alt={ref.name} />
                                    <button onClick={() => setTenureReferences(prev => prev.filter(r => r.id !== ref.id))} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                       <X className="w-4 h-4 text-white" />
                                    </button>
                                 </div>
                              ))}
                              <label className="shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-[var(--color-border-default)] hover:border-pink-500 flex flex-col items-center justify-center cursor-pointer text-[var(--color-text-muted)] hover:text-pink-400 transition-all">
                                 <UploadCloud className="w-4 h-4" />
                                 <span className="text-[7px] font-bold mt-0.5">Add</span>
                                 <input type="file" className="hidden" multiple accept="image/png,image/jpeg,image/webp" onChange={async (e) => {
                                    const files = e.target.files; if (!files) return
                                    const newRefs: import('@/stores/brand').BrandAsset[] = []
                                    for (let i = 0; i < files.length; i++) {
                                       const file = files[i]; if (!file.type.startsWith('image/')) continue
                                       const url = await new Promise<string>((r) => { const rd = new FileReader(); rd.onload = () => r(rd.result as string); rd.readAsDataURL(file) })
                                       newRefs.push({ id: `tr-${Date.now()}-${i}`, name: file.name, type: 'image', url, size: file.size, addedAt: new Date().toISOString() })
                                    }
                                    setTenureReferences(prev => [...prev, ...newRefs]); e.target.value = ''
                                 }} />
                              </label>
                           </div>
                        </div>
                     </div>

                     <div>
                        <label className="text-[10px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest mb-3 flex items-center justify-between">
                          Custom Context & Events 
                          <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Agent Input</span>
                        </label>
                        <textarea
                          placeholder="Specify upcoming launch dates, sales, or themes to guide the planner..."
                          value={customEvents}
                          onChange={(e) => setCustomEvents(e.target.value)}
                          className="w-full bg-[var(--color-bg-surface)] border-2 border-[var(--color-border-default)] rounded-xl px-4 py-4 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-500)] h-24 custom-scrollbar resize-none font-medium"
                        ></textarea>
                     </div>
                   </>
                )}

                {configStep === 'topicals' && (
                   <div className="space-y-4 animate-in fade-in duration-500">
                      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold leading-relaxed mb-6">
                        <Sparkles className="w-4 h-4 inline-block mr-2 mb-0.5" />
                        AI strategically isolated {topicals.length} cultural moments for {brandInfo?.name}. Approve the ones you want to map to the calendar and select their asset format.
                      </div>

                      {topicals.map((t, i) => (
                         <div key={t.id || i} className={`p-4 border-2 rounded-2xl transition-all ${t.selected ? 'border-[var(--color-accent-500)] bg-[var(--color-bg-surface)] shadow-md' : 'border-[var(--color-border-default)] opacity-50'}`}>
                            <div className="flex items-start gap-4">
                               <input 
                                 type="checkbox" 
                                 checked={t.selected}
                                 onChange={() => setTopicals(topicals.map(x => x.id === t.id ? {...x, selected: !x.selected} : x))}
                                 className="w-5 h-5 rounded border-2 border-[var(--color-border-hover)] text-[var(--color-accent-500)] focus:ring-[var(--color-accent-500)] mt-1 cursor-pointer" 
                               />
                               <div className="flex-1">
                                  <div className="flex items-center justify-between mb-1">
                                     <h4 className={`text-sm font-black ${t.selected ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}`}>{t.name}</h4>
                                     <input
                                        type="date"
                                        value={t.dateStr}
                                        onChange={(e) => setTopicals(topicals.map(x => x.id === t.id ? {...x, dateStr: e.target.value} : x))}
                                        className="text-[10px] uppercase font-black text-[var(--color-accent-400)] bg-transparent border border-[var(--color-border-default)] rounded-lg px-2 py-1 outline-none focus:border-[var(--color-accent-500)] cursor-pointer"
                                     />
                                  </div>
                                  <p className="text-xs text-[var(--color-text-tertiary)] mb-3 leading-relaxed">{t.relevance}</p>
                                  
                                  {t.selected && (
                                     <div className="flex items-center gap-2">
                                        <label className="text-[9px] uppercase font-bold text-[var(--color-text-secondary)]">Asset Format:</label>
                                        <select 
                                           value={t.suggestedFormat}
                                           onChange={(e) => setTopicals(topicals.map(x => x.id === t.id ? {...x, suggestedFormat: e.target.value} : x))}
                                           className="bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-xs text-[var(--color-text-primary)] font-bold rounded-lg px-2 py-1 outline-none"
                                        >
                                           <option value="Static">Static Image</option>
                                           <option value="Reel">Reel / Video</option>
                                           <option value="Carousel">Carousel</option>
                                           <option value="Story">Story</option>
                                        </select>
                                     </div>
                                  )}
                               </div>
                            </div>
                         </div>
                      ))}

                      {/* Add Custom Topical */}
                      <button
                         onClick={() => {
                            const newTopical = {
                               id: `custom-${Date.now()}`,
                               name: '',
                               dateStr: '',
                               relevance: '',
                               suggestedFormat: 'Static',
                               selected: true,
                               isCustom: true,
                            }
                            setTopicals([...topicals, newTopical])
                         }}
                         className="w-full py-3 border-2 border-dashed border-[var(--color-border-default)] hover:border-[var(--color-accent-500)] rounded-2xl text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-accent-400)] transition-all flex items-center justify-center gap-2"
                      >
                         <Plus className="w-4 h-4" /> Add Custom Topical
                      </button>

                      {/* Inline edit for newly added custom topicals */}
                      {topicals.filter(t => t.isCustom && !t.name).length > 0 && (
                         <div className="space-y-3">
                            {topicals.filter(t => t.isCustom && !t.name).map((t) => (
                               <div key={t.id} className="p-4 border-2 border-[var(--color-accent-500)] rounded-2xl bg-[var(--color-bg-surface)] shadow-md space-y-3">
                                  <input
                                     type="text"
                                     placeholder="Event name (e.g. Brand Anniversary, Product Launch)"
                                     autoFocus
                                     onBlur={(e) => {
                                        if (e.target.value.trim()) {
                                           setTopicals(topicals.map(x => x.id === t.id ? {...x, name: e.target.value.trim()} : x))
                                        }
                                     }}
                                     onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                                           setTopicals(topicals.map(x => x.id === t.id ? {...x, name: (e.target as HTMLInputElement).value.trim()} : x))
                                        }
                                     }}
                                     className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] font-bold outline-none focus:border-[var(--color-accent-500)]"
                                  />
                                  <div className="flex gap-2">
                                     <input
                                        type="date"
                                        value={t.dateStr}
                                        onChange={(e) => setTopicals(topicals.map(x => x.id === t.id ? {...x, dateStr: e.target.value} : x))}
                                        className="flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] font-bold outline-none focus:border-[var(--color-accent-500)]"
                                     />
                                     <input
                                        type="text"
                                        placeholder="Why it matters for your brand"
                                        onChange={(e) => setTopicals(topicals.map(x => x.id === t.id ? {...x, relevance: e.target.value} : x))}
                                        className="flex-[2] bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] font-medium outline-none focus:border-[var(--color-accent-500)]"
                                     />
                                  </div>
                               </div>
                            ))}
                         </div>
                      )}
                   </div>
                )}

                {configStep === 'loading' && (
                   <div className="py-20 flex flex-col items-center justify-center text-center space-y-6">
                      <div className="w-16 h-16 rounded-full border-4 border-[var(--color-accent-500)]/30 border-t-[var(--color-accent-500)] animate-spin" />
                      <div>
                         <h4 className="text-lg font-black text-white mb-2 tracking-wide">{loadingStatus}</h4>
                         <p className="text-sm text-[var(--color-text-tertiary)]">Booting up Tri-Vector analysis and distributing strategic pillars.</p>
                      </div>
                   </div>
                )}
             </div>

             {error && <p className="text-red-400 text-xs font-bold mt-4 flex items-center gap-2 flex-shrink-0"><X className="w-4 h-4"/> Error: {error}</p>}

             <div className="mt-6 pt-4 border-t border-[var(--color-border-default)] flex-shrink-0">
               {configStep === 'setup' && (
                  <button 
                     onClick={handleExtractTopicals}
                     disabled={isExtractingTopicals}
                     className="w-full bg-[var(--color-accent-600)] hover:bg-[var(--color-accent-500)] text-white py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all flex justify-center items-center gap-3 shadow-[0_10px_30px_var(--color-accent-glow)] active:scale-[0.98] disabled:opacity-50"
                  >
                     {isExtractingTopicals ? <Sparkles className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                     {isExtractingTopicals ? "Researching Target Months..." : "Discover Contextual Topicals"}
                  </button>
               )}
               {configStep === 'topicals' && (
                  <button 
                     onClick={handleGenerateCalendar}
                     className="w-full bg-[var(--color-success)] hover:bg-emerald-500 text-white py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all flex justify-center items-center gap-3 shadow-[0_10px_30px_rgba(16,185,129,0.3)] active:scale-[0.98]"
                  >
                     <CalendarDays className="w-5 h-5" />
                     Lock Concepts & Fill Calendar
                  </button>
               )}
             </div>
           </div>
         </div>
      )}

      {/* Header & Date Navigation */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex flex-col gap-4">
           <div className="flex items-center gap-4 bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-full p-2 px-6 shadow-sm w-max">
              <button onClick={previousMonth} className="p-2 hover:bg-[var(--color-bg-hover)] rounded-full text-[var(--color-text-secondary)] hover:text-white transition-colors"><ChevronLeft className="w-5 h-5"/></button>
              <h1 className="text-2xl min-w-[200px] text-center font-display font-bold text-[var(--color-text-primary)] tracking-tight">{monthNames[month]} {year}</h1>
              <button onClick={nextMonth} className="p-2 hover:bg-[var(--color-bg-hover)] rounded-full text-[var(--color-text-secondary)] hover:text-white transition-colors"><ChevronRight className="w-5 h-5"/></button>
           </div>
           
           {/* Platform Isolation Tabs */}
           {calendar && calendar.length > 0 && (
             <div className="flex items-center gap-2">
                <button 
                  onClick={() => setActivePlatformFilter('Master')}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${activePlatformFilter === 'Master' ? 'bg-[var(--color-accent-600)] text-white shadow-sm' : 'bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:border-[var(--color-border-hover)]'}`}>
                  Master View
                </button>
                {Array.from(new Set(calendar.map(p => p.platform))).map(plat => (
                   <button 
                     key={plat}
                     onClick={() => setActivePlatformFilter(plat)}
                     className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${activePlatformFilter === plat ? 'bg-amber-500 text-white shadow-sm' : 'bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:border-[var(--color-border-hover)]'}`}>
                     {plat}
                   </button>
                ))}
             </div>
           )}
        </div>

        <div className="flex gap-3 h-max">
           {calendar && calendar.length > 0 && (
              <>
                 <div className="flex items-center bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-full p-1 shadow-sm h-12">
                    <button 
                       onClick={() => setViewMode('grid')}
                       className={`p-2 rounded-full transition-colors ${viewMode === 'grid' ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}
                    >
                       <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button 
                       onClick={() => setViewMode('matrix')}
                       className={`p-2 rounded-full transition-colors ${viewMode === 'matrix' ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}
                    >
                       <List className="w-4 h-4" />
                    </button>
                 </div>
                 <button 
                   onClick={handleExportCalendar}
                   disabled={isExporting}
                   className="h-12 px-6 flex items-center gap-2 rounded-full bg-[var(--color-info)]/10 border border-[var(--color-border-default)] hover:border-[var(--color-info)] hover:bg-[var(--color-info)]/20 text-xs font-black uppercase tracking-widest text-[var(--color-info)] transition-all disabled:opacity-50"
                 >
                   {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                   Export Pitch
                 </button>
                 <button 
                   onClick={handleBatchGenerate}
                   disabled={isBatchGenerating}
                   className="h-12 px-6 flex items-center gap-2 rounded-full bg-[var(--color-accent-600)]/10 border border-[var(--color-accent-500)]/40 hover:bg-[var(--color-accent-600)]/20 text-xs font-black uppercase tracking-widest text-[var(--color-accent-400)] transition-all disabled:opacity-50"
                 >
                   {isBatchGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                   {isBatchGenerating ? `Drafting...` : 'Draft All Pending'}
                 </button>
              </>
           )}
          <button className="h-12 px-6 flex items-center gap-2 rounded-full border border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] text-xs font-black uppercase tracking-widest text-[var(--color-text-secondary)] transition-all">
            <Filter className="w-4 h-4" /> Filter
          </button>
          <button onClick={() => setShowConfig(true)} className="h-12 px-8 flex items-center gap-3 rounded-full bg-[var(--color-bg-surface)] border-2 border-[var(--color-accent-500)]/30 hover:border-[var(--color-accent-500)] text-xs font-black uppercase tracking-widest text-[var(--color-text-primary)] transition-all shadow-lg">
            <Sparkles className="w-4 h-4 text-[var(--color-accent-400)]" /> Advanced Engine
          </button>
        </div>
      </div>
      
      {/* Real-World Calendar Grid Math or Matrix View */}
      <div id="calendar-export-node" className={`flex-1 bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-3xl overflow-hidden flex flex-col shadow-2xl relative mb-4 ${viewMode === 'grid' ? 'p-8' : 'p-0 pb-0'}`}>
         {viewMode === 'grid' ? (
           <>
             <div className="grid grid-cols-7 gap-6 mb-6 text-[var(--color-text-tertiary)] text-[10px] font-black tracking-[0.2em] uppercase text-center opacity-70">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day}>{day}</div>)}
             </div>
             
             <div className="grid grid-cols-7 gap-4 flex-1 overflow-y-auto pr-3 custom-scrollbar pb-4 relative z-0">
                {Array.from({ length: 42 }).map((_, idx) => {
                   const isPad = idx < firstDayIdx || idx >= (firstDayIdx + daysInMonth)
                   const actualDay = idx - firstDayIdx + 1
                   
                   if (isPad) {
                      return <div key={idx} className="rounded-2xl bg-[var(--color-bg-hover)]/30 min-h-[160px] pointer-events-none border border-transparent opacity-20"></div>
                   }

                   const dateStr = getDateStr(actualDay)
                   const daysPosts = calendar ? calendar.filter(p => p.date === dateStr && (activePlatformFilter === 'Master' || p.platform === activePlatformFilter)) : []
                   const eventFlag = daysPosts.find(p => p.eventContext)?.eventContext
                   const isToday = new Date().toISOString().split('T')[0] === dateStr

                   return (
                   <div key={idx} className={`group rounded-2xl min-h-[160px] transition-all duration-300 border flex flex-col relative ${isToday ? 'bg-[var(--color-accent-900)]/10 border-[var(--color-accent-500)]/40 shadow-[inset_0_0_30px_rgba(139,92,246,0.08)]' : 'bg-[var(--color-bg-hover)]/50 border-[var(--color-border-subtle)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-hover)]'}`}>
                      
                      {eventFlag && (
                         <div className="absolute top-[-8px] left-[10px] right-[10px] z-10 bg-orange-600 px-3 py-1 rounded-full text-white text-[8px] font-black uppercase tracking-widest shadow-lg truncate">
                            {eventFlag}
                         </div>
                      )}

                      <div className={`flex justify-between items-center px-4 pt-4 mb-3 flex-grow-0`}>
                         <span className={`text-sm font-black flex items-center justify-center w-8 h-8 rounded-xl ${isToday ? 'bg-[var(--color-accent-500)] text-white shadow-lg' : 'text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors'}`}>
                            {actualDay}
                         </span>
                         <button className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] p-1 hover:bg-[var(--color-bg-hover)] rounded-md">
                            <Plus className="w-4 h-4" />
                         </button>
                      </div>

                      {/* Render Assigned Posts */}
                      <div className="px-3 pb-3 space-y-2 flex-1 scrollbar-hide overflow-y-auto">
                         {daysPosts.map(post => {
                            const hasDraft = !!contentDrafts[post.id]
                            
                            return (
                               <div 
                                  key={post.id} 
                                  onClick={() => setSelectedPostId(post.id)}
                                  className={`px-3 py-3 rounded-xl border cursor-pointer group/post transition-all active:scale-95 ${hasDraft ? 'bg-[var(--color-accent-900)]/30 border-[var(--color-accent-500)]/60 shadow-[0_4px_15px_rgba(139,92,246,0.15)] ring-1 ring-[var(--color-accent-500)]/20' : 'bg-[var(--color-bg-surface)] border-[var(--color-border-default)] hover:border-[var(--color-info)]/60 hover:shadow-md'}`}
                               >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                       {(() => {
                                          const config = PLATFORM_ICONS[post.platform] || PLATFORM_ICONS.default;
                                          const Icon = config.icon;
                                          return <Icon className={`w-3.5 h-3.5 ${config.color} group-hover/post:filter group-hover/post:brightness-125 transition-all`} />;
                                       })()}
                                       <span className="text-[9px] font-black text-[var(--color-text-tertiary)] uppercase tracking-wider truncate max-w-[80px]">
                                          {post.platform.replace(' (Instagram & Facebook)', '')}
                                       </span>
                                    </div>
                                    {hasDraft && <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]" />}
                                </div>
                               <div className="mt-1">
                                 {post.bucketName && (
                                   <div className="inline-block mb-1 px-1.5 py-0.5 bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded text-[8px] font-bold text-[var(--color-text-muted)] truncate max-w-full">
                                     {post.bucketName}
                                   </div>
                                 )}
                                 <p className={`text-[11px] font-bold leading-snug line-clamp-2 ${hasDraft ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-primary)]'}`} title={post.topic}>
                                    {post.topic}
                                 </p>
                               </div>
                               </div>
                            )
                         })}
                      </div>
                   </div>
                   )
                })}
             </div>
           </>
         ) : (
           <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                 <thead className="sticky top-0 bg-[var(--color-bg-hover)] z-10 border-b border-[var(--color-border-default)] shadow-sm">
                    <tr>
                       <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Date</th>
                       <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Platform</th>
                       <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Format</th>
                       <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Content Pillar</th>
                       <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)]">Actionable Hook</th>
                       <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-tertiary)] text-right">Status</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {calendar && calendar.filter(p => activePlatformFilter === 'Master' || p.platform === activePlatformFilter)
                        .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                        .map(post => {
                           const hasDraft = !!contentDrafts[post.id]
                           const isCurrentMonth = post.date.startsWith(getDateStr(1).substring(0, 7)) // YYYY-MM
                           if (!isCurrentMonth) return null; 
                           return (
                              <tr key={post.id} onClick={() => setSelectedPostId(post.id)} className="hover:bg-[var(--color-bg-hover)]/50 cursor-pointer transition-colors group">
                                 <td className="py-4 px-6 whitespace-nowrap">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-bold text-[var(--color-text-primary)]">{post.date}</span>
                                      {post.eventContext && <span className="text-[10px] font-black text-orange-400 mt-1 uppercase tracking-widest">{post.eventContext}</span>}
                                    </div>
                                 </td>
                                 <td className="py-4 px-6 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                       {(() => {
                                          const config = PLATFORM_ICONS[post.platform] || PLATFORM_ICONS.default;
                                          const Icon = config.icon;
                                          return <Icon className={`w-4 h-4 ${config.color}`} />;
                                       })()}
                                       <span className="text-xs font-black text-[var(--color-text-secondary)] uppercase tracking-wider">{post.platform.replace(' (Instagram & Facebook)', '')}</span>
                                    </div>
                                 </td>
                                 <td className="py-4 px-6 whitespace-nowrap">
                                    <span className="text-xs font-black text-[var(--color-text-tertiary)] uppercase tracking-wider">{post.format}</span>
                                 </td>
                                 <td className="py-4 px-6 whitespace-nowrap">
                                    <span className="px-3 py-1 rounded-full bg-[var(--color-bg-input)] text-[var(--color-text-primary)] text-[10px] font-bold border border-[var(--color-border-default)]">{post.pillar}</span>
                                 </td>
                                 <td className="py-4 px-6 w-1/3">
                                    <p className="text-sm font-medium text-[var(--color-text-primary)] line-clamp-2" title={post.topic}>{post.topic}</p>
                                 </td>
                                 <td className="py-4 px-6 text-right whitespace-nowrap">
                                    {hasDraft ? (
                                       <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--color-success)]/10 text-[var(--color-success)] text-[10px] font-black uppercase tracking-widest rounded-full border border-[var(--color-success)]/20"><CheckCircle2 className="w-3 h-3"/> Drafted</span>
                                    ) : (
                                       <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--color-bg-input)] text-[var(--color-text-tertiary)] text-[10px] font-black uppercase tracking-widest rounded-full border border-[var(--color-border-default)]">Pending</span>
                                    )}
                                 </td>
                              </tr>
                           )
                        })}
                 </tbody>
              </table>
           </div>
         )}
      </div>

      {/* Centered Modal For Editing Posts */}
      {selectedPostId && activePost && (
         <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300"
              onClick={() => setSelectedPostId(null)}
            />
            
            {/* Navigation Arrows (Wings) */}
            <div className="absolute inset-x-4 md:inset-x-12 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none z-[220]">
                <button 
                  onClick={(e) => { e.stopPropagation(); navigatePost('prev'); }}
                  className="p-4 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all pointer-events-auto shadow-2xl backdrop-blur-md group"
                >
                   <ChevronLeft className="w-8 h-8 group-hover:-translate-x-1 transition-transform" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); navigatePost('next'); }}
                  className="p-4 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all pointer-events-auto shadow-2xl backdrop-blur-md group"
                >
                   <ChevronRight className="w-8 h-8 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>

            {/* Modal Body */}
            <div className="relative w-full max-w-6xl max-h-[92vh] bg-[var(--color-bg-base)] border border-[var(--color-border-default)] shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-[40px] flex flex-col animate-in zoom-in-95 duration-400 overflow-hidden z-[210]">
               <div className="flex items-center justify-between p-10 border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)]/50">
                  <div>
                     <div className="flex items-center gap-2 mb-3">
                       {activePost.eventContext && (
                         <span className="text-[10px] font-black text-orange-400 bg-orange-400/10 border border-orange-400/20 px-4 py-1.5 rounded-full uppercase tracking-widest">🎯 {activePost.eventContext}</span>
                       )}
                       <span className="text-[10px] font-black text-[var(--color-accent-400)] bg-[var(--color-accent-900)]/40 px-4 py-1.5 rounded-full uppercase tracking-widest">{activePost.date}</span>
                     </div>
                     <h2 className="text-4xl font-display font-bold text-[var(--color-text-primary)] tracking-tight">Content Blueprint</h2>
                     <div className="flex items-center gap-3 mt-3">
                        {(() => {
                           const config = PLATFORM_ICONS[activePost.platform] || PLATFORM_ICONS.default;
                           const Icon = config.icon;
                           return <Icon className={`w-4 h-4 ${config.color}`} />;
                        })()}
                        <span className="text-[11px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest">{activePost.platform}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-border-default)]" />
                        <span className="text-[11px] font-black text-[var(--color-text-tertiary)] uppercase tracking-widest">{activePost.format}</span>
                     </div>
                  </div>
                  <button onClick={() => setSelectedPostId(null)} className="p-4 rounded-2xl bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:bg-[var(--color-error)] hover:text-white transition-all shadow-sm border border-[var(--color-border-default)] group">
                     <X className="w-7 h-7 group-hover:rotate-90 transition-transform duration-300"/>
                  </button>
               </div>
               <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar bg-gradient-to-b from-transparent to-[var(--color-bg-surface)]/20">
               
               {/* ── SECTION 1: Strategic Intent ── */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                  <div className="md:col-span-2 space-y-6">
                     <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-[var(--color-text-tertiary)] uppercase tracking-[0.2em] flex items-center gap-2">
                           <Target className="w-3.5 h-3.5" /> Post Concept & Strategic Hook
                        </label>
                        <button 
                           onClick={handleRerollConcept} 
                           disabled={isRerolling || isIteratingConcept || isGeneratingContent}
                           className="text-[10px] font-bold text-[var(--color-accent-500)] hover:text-[var(--color-accent-400)] uppercase tracking-widest flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                           {isRerolling ? <RefreshCw className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3"/>}
                           Magic Re-Roll
                        </button>
                     </div>
                     
                     <div className="p-8 rounded-[32px] bg-[var(--color-bg-surface)] border-2 border-[var(--color-border-default)] relative shadow-sm group/edit">
                        <p className="text-[11px] font-black text-[var(--color-accent-400)] mb-4 uppercase tracking-[0.1em]">{activePost.pillar}</p>
                        <textarea 
                           value={activePost.topic}
                           onFocus={() => setOriginalTopic(activePost.topic)}
                           onBlur={async () => {
                             if (originalTopic && originalTopic !== activePost.topic && brandInfo) {
                               // Track edit for pattern detection (instant, no AI call)
                               trackAndDetectPattern(
                                 activePost.id, activePost.platform, activePost.format,
                                 'topic', originalTopic, activePost.topic
                               )
                               // Also run the existing AI-based learning extraction (async)
                               try {
                                 const { extractEditLearning } = await import('@/actions/editLearning')
                                 const res = await extractEditLearning(brandInfo, originalTopic, activePost.topic, 'topic')
                                 if (res.success && res.data?.insight) {
                                   addPendingInsight(res.data.insight)
                                   showToast(`Learning detected: ${res.data.explanation}`, 'info')
                                 }
                               } catch {}
                             }
                           }}
                           onChange={(e) => updateCalendarPost(activePost.id, { topic: e.target.value })}
                           className="w-full bg-transparent text-2xl font-bold text-[var(--color-text-primary)] leading-snug resize-none outline-none placeholder:text-[var(--color-text-tertiary)] italic"
                           rows={2}
                           style={{ minHeight: '80px', height: 'auto', overflow: 'auto' }}
                           ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                        />
                        <div className="mt-6 pt-6 border-t border-[var(--color-border-subtle)] relative flex items-center">
                           <input 
                             type="text"
                             value={conceptChatInput}
                             onChange={(e) => setConceptChatInput(e.target.value)}
                             onKeyDown={(e) => { if (e.key === 'Enter') handleConceptChatSubmit() }}
                             placeholder="AI Directive (e.g. 'Make it more punchy for chefs' )"
                             className="w-full bg-[var(--color-bg-input)] rounded-2xl py-3 pl-5 pr-12 text-sm text-[var(--color-text-secondary)] outline-none border border-[var(--color-border-subtle)] focus:border-[var(--color-accent-500)] transition-all"
                           />
                           <button
                             onClick={handleConceptChatSubmit}
                             disabled={isIteratingConcept || !conceptChatInput.trim()}
                             className="absolute right-2 p-2 text-[var(--color-accent-500)] hover:bg-[var(--color-accent-500)] hover:text-white rounded-xl transition-all"
                           >
                             {isIteratingConcept ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                           </button>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-6">
                     <label className="text-xs font-black text-[var(--color-text-tertiary)] uppercase tracking-[0.2em] flex items-center gap-2">
                        <Brain className="w-3.5 h-3.5 text-purple-500" /> Marketer Context
                     </label>
                     <div className="p-6 rounded-3xl bg-purple-500/5 border border-purple-500/10 space-y-5">
                        <div className="space-y-2">
                           <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Psychological Trigger</p>
                           <p className="text-xs font-medium text-[var(--color-text-secondary)] leading-relaxed">
                              {activePost.psychTrigger || <span className="italic opacity-50">Re-generate calendar to unlock per-post triggers</span>}
                           </p>
                        </div>
                        <div className="space-y-2">
                           <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Product Usage Story</p>
                           <p className="text-xs font-medium text-[var(--color-text-secondary)] leading-relaxed">
                              {activePost.usageStory || <span className="italic opacity-50">Re-generate calendar to unlock per-post usage stories</span>}
                           </p>
                        </div>
                     </div>

                     {/* Story-Specific Intelligence */}
                     {activePost.format === 'Story' && (
                        <div className="p-6 rounded-3xl bg-pink-500/5 border border-pink-500/10 space-y-5 animate-in fade-in duration-300">
                           <p className="text-[9px] font-black text-pink-400 uppercase tracking-widest flex items-center gap-2">
                              <Camera className="w-3 h-3" /> Story Blueprint
                           </p>
                           <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                 <p className="text-[8px] font-black text-pink-300 uppercase tracking-widest">Media Type</p>
                                 <div className="flex gap-2">
                                    <button 
                                       onClick={() => updateCalendarPost(activePost.id, { storyMediaType: 'video' })}
                                       className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${activePost.storyMediaType === 'video' ? 'bg-pink-500 text-white border-pink-500 shadow-sm' : 'border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:border-pink-400'}`}
                                    >
                                       <Film className="w-3 h-3 inline mr-1" />Video
                                    </button>
                                    <button 
                                       onClick={() => updateCalendarPost(activePost.id, { storyMediaType: 'static' })}
                                       className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${activePost.storyMediaType === 'static' ? 'bg-pink-500 text-white border-pink-500 shadow-sm' : 'border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:border-pink-400'}`}
                                    >
                                       <ImageIcon className="w-3 h-3 inline mr-1" />Static
                                    </button>
                                 </div>
                              </div>
                              <div className="space-y-1.5">
                                 <p className="text-[8px] font-black text-pink-300 uppercase tracking-widest">IG Feature</p>
                                 <select 
                                    value={activePost.storyFeature || ''}
                                    onChange={(e) => updateCalendarPost(activePost.id, { storyFeature: e.target.value })}
                                    className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] rounded-lg px-2 py-2 outline-none focus:border-pink-400"
                                 >
                                    <option value="">Select Feature</option>
                                    <option value="Poll">Poll</option>
                                    <option value="Quiz">Quiz</option>
                                    <option value="Question Box">Question Box</option>
                                    <option value="Countdown">Countdown</option>
                                    <option value="Emoji Slider">Emoji Slider</option>
                                    <option value="Link Sticker">Link Sticker</option>
                                    <option value="Music">Music</option>
                                    <option value="Mention">@ Mention</option>
                                 </select>
                              </div>
                           </div>
                           <div className="space-y-1.5">
                              <p className="text-[8px] font-black text-pink-300 uppercase tracking-widest">Story Text Overlay</p>
                              <input 
                                 type="text"
                                 value={activePost.storyCopy || ''}
                                 onChange={(e) => updateCalendarPost(activePost.id, { storyCopy: e.target.value })}
                                 placeholder="The text that appears on the story frame..."
                                 className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-xl py-2.5 px-4 text-sm font-bold text-[var(--color-text-primary)] outline-none focus:border-pink-400 transition-all"
                              />
                           </div>
                        </div>
                     )}
                  </div>
               </div>

               {/* ── SECTION 1.5: Visual Reference ── */}
               <div className="p-8 rounded-[32px] bg-cyan-500/3 border border-cyan-500/10">
                 <VisualReferences
                   post={activePost}
                   onFindReferences={handleFindReferences}
                   onResearch={handleResearchReferences}
                   onApproveReference={handleApproveReference}
                   onRemoveReference={handleRemoveReference}
                   onAddCustomReference={handleAddCustomReference}
                   isSearching={isSearchingRefs}
                 />
               </div>

               {/* ── SECTION 2: AI Creative Execution ── */}
               <div className="space-y-8">
                  <div className="flex items-center justify-between border-b border-[var(--color-border-default)] pb-6">
                     <div>
                        <label className="text-sm font-display font-bold text-[var(--color-text-primary)] flex items-center gap-3">
                           <PenTool className="w-5 h-5 text-[var(--color-accent-500)]" /> {(() => { const s = getContentSpec(activePost.platform, activePost.format); return s.displayName + ' Draft'; })()}
                        </label>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                           {getContentSpec(activePost.platform, activePost.format).bestPractices.slice(0, 3).map((tip, i) => (
                              <span key={i} className="text-[10px] font-bold text-[var(--color-text-tertiary)] bg-[var(--color-bg-hover)] px-3 py-1.5 rounded-full border border-[var(--color-border-subtle)]">{tip}</span>
                           ))}
                        </div>
                     </div>
                     {!activeDraft && (
                        <button onClick={() => handleGenerateContent(activePost.id)} disabled={isGeneratingContent} className="h-14 px-10 rounded-full bg-[var(--color-accent-600)] hover:bg-[var(--color-accent-500)] text-white text-sm font-black uppercase tracking-widest flex items-center gap-3 transition-all shadow-xl">
                          {isGeneratingContent ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                          {isGeneratingContent ? "Writing Logic..." : "Generate Post Body"}
                        </button>
                     )}
                     {activeDraft && (
                        <button onClick={() => handleGenerateContent(activePost.id)} disabled={isGeneratingContent} className="h-12 px-8 rounded-full border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-500)] hover:text-[var(--color-accent-400)] text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all">
                          {isGeneratingContent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Regenerate
                        </button>
                     )}
                  </div>

                  {/* A/B Variant Selector */}
                  {activeDraft && Array.isArray(draftHistory[activePost.id]) && draftHistory[activePost.id].length > 0 && (
                     <div className="flex items-center gap-3 p-3 bg-amber-500/5 border border-amber-500/15 rounded-2xl">
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest whitespace-nowrap">Variants</span>
                        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-hide">
                           {draftHistory[activePost.id].map((variant, i) => (
                              <button
                                 key={i}
                                 onClick={() => {
                                    // Swap: current draft goes to end of history, clicked variant becomes active
                                    const currentDraft = contentDrafts[activePost.id]
                                    const newHistory = [...draftHistory[activePost.id]]
                                    newHistory[i] = currentDraft
                                    saveDraft(activePost.id, variant)
                                    // Manually update history in the state
                                    const store = useBrandStore.getState()
                                    if (store.activeBrandId) {
                                       const brand = store.brands[store.activeBrandId]
                                       useBrandStore.setState({
                                          brands: {
                                             ...store.brands,
                                             [store.activeBrandId]: {
                                                ...brand,
                                                draftHistory: { ...brand.draftHistory, [activePost.id]: newHistory }
                                             }
                                          }
                                       })
                                    }
                                    showToast(`Switched to variant ${i + 1}`, 'info')
                                 }}
                                 className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 transition-all whitespace-nowrap"
                              >
                                 V{i + 1}
                              </button>
                           ))}
                           <span className="px-3 py-1.5 rounded-lg text-[10px] font-black text-white bg-amber-500/30 border border-amber-500/30 whitespace-nowrap">
                              Current
                           </span>
                        </div>
                        <span className="text-[8px] text-amber-400/50 font-bold whitespace-nowrap">{(draftHistory[activePost.id]?.length || 0) + 1} total</span>
                     </div>
                  )}

                  {activeDraft ? (
                    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-700">
                       
                       {/* Hook Selection (if hooks are available) */}
                       {Array.isArray(activeDraft.hooks) && activeDraft.hooks.length > 0 && (
                          <div className="space-y-3">
                             <label className="text-xs font-black text-amber-500 uppercase tracking-[0.15em] flex items-center gap-2">
                                <Target className="w-4 h-4" /> Select Your Scroll-Stop Hook
                             </label>
                             <div className="grid grid-cols-1 gap-3">
                                {activeDraft.hooks.map((hook, i) => (
                                   <button
                                      key={i}
                                      onClick={() => {
                                         saveDraft(activePost.id, { ...activeDraft, approvedHookIndex: i })
                                         showToast(`Hook ${i + 1} locked`, 'success')
                                      }}
                                      className={`p-4 rounded-2xl border-2 text-left text-sm font-bold transition-all ${
                                         activeDraft.approvedHookIndex === i
                                           ? 'border-amber-500 bg-amber-500/10 text-[var(--color-text-primary)] shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                                           : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-amber-500/40 hover:bg-amber-500/5'
                                      }`}
                                   >
                                      <div className="flex items-center gap-3">
                                         <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${
                                            activeDraft.approvedHookIndex === i ? 'bg-amber-500 text-white' : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'
                                         }`}>{i + 1}</span>
                                         <span className="flex-1">{(hook || '').replace(/\u2014/g, ' - ').replace(/--/g, ' - ')}</span>
                                         {activeDraft.approvedHookIndex === i && <CheckCircle2 className="w-5 h-5 text-amber-500 flex-shrink-0" />}
                                      </div>
                                   </button>
                                ))}
                             </div>
                          </div>
                       )}

                       {/* Two-Column Split: On-Image Copy vs Caption */}
                       {(() => {
                          const spec = getContentSpec(activePost.platform, activePost.format)
                          const isVisualFormat = ['Static', 'Carousel', 'Story'].includes(activePost.format)
                          const onImageKeys = ['creativeHeadline', 'creativeBody', 'coverSlide', 'slideBreakdown', 'closingSlide', 'storyCopy', 'hookScript', 'bodyScript', 'ctaScript', 'onScreenText']
                          const captionKeys = ['caption', 'hashtags']
                          const metaKeys = ['visualDirective', 'musicDirection', 'storyMediaType', 'storyFeature', 'featureConfig']
                          
                          const onImageFields = spec.draftFields.filter(f => onImageKeys.includes(f.key))
                          const captionFields = spec.draftFields.filter(f => captionKeys.includes(f.key))
                          const otherFields = spec.draftFields.filter(f => !onImageKeys.includes(f.key) && !captionKeys.includes(f.key) && !metaKeys.includes(f.key))
                          const directionFields = spec.draftFields.filter(f => metaKeys.includes(f.key))
                          
                          const stripEmDash = (text: any): any => {
                             if (typeof text === 'string') return text.replace(/\u2014/g, ' - ').replace(/---/g, ' - ').replace(/--/g, ' - ')
                             if (Array.isArray(text)) return text.map(stripEmDash)
                             return text
                          }
                          
                          return (
                             <>
                                {isVisualFormat && onImageFields.length > 0 ? (
                                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                      <div className="space-y-4">
                                         <div className="flex items-center gap-2 pb-3 border-b border-amber-500/20">
                                            <ImageIcon className="w-4 h-4 text-amber-400" />
                                            <label className="text-xs font-black text-amber-400 uppercase tracking-[0.15em]">On-Image Copy</label>
                                            <span className="text-[9px] text-amber-400/60 font-bold ml-auto">Text rendered on the visual</span>
                                         </div>
                                         {onImageFields.map(field => {
                                            const value = activeDraft.platformFields?.[field.key] || (activeDraft as any)[field.key] || ''
                                            if (!value) return null
                                            return (
                                               <div key={field.key} className="space-y-2">
                                                  <label className="text-[10px] font-black uppercase tracking-widest text-amber-400/80">{field.label}</label>
                                                  <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-sm font-bold text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
                                                     {stripEmDash(value)}
                                                  </div>
                                               </div>
                                            )
                                         })}
                                      </div>
                                      <div className="space-y-4">
                                         <div className="flex items-center gap-2 pb-3 border-b border-emerald-500/20">
                                            <PenTool className="w-4 h-4 text-emerald-400" />
                                            <label className="text-xs font-black text-emerald-400 uppercase tracking-[0.15em]">Caption & Copy</label>
                                            <span className="text-[9px] text-emerald-400/60 font-bold ml-auto">Text below the post</span>
                                         </div>
                                         {captionFields.map(field => {
                                            const value = activeDraft.platformFields?.[field.key] || (activeDraft as any)[field.key] || ''
                                            if (!value) return null
                                            return (
                                               <div key={field.key} className="space-y-2">
                                                  <label className="text-[10px] font-black uppercase tracking-widest text-emerald-400/80">{field.label}</label>
                                                  <div className={`p-5 rounded-2xl border text-sm font-medium leading-relaxed whitespace-pre-wrap ${
                                                     field.key === 'caption' 
                                                       ? 'bg-[var(--color-bg-input)] border-[var(--color-border-default)] text-[var(--color-text-primary)] shadow-inner min-h-[140px]'
                                                       : 'bg-[var(--color-bg-surface)] border-[var(--color-border-subtle)] text-[var(--color-accent-400)] font-bold'
                                                  }`}>
                                                     {stripEmDash(value)}
                                                  </div>
                                               </div>
                                            )
                                         })}
                                      </div>
                                   </div>
                                ) : (
                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      {spec.draftFields.map((field) => {
                                         const value = activeDraft.platformFields?.[field.key] || (activeDraft as any)[field.key] || ''
                                         if (!value) return null
                                         const isLongField = field.type === 'textarea' || (typeof value === 'string' && value.length > 100)
                                         return (
                                            <div key={field.key} className={`space-y-2 ${isLongField ? 'md:col-span-2' : ''}`}>
                                               <label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ color: field.required ? 'var(--color-accent-400)' : 'var(--color-text-tertiary)' }}>
                                                  {field.label} {field.required && <span className="text-[var(--color-accent-500)]">*</span>}
                                               </label>
                                               <div className={`p-5 rounded-2xl border text-sm font-medium leading-relaxed whitespace-pre-wrap ${
                                                  field.key.includes('hook') || field.key.includes('Hook') 
                                                    ? 'bg-amber-500/5 border-amber-500/20 text-[var(--color-text-primary)] font-bold' 
                                                    : field.key.includes('caption') || field.key.includes('body') || field.key.includes('tweet') || field.key.includes('narrative')
                                                    ? 'bg-[var(--color-bg-input)] border-[var(--color-border-default)] text-[var(--color-text-primary)] shadow-inner min-h-[120px]'
                                                    : 'bg-[var(--color-bg-surface)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]'
                                               }`}>
                                                  {stripEmDash(value)}
                                               </div>
                                            </div>
                                         )
                                      })}
                                   </div>
                                )}

                                {directionFields.length > 0 && directionFields.some(f => activeDraft.platformFields?.[f.key]) && (
                                   <div className="space-y-3 mt-6">
                                      <label className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Art Direction</label>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                         {directionFields.map(field => {
                                            const value = activeDraft.platformFields?.[field.key] || ''
                                            if (!value) return null
                                            return (
                                               <div key={field.key} className="p-4 rounded-xl bg-[var(--color-accent-900)]/5 border-l-4 border-l-[var(--color-accent-500)] border border-[var(--color-border-subtle)] rounded-l-none">
                                                  <p className="text-[9px] font-black text-[var(--color-accent-400)] uppercase tracking-widest mb-1">{field.label}</p>
                                                  <p className="text-xs text-[var(--color-text-secondary)] italic leading-relaxed whitespace-pre-wrap">{stripEmDash(value)}</p>
                                               </div>
                                            )
                                         })}
                                      </div>
                                   </div>
                                )}
                             </>
                          )
                       })()}

                       {/* Legacy hooks fallback */}
                       {(!activeDraft.platformFields || Object.keys(activeDraft.platformFields).length === 0) && Array.isArray(activeDraft.hooks) && activeDraft.hooks.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div className="space-y-4">
                                <label className="text-xs font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                                   <Sparkles className="w-3 h-3" /> Scroll-Stopping Hooks
                                </label>
                                <div className="space-y-3">
                                   {activeDraft.hooks.map((h, i) => (
                                      <div key={i} className="p-5 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-2xl text-sm font-bold text-[var(--color-text-primary)]">{h}</div>
                                   ))}
                                </div>
                             </div>
                             <div className="space-y-4">
                                <label className="text-xs font-black text-emerald-500 uppercase tracking-widest">Optimized Caption & Copy</label>
                                <div className="p-6 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-[32px] text-[15px] font-medium text-[var(--color-text-primary)] whitespace-pre-wrap leading-loose shadow-inner min-h-[300px]">
                                   {activeDraft.caption}
                                   <div className="mt-6 pt-4 border-t border-[var(--color-border-subtle)] text-[var(--color-accent-400)] font-bold text-sm">{activeDraft.hashtags}</div>
                                </div>
                             </div>
                          </div>
                       )}
                       
                       {/* Per-Post References */}
                       <div className="space-y-4 pt-6 border-t border-[var(--color-border-default)]">
                          <div>
                             <label className="text-xs font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                                <Camera className="w-4 h-4" /> Post References
                             </label>
                             <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Add reference images for this specific post only. Categorize each so AI knows how to use it. These won't affect other posts.</p>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                             {(['product', 'scene', 'general'] as const).map(cat => {
                                const labels = { product: 'Product / Character', scene: 'Scene / Aesthetic', general: 'General' }
                                const colors = { product: 'pink', scene: 'purple', general: 'blue' }
                                const safeRefs = Array.isArray(activeDraft.postReferences) ? activeDraft.postReferences : []
                                const postRefs = safeRefs.filter(r => r.category === cat || (cat === 'scene' && r.category === 'aesthetic'))
                                return (
                                   <div key={cat} className={`rounded-xl border border-[var(--color-border-default)] p-3 bg-[var(--color-bg-surface)] space-y-2`}>
                                      <span className={`text-[9px] font-black uppercase tracking-widest text-${colors[cat]}-400`}>{labels[cat]}</span>
                                      <div className="flex flex-wrap gap-1.5">
                                         {postRefs.map(ref => (
                                            <div key={ref.id} className="relative w-12 h-12 rounded-lg overflow-hidden border border-[var(--color-border-default)] group">
                                               <img src={ref.url} className="w-full h-full object-cover" alt={ref.name} />
                                               <button onClick={() => {
                                                  const safeRefsForDelete = Array.isArray(activeDraft.postReferences) ? activeDraft.postReferences : []
                                                  const updated = safeRefsForDelete.filter(r => r.id !== ref.id)
                                                  saveDraft(selectedPostId!, { ...activeDraft, postReferences: updated })
                                               }} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                  <X className="w-3 h-3 text-white" />
                                               </button>
                                            </div>
                                         ))}
                                         <label className="w-12 h-12 rounded-lg border-2 border-dashed border-[var(--color-border-default)] hover:border-amber-500 flex items-center justify-center cursor-pointer text-[var(--color-text-muted)] hover:text-amber-400 transition-all">
                                            <Plus className="w-4 h-4" />
                                            <input type="file" className="hidden" multiple accept="image/png,image/jpeg,image/webp" onChange={async (e) => {
                                               const files = e.target.files; if (!files) return
                                               const newRefs: import('@/stores/brand').PostReference[] = []
                                               for (let i = 0; i < files.length; i++) {
                                                  const file = files[i]; if (!file.type.startsWith('image/')) continue
                                                  const url = await new Promise<string>((r) => { const rd = new FileReader(); rd.onload = () => r(rd.result as string); rd.readAsDataURL(file) })
                                                  newRefs.push({ id: `pr-${Date.now()}-${i}`, category: cat === 'scene' ? 'scene' : cat, url, name: file.name })
                                               }
                                               const existing = activeDraft.postReferences || []
                                               saveDraft(selectedPostId!, { ...activeDraft, postReferences: [...existing, ...newRefs] })
                                               e.target.value = ''
                                            }} />
                                         </label>
                                      </div>
                                   </div>
                                )
                             })}
                          </div>
                       </div>

                       {/* Visual Generation Section */}
                       <div className="space-y-6 pt-6 border-t border-[var(--color-border-default)]">
                          <div className="flex items-center justify-between gap-4">
                             <div>
                                <label className="text-sm font-display font-bold text-[var(--color-text-primary)] flex items-center gap-3">
                                   <ImageIcon className="w-5 h-5 text-pink-500" /> Visual Generation
                                </label>
                                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                                   {activePost.format === 'Carousel' ? 'Generate carousel slide visuals' : activePost.format === 'Story' ? 'Generate story frame' : 'Generate post visual'}
                                </p>
                             </div>
                             <div className="flex items-center gap-3">
                                <select
                                   value={imageModel}
                                   onChange={(e) => setImageModel(e.target.value as ImageModel)}
                                   className="h-12 px-4 rounded-xl bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider outline-none focus:border-pink-500 transition-colors"
                                >
                                   <option value="nano-banana-pro">Nano Banana Pro</option>
                                   <option value="nano-banana-2">Nano Banana 2</option>
                                   <option value="gpt-image-1.5">GPT Image 1.5</option>
                                   <option value="gpt-image-mini">GPT Image Mini</option>
                                </select>
                                <button 
                                   onClick={handleGenerateVisual}
                                   disabled={isGeneratingVisual}
                                   className="h-14 px-10 rounded-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-sm font-black uppercase tracking-widest flex items-center gap-3 transition-all shadow-xl disabled:opacity-50 whitespace-nowrap"
                                >
                                   {isGeneratingVisual ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                                   {isGeneratingVisual ? visualGenProgress : 'Generate Visual'}
                                </button>
                             </div>
                          </div>

                          {Array.isArray(activeDraft.generatedVisuals) && activeDraft.generatedVisuals.length > 0 && (
                             <div className="space-y-4">
                                <div className={`grid gap-4 ${activeDraft.generatedVisuals.length === 1 ? 'grid-cols-1 max-w-lg mx-auto' : 'grid-cols-2 lg:grid-cols-3'}`}>
                                   {activeDraft.generatedVisuals.map((imgUrl, i) => (
                                      <div key={i} className="relative group rounded-2xl overflow-hidden border-2 border-[var(--color-border-default)] shadow-xl">
                                         <img src={imgUrl} alt={`Generated visual ${i + 1}`} className="w-full h-auto object-cover" />
                                         <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                            <a href={imgUrl} download={`${brandInfo?.name || 'post'}_${activePost.format}_${i + 1}.png`} className="p-3 rounded-xl bg-white/20 text-white hover:bg-white/30 transition-colors backdrop-blur-sm">
                                               <Download className="w-5 h-5" />
                                            </a>
                                         </div>
                                         {activeDraft.generatedVisuals!.length > 1 && (
                                            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-white text-[10px] font-black uppercase tracking-wider">
                                               Slide {i + 1}
                                            </div>
                                         )}
                                      </div>
                                   ))}
                                </div>
                                <button onClick={handleGenerateVisual} disabled={isGeneratingVisual} className="w-full py-3 border-2 border-dashed border-[var(--color-border-default)] hover:border-pink-500 rounded-2xl text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] hover:text-pink-400 transition-all flex items-center justify-center gap-2">
                                   <RefreshCw className="w-4 h-4" /> Regenerate Visuals
                                </button>
                             </div>
                          )}
                       </div>

                       {/* Copy + Refine Bar */}
                       <div className="flex gap-4 pt-6 border-t border-[var(--color-border-subtle)]">
                          <button onClick={() => {
                             const allText = activeDraft.platformFields 
                                ? Object.entries(activeDraft.platformFields).map(([k, v]) => `${k.toUpperCase()}:\n${v}`).join('\n\n')
                                : `${activeDraft.caption}\n\n${activeDraft.hashtags}`
                             navigator.clipboard.writeText(allText)
                             showToast('Full draft copied to clipboard')
                          }} className="flex-1 h-16 rounded-2xl bg-[var(--color-accent-600)] text-white font-black uppercase text-sm tracking-[0.2em] transition-all hover:bg-[var(--color-accent-500)] shadow-xl active:scale-95">
                             Copy Full Draft
                          </button>
                       </div>
                       
                       {/* Copilot Chat Input */}
                       <div className="relative">
                          <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleChatSubmit() }} placeholder="Refine this draft (e.g. 'Make it more emotional')" className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-2xl py-4 pl-6 pr-14 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-500)]" />
                          <button onClick={handleChatSubmit} disabled={isChatting} className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-[var(--color-accent-600)] hover:bg-[var(--color-accent-500)] rounded-xl text-white transition-all shadow-lg">
                             {isChatting ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4" />}
                          </button>
                       </div>
                    </div>
                  ) : (
                    <div className="py-24 border-2 border-dashed border-[var(--color-border-default)] rounded-[40px] flex flex-col items-center justify-center text-center bg-[var(--color-bg-hover)]/20">
                       <div className="w-20 h-20 rounded-full bg-[var(--color-accent-900)]/20 flex items-center justify-center mb-6 border border-[var(--color-accent-500)]/20">
                          <ImageIcon className="w-8 h-8 text-[var(--color-accent-400)]" />
                       </div>
                       <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">No Creative Draft Yet</h3>
                       <p className="text-sm text-[var(--color-text-tertiary)] max-w-sm mb-8">Click "Generate Post Body" above to let the AI architect your creative execution for this concept.</p>
                    </div>
                  )}
               </div>
            </div>
         </div>
      </div>
      )} 
    </div>
  )
}
