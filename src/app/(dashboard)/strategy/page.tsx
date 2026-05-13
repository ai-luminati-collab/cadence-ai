'use client'

import {
  Target, MessageSquare, Zap, CheckCircle2, RefreshCw, Swords, Brain, History,
  ChevronDown, ChevronUp, Sparkles, BarChart3, Shield, Palette, Type, PenTool, Globe,
  Infinity, Briefcase, Music, Play, Camera, Search, Activity, Users, MessageCircle, X, Check, Download,
  Paperclip, ImagePlus, FolderOpen, Edit3, Upload, Trash2, FileText, Image as ImageIcon, Plus
} from 'lucide-react'
import { useBrandStore, type BrandAsset } from '@/stores/brand'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState, useRef } from 'react'
import { sanitizeErrorForUI } from '@/lib/error-sanitizer'
import { useBrandOSSignals } from '@/hooks/useBrandOSSignals'
import { BrandOSEvolution } from '@/components/BrandOSEvolution'
import { parseStreamedResponse } from '@/lib/streaming-fetch'

const PLATFORM_ICONS: Record<string, { icon: any, color: string }> = {
  "Meta (Instagram & Facebook)": { icon: Infinity, color: "text-blue-400" },
  "LinkedIn": { icon: Briefcase, color: "text-[#0077B5]" },
  "X (Twitter)": { icon: MessageSquare, color: "text-[#E1E1E1]" },
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

/* ── Tactical DNA Card (Expandable + Editable) ── */
function TacticalCard({ title, iconBg, icon, value, fieldKey, isArray, extraContent, onSave }: {
  title: string
  iconBg: string
  icon: React.ReactNode
  value: string
  fieldKey: string
  isArray?: boolean
  extraContent?: React.ReactNode
  onSave: (val: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)

  return (
    <div className={`bg-[var(--color-bg-base)] border rounded-2xl overflow-hidden transition-all ${isOpen ? 'border-[var(--color-accent-400)] shadow-md' : 'border-[var(--color-border-default)] hover:shadow-md'}`}>
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); setIsEditing(false); setEditValue(value) }}
        className="w-full p-5 text-left cursor-pointer group"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>{icon}</div>
          <span className="text-xs font-black text-[var(--color-text-muted)] uppercase tracking-widest flex-1">{title}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />}
        </div>
        <p className={`text-sm font-bold text-[var(--color-text-primary)] ${isOpen ? '' : 'line-clamp-2'}`}>{value}</p>
        {!isOpen && extraContent}
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-0 animate-in fade-in duration-200 space-y-3">
          {extraContent}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-xl p-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-500)] min-h-[80px] resize-none"
                placeholder={isArray ? "Comma-separated values" : "Enter value"}
              />
              <div className="flex gap-2">
                <button onClick={() => { onSave(editValue); setIsEditing(false) }} className="px-4 py-2 bg-emerald-500 text-white text-xs font-black rounded-lg hover:bg-emerald-400 transition-colors flex items-center gap-1.5">
                  <Check className="w-3 h-3" /> Save
                </button>
                <button onClick={() => { setIsEditing(false); setEditValue(value) }} className="px-4 py-2 bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] text-xs font-bold rounded-lg hover:bg-[var(--color-border-default)] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 text-xs font-bold text-[var(--color-accent-400)] hover:text-[var(--color-accent-300)] transition-colors">
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Media Upload Section ── */
function MediaUploadSection({ title, subtitle, icon, iconColor, assets, acceptTypes, onUpload, onRemove, linkedProducts }: {
  title: string
  subtitle: string
  icon: React.ReactNode
  iconColor: string
  assets: BrandAsset[]
  acceptTypes: string
  onUpload: (files: FileList) => void
  onRemove: (id: string) => void
  linkedProducts?: string[]
}) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) onUpload(e.dataTransfer.files)
  }

  const getFileIcon = (type: string) => {
    if (type === 'image' || type === 'webp') return <ImageIcon className="w-5 h-5 text-pink-400" />
    if (type === 'pdf') return <FileText className="w-5 h-5 text-red-400" />
    if (type === 'ppt') return <FileText className="w-5 h-5 text-orange-400" />
    return <FileText className="w-5 h-5 text-blue-400" />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg ${iconColor} flex items-center justify-center`}>{icon}</div>
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{title}</h3>
          <p className="text-[10px] text-[var(--color-text-tertiary)]">{subtitle}</p>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
          isDragging ? 'border-[var(--color-accent-400)] bg-[var(--color-accent-900)]/10' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-hover)]'
        }`}
      >
        <Upload className="w-6 h-6 text-[var(--color-text-muted)] mx-auto mb-2" />
        <p className="text-xs font-bold text-[var(--color-text-secondary)]">Drop files here or click to upload</p>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{acceptTypes.replace(/\./g, '').toUpperCase()}</p>
        <input ref={inputRef} type="file" multiple accept={acceptTypes} className="hidden" onChange={(e) => { if (e.target.files) onUpload(e.target.files) }} />
      </div>

      {/* Asset Grid */}
      {assets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {assets.map((asset) => (
            <div key={asset.id} className="relative group rounded-xl overflow-hidden border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
              {asset.type === 'image' || asset.type === 'webp' ? (
                <img src={asset.url} alt={asset.name} className="w-full h-28 object-cover" />
              ) : (
                <div className="w-full h-28 flex flex-col items-center justify-center gap-2 bg-[var(--color-bg-hover)]">
                  {getFileIcon(asset.type)}
                  <span className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase">{asset.type}</span>
                </div>
              )}
              <div className="p-2">
                <p className="text-[10px] font-bold text-[var(--color-text-primary)] truncate">{asset.name}</p>
                {asset.linkedProductName && (
                  <p className="text-[9px] text-[var(--color-accent-400)] font-bold mt-0.5">{asset.linkedProductName}</p>
                )}
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); onRemove(asset.id) }}
                className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Collapsible Card Component ── */
function StrategyCard({ title, icon: Icon, iconColor, content, accentBorder, defaultOpen = false }: {
  title: string, icon: any, iconColor: string, content: string, accentBorder?: string, defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  
  const safeContent = Array.isArray(content) ? content.join('\n') : (content || '')
  const points = safeContent
    .split(/\n+/)
    .flatMap(line => {
      const trimmed = line.trim()
      if (!trimmed) return []
      // If line is already a distinct point (starts with bullet, dash, number, or uppercase after split), keep it
      if (/^[-•*]\s/.test(trimmed)) return [trimmed.replace(/^[-•*]\s+/, '')]
      if (/^\d+[.)]\s/.test(trimmed)) return [trimmed.replace(/^\d+[.)]\s+/, '')]
      // Only split on period if followed by uppercase letter (real sentence boundary, not mid-thought)
      return trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15)
    })
    .map(s => {
      let clean = s.trim().replace(/[,;]+$/, '').trim()
      if (clean && /^[a-z]/.test(clean)) clean = clean.charAt(0).toUpperCase() + clean.slice(1)
      if (clean && !/[.!?]$/.test(clean)) clean += '.'
      return clean
    })
    .filter(s => s.length > 15)

  const previewPoints = points.slice(0, 3)
  const hasMore = points.length > 3

  return (
    <div className={`bg-[var(--color-bg-base)] border rounded-2xl overflow-hidden transition-all hover:shadow-md cursor-pointer ${accentBorder || 'border-[var(--color-border-default)]'}`}>
      <button 
        type="button" 
        onClick={() => setIsOpen(!isOpen)} 
        className="w-full p-5 text-left flex items-start gap-4 group cursor-pointer"
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{title}</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[var(--color-text-muted)]">{points.length} pts</span>
              {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-[var(--color-text-muted)] group-hover:text-[var(--color-accent-500)] transition-colors" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-muted)] group-hover:text-[var(--color-accent-500)] transition-colors" />}
            </div>
          </div>
          
          {!isOpen && (
            <ul className="space-y-1">
              {previewPoints.map((point, i) => (
                <li key={i} className="text-xs text-[var(--color-text-secondary)] leading-snug flex items-start gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-[var(--color-border-hover)] flex-shrink-0 mt-1.5" />
                  <span className="line-clamp-1">{point}</span>
                </li>
              ))}
              {hasMore && <li className="text-[10px] font-bold text-[var(--color-accent-500)] pl-2.5">+ {points.length - 3} more</li>}
            </ul>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-0 pl-[68px] animate-in fade-in duration-200">
          <ul className="space-y-2">
            {points.map((point, i) => (
              <li key={i} className="text-sm text-[var(--color-text-secondary)] leading-relaxed flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-400)] flex-shrink-0 mt-1.5" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function StrategyPage() {
  const router = useRouter()
  const { brands, activeBrandId, setStrategy, setBrandInfo, addPendingInsight, setToneFingerprint, setLastKbAudit, mergeSocialStrategy } = useBrandStore()
  const signals = useBrandOSSignals() // Brand OS Evolution Engine
  const [mounted, setMounted] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAnalyzingRefs, setIsAnalyzingRefs] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null)
  const [isGeneratingSocial, setIsGeneratingSocial] = useState(false)
  const [socialError, setSocialError] = useState<string | null>(null)

  const activeBrand = activeBrandId ? brands[activeBrandId] : null
  const strategy = activeBrand?.strategy
  const brandInfo = activeBrand?.brandInfo

  useEffect(() => { setMounted(true) }, [])

  const handleRefresh = async () => {
    if (!activeBrand || !brandInfo) return
    setIsRefreshing(true)
    setError(null)
    const MAX_RETRIES = 2
    let lastErr: string | null = null

    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = 3000 * Math.pow(2, attempt - 1) + Math.random() * 1000
          await new Promise(r => setTimeout(r, delay))
        }

        let res: Response
        try {
          res = await fetch('/api/generate-marketing-strategy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandInfo, isRefresh: true }),
          })
        } catch {
          lastErr = 'Network error. Please check your connection and try again.'
          continue
        }

        if (res.status === 504 || res.status === 502 || res.status === 503) {
          lastErr = attempt < MAX_RETRIES
            ? 'AI is taking longer than expected. Retrying...'
            : 'Strategy refresh timed out. Please try again in a moment.'
          if (attempt < MAX_RETRIES) continue
          break
        }

        if (!res.ok) {
          let errorMsg = `Server error (${res.status}).`
          try { const eb = await res.json(); errorMsg = eb?.error || errorMsg } catch {}
          if (res.status === 500 && attempt < MAX_RETRIES) { lastErr = errorMsg; continue }
          lastErr = errorMsg
          break
        }

        let result
        try { result = await parseStreamedResponse(res) } catch (e: any) {
          lastErr = e?.message || 'Received an invalid response. Please try again.'
          break
        }

        if (result.success && result.data) {
          setStrategy(result.data)
          return
        } else {
          lastErr = result.error || 'Failed to refresh strategy'
          break
        }
      }
      setError(sanitizeErrorForUI(lastErr || 'Failed to refresh strategy'))
    } catch (err: any) {
      setError(sanitizeErrorForUI(err?.message || "An unexpected error occurred"))
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const { exportToPDF } = await import('@/lib/exportPdf')
      await exportToPDF('strategy-export-node', `${brandInfo?.name || 'Brand'}_OS.pdf`)
    } catch (err: any) {
      console.error('Export failed:', err)
      setError('PDF export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleMediaUpload = async (files: FileList, field: 'brandReferences' | 'productImages' | 'brandLogos' | 'fontSpecimenImages') => {
    if (!brandInfo) return
    const newAssets: import('@/stores/brand').BrandAsset[] = []
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)
      
      // Convert to base64 for local storage
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })

      const assetType = isImage ? (ext === 'webp' ? 'webp' : 'image') 
        : ext === 'pdf' ? 'pdf' 
        : ['ppt', 'pptx'].includes(ext) ? 'ppt' 
        : ['doc', 'docx'].includes(ext) ? 'doc' 
        : 'other'
      
      newAssets.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        type: assetType as any,
        url,
        size: file.size,
        addedAt: new Date().toISOString(),
      })
    }
    
    const existing = brandInfo[field] || []
    setBrandInfo({ ...brandInfo, [field]: [...existing, ...newAssets] })
  }

  const handleMediaRemove = (assetId: string, field: 'brandReferences' | 'productImages' | 'brandLogos' | 'fontSpecimenImages') => {
    if (!brandInfo) return
    const existing = brandInfo[field] || []
    setBrandInfo({ ...brandInfo, [field]: existing.filter(a => a.id !== assetId) })
  }

  const handleUnlockSocialStrategy = async () => {
    if (!activeBrand || !brandInfo || !strategy) return
    setIsGeneratingSocial(true)
    setSocialError(null)

    try {
      // Strip base64 from brandInfo before sending
      const lightBrandInfo = {
        ...brandInfo,
        brandReferences: brandInfo.brandReferences?.map(r => ({ ...r, url: '' })),
        brandAssets: [],
      }

      const marketingContext = {
        oneLineStrategy: strategy.oneLineStrategy,
        targetAudience: strategy.targetAudience,
        persona: strategy.persona,
        coreNarratives: strategy.coreNarratives,
        competitorAnalysis: strategy.competitorAnalysis,
        psychographicTriggers: strategy.psychographicTriggers,
        strategicPatterns: strategy.strategicPatterns,
      }

      const MAX_RETRIES = 2
      let lastErr: string | null = null

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = 3000 * Math.pow(2, attempt - 1) + Math.random() * 1000
          await new Promise(r => setTimeout(r, delay))
        }

        let res: Response
        try {
          res = await fetch('/api/generate-social-strategy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandInfo: lightBrandInfo, marketingStrategy: marketingContext }),
          })
        } catch {
          lastErr = 'Network error. Please check your connection.'
          continue
        }

        if (res.status === 504 || res.status === 502 || res.status === 503) {
          lastErr = attempt < MAX_RETRIES ? 'AI is taking longer than expected. Retrying...' : 'Timed out. Please try again.'
          if (attempt < MAX_RETRIES) continue
          break
        }

        if (!res.ok) {
          let errorMsg = `Server error (${res.status}).`
          try { errorMsg = (await res.json())?.error || errorMsg } catch {}
          if (res.status === 500 && attempt < MAX_RETRIES) { lastErr = errorMsg; continue }
          lastErr = errorMsg
          break
        }

        let result: any
        try { result = await parseStreamedResponse(res) } catch (e: any) {
          lastErr = e?.message || 'Invalid response. Please try again.'
          break
        }

        if (result.success && result.data) {
          mergeSocialStrategy(result.data)
          setSocialError(null)
          return
        } else {
          lastErr = result.error || 'Failed to generate social strategy'
          if (attempt < MAX_RETRIES && /unavailable|busy|timed out/i.test(lastErr || '')) continue
          break
        }
      }

      setSocialError(sanitizeErrorForUI(lastErr || 'Failed to generate social strategy'))
    } catch (err: any) {
      setSocialError(sanitizeErrorForUI(err?.message || 'An unexpected error occurred'))
    } finally {
      setIsGeneratingSocial(false)
    }
  }

  const socialStrategyGenerated = activeBrand?.socialStrategyGenerated || false

  if (!mounted) return null
  if (!activeBrand || !brandInfo) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center">
        <div className="w-16 h-16 bg-[var(--color-bg-elevated)] rounded-full flex items-center justify-center mx-auto mb-4">
          <History className="w-8 h-8 text-[var(--color-text-muted)]" />
        </div>
        <h1 className="text-2xl font-black text-[var(--color-text-primary)] mb-2">No Active Brand</h1>
        <p className="text-[var(--color-text-secondary)] mb-8">Select a brand from the sidebar or create a new one to see its strategy.</p>
        <button onClick={() => router.push('/onboarding')} className="px-6 py-3 bg-[var(--color-accent-600)] text-white rounded-xl font-bold hover:bg-[var(--color-accent-500)] transition-all shadow-md">
          Create New Brand
        </button>
      </div>
    )
  }

  if (!strategy) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center bg-[var(--color-bg-base)] border-2 border-dashed border-[var(--color-border-default)] rounded-3xl">
        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Brain className="w-8 h-8 text-blue-500 animate-pulse" />
        </div>
        <h1 className="text-2xl font-black text-[var(--color-text-primary)] mb-2">Strategy Not Generated</h1>
        <p className="text-[var(--color-text-secondary)] mb-8 max-w-md mx-auto">We need to run our AI engine to build your Brand OS. This takes about 30-45 seconds.</p>
        <button onClick={handleRefresh} disabled={isRefreshing} className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 transition-all flex items-center mx-auto disabled:opacity-50">
          {isRefreshing ? <><RefreshCw className="w-5 h-5 mr-3 animate-spin" /> Analyzing...</> : <><Sparkles className="w-5 h-5 mr-3" /> Generate Brand OS</>}
        </button>
      </div>
    )
  }

  return (
    <div id="strategy-export-node" className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded">Active Strategy</span>
            {strategy.lastRefreshed && (
              <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">Updated {new Date(strategy.lastRefreshed).toLocaleDateString()}</span>
            )}
          </div>
          <h1 className="text-4xl font-black text-[var(--color-text-primary)] tracking-tight">{brandInfo.name} <span className="text-blue-500">Brand OS</span></h1>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExport} 
            disabled={isExporting}
            className="h-12 px-6 bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-xl text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-hover)] transition-all flex items-center justify-center shadow-sm disabled:opacity-50"
          >
            {isExporting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export Pitch
          </button>
          <button 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            className="h-12 px-6 bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-xl text-sm font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-hover)] transition-all flex items-center justify-center shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Regenerating...' : 'Resync Strategy'}
          </button>
        </div>
      </div>

      {/* ═══ SECTION 1: Strategic North Star ═══ */}
      <div className="bg-[var(--color-accent-700)] rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[80px] -mr-32 -mt-32 rounded-full" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 blur-[60px] -ml-24 -mb-24 rounded-full" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
            <span className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">Core Strategy Statement</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black leading-tight max-w-4xl italic">
            "{strategy.oneLineStrategy || 'Strategy generating...'}"
          </h2>
        </div>
      </div>

      {/* ═══ SECTION 1.5: Strategic Pattern Intelligence ═══ */}
      {strategy.strategicPatterns && strategy.strategicPatterns.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-black text-emerald-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4" /> Pattern Intelligence Array
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {strategy.strategicPatterns.map((pattern, idx) => (
              <div key={idx} className="bg-[var(--color-bg-base)] border border-[var(--color-border-default)] hover:border-emerald-500/50 rounded-3xl p-6 transition-all shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center font-black text-lg">
                    {idx + 1}
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] bg-[var(--color-bg-hover)] px-2 py-1 rounded-md">
                    {pattern.family}
                  </span>
                </div>
                <h3 className="text-lg font-black text-[var(--color-text-primary)] leading-tight mb-2">{pattern.id}: {pattern.name}</h3>
                <p className="text-xs font-bold text-[var(--color-text-secondary)] italic mb-4">"{pattern.description}"</p>
                
                <div className="space-y-2 mt-auto">
                  <p className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Execution Markers:</p>
                  <ul className="space-y-2">
                    {pattern.executionMarkers?.map((marker, mIdx) => (
                      <li key={mIdx} className="flex items-start gap-2 text-[11px] text-[var(--color-text-primary)] font-medium leading-snug">
                        <span className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                        <span>{marker}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SECTION 2: AI Evolution Hub (The Buffer) ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-purple-600" />
            <h2 className="text-xs font-black text-[var(--color-text-muted)] uppercase tracking-widest">Training Buffer (Pending AI Insights)</h2>
          </div>
          <div className="bg-gradient-to-br from-indigo-50/50 to-purple-50/50 border border-indigo-100 rounded-3xl p-6 min-h-[160px]">
            {brandInfo.pendingInsights && brandInfo.pendingInsights.length > 0 ? (
               <div className="space-y-3">
                  {brandInfo.pendingInsights.map((insight, idx) => (
                    <div key={idx} className="bg-[var(--color-bg-base)] p-4 rounded-xl shadow-sm border border-[var(--color-border-default)] flex items-start gap-4 group animate-in slide-in-from-left-2 transition-all hover:scale-[1.01]">
                       <div className="flex-1">
                          <p className="text-[11px] font-bold text-[var(--color-text-primary)] leading-relaxed italic">"{insight}"</p>
                       </div>
                       <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => useBrandStore.getState().approveInsight(idx)}
                            className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-400 transition-colors shadow-sm"
                            title="Approve & Train AI"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => useBrandStore.getState().rejectInsight(idx)}
                            className="p-2 bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-border-hover)] transition-colors shadow-sm"
                            title="Reject hallucination"
                          >
                            <X className="w-4 h-4" />
                          </button>
                       </div>
                    </div>
                  ))}
               </div>
            ) : (
               <div className="h-full flex flex-col items-center justify-center text-center py-6 opacity-40">
                  <Sparkles className="w-8 h-8 text-indigo-400 mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">AI is observing... No pending evolutions.</p>
               </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
             <History className="w-4 h-4 text-emerald-600" />
             <h2 className="text-xs font-black text-[var(--color-text-muted)] uppercase tracking-widest">Active Brand DNA (Knowledge Base)</h2>
          </div>
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-3xl p-6 min-h-[160px]">
             {brandInfo.aiKnowledgeBase && brandInfo.aiKnowledgeBase.length > 0 ? (
                <div className="space-y-2">
                   {brandInfo.aiKnowledgeBase.map((fact, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 px-3 py-2 bg-[var(--color-bg-surface)] rounded-lg border border-emerald-200/50">
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                         <p className="text-[10px] font-medium text-[var(--color-text-secondary)] leading-tight">{fact}</p>
                      </div>
                   ))}
                </div>
             ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-6 opacity-40">
                   <Target className="w-8 h-8 text-emerald-400 mb-2" />
                   <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Permanent Knowledge Base is empty.</p>
                </div>
             )}
           </div>

           {/* Audit Button */}
           <div className="flex gap-2">
              <button 
                onClick={async () => {
                   try {
                     const { auditKnowledgeBase } = await import('@/actions/auditRules')
                     setIsRefreshing(true)
                     const res = await auditKnowledgeBase(brandInfo, new Date().toISOString().split('T')[0])
                     if (res.success && res.data) {
                       const stale = res.data.filter(r => r.status !== 'active')
                       if (stale.length === 0) {
                         alert('All rules are current. No drift detected.')
                       } else {
                         stale.forEach(r => {
                           if (r.suggestedUpdate) {
                             addPendingInsight(r.suggestedUpdate)
                           }
                         })
                         alert(`${stale.length} rule(s) flagged. Updates staged in Training Buffer.`)
                       }
                       setLastKbAudit(new Date().toISOString())
                     }
                   } catch (e) { alert('Audit failed.') } finally { setIsRefreshing(false) }
                }}
                disabled={!brandInfo.aiKnowledgeBase?.length || isRefreshing}
                className="flex-1 py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-all disabled:opacity-40"
              >
                🔍 Audit for Drift
              </button>
              <button 
                onClick={async () => {
                   try {
                     const { analyzeToneFingerprint } = await import('@/actions/toneFingerprint')
                     setIsRefreshing(true)
                     const res = await analyzeToneFingerprint(brandInfo, activeBrand?.contentDrafts || {})
                     if (res.success && res.data) {
                       setToneFingerprint(res.data)
                       alert('Voice DNA fingerprint computed!')
                     } else {
                       alert(res.error || 'Analysis failed')
                     }
                   } catch (e) { alert('Fingerprint failed.') } finally { setIsRefreshing(false) }
                }}
                disabled={isRefreshing || Object.keys(activeBrand?.contentDrafts || {}).length < 3}
                className="flex-1 py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100 transition-all disabled:opacity-40"
              >
                🧬 Analyze Voice DNA
              </button>
           </div>
         </div>

         {/* Tone Fingerprint Display */}
         {activeBrand?.toneFingerprint && (
            <div className="space-y-4 mt-6">
              <div className="flex items-center gap-2 mb-2">
                 <Brain className="w-4 h-4 text-purple-600" />
                 <h2 className="text-xs font-black text-[var(--color-text-muted)] uppercase tracking-widest">Voice DNA Fingerprint</h2>
                 <span className="text-[8px] text-[var(--color-text-muted)] font-medium">({activeBrand?.toneFingerprint?.sampleSize || 0} drafts analyzed)</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                 <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-black text-purple-600">{activeBrand?.toneFingerprint?.punchiness ?? 0}<span className="text-sm text-purple-300">/10</span></p>
                    <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mt-1">Punchiness</p>
                 </div>
                 <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-black text-sky-600">{(activeBrand?.toneFingerprint?.avgSentenceLength ?? 0).toFixed(0)}</p>
                    <p className="text-[9px] font-black text-sky-400 uppercase tracking-widest mt-1">Avg Words/Sentence</p>
                 </div>
                 <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-black text-amber-600">{((activeBrand?.toneFingerprint?.hinglishRatio ?? 0) * 100).toFixed(0)}%</p>
                    <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mt-1">Hinglish Ratio</p>
                 </div>
                 <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-black text-emerald-600">{(activeBrand?.toneFingerprint?.emojiFrequency ?? 0).toFixed(1)}</p>
                    <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mt-1">Emojis/100 Words</p>
                 </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                 <span className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Signature Words:</span>
                 {(activeBrand?.toneFingerprint?.topWords || []).map((w, i) => (
                    <span key={i} className="text-[10px] font-bold text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">{w}</span>
                 ))}
              </div>
            </div>
         )}
       </div>

      {/* ═══ Brand OS Evolution Engine ═══ */}
      <BrandOSEvolution />

      <div className="grid grid-cols-1 gap-8 mt-8">
        {/* ═══ SECTION 3: Quick Pulse ═══ */}
        <div className="space-y-6">
          <h2 className="text-xs font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-4">Tactical DNA Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Main Goal - Expandable */}
            <TacticalCard 
              title="Main Goal"
              iconBg="bg-pink-50"
              icon={<CheckCircle2 className="w-4 h-4 text-pink-500" />}
              value={brandInfo.primaryGoals?.join(', ') || 'Growth'}
              fieldKey="primaryGoals"
              isArray={true}
              onSave={(val) => {
                const oldVal = brandInfo.primaryGoals?.join(', ') || ''
                setBrandInfo({ ...brandInfo, primaryGoals: val.split(',').map((s: string) => s.trim()).filter(Boolean) })
                signals.logProfileFieldChange('primaryGoals', `Goals changed from "${oldVal}" to "${val}"`)
              }}
            />

            {/* Visual Vibe - Expandable */}
            <TacticalCard
              title="Visual Vibe"
              iconBg="bg-indigo-50"
              icon={<Palette className="w-4 h-4 text-indigo-500" />}
              value={brandInfo.tone?.join(', ') || 'Modern'}
              fieldKey="tone"
              isArray={true}
              extraContent={
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-6 h-6 rounded-full border border-[var(--color-border-default)]" style={{ backgroundColor: brandInfo.primaryColorHex }} />
                  <div className="w-6 h-6 rounded-full border border-[var(--color-border-default)]" style={{ backgroundColor: brandInfo.secondaryColorHex }} />
                </div>
              }
              onSave={(val) => {
                const oldVal = brandInfo.tone?.join(', ') || ''
                setBrandInfo({ ...brandInfo, tone: val.split(',').map((s: string) => s.trim()).filter(Boolean) })
                signals.logProfileFieldChange('tone', `Tone changed from "${oldVal}" to "${val}"`)
              }}
            />

            {/* Target Platforms - Expandable */}
            <TacticalCard
              title="Target Platforms"
              iconBg="bg-emerald-50"
              icon={<Globe className="w-4 h-4 text-emerald-500" />}
              value={brandInfo.platforms?.join(', ') || ''}
              fieldKey="platforms"
              isArray={true}
              onSave={(val) => {
                const oldVal = brandInfo.platforms?.join(', ') || ''
                setBrandInfo({ ...brandInfo, platforms: val.split(',').map((s: string) => s.trim()).filter(Boolean) })
                signals.logProfileFieldChange('platforms', `Platforms changed from "${oldVal}" to "${val}"`)
              }}
            />
          </div>
        </div>
      </div>

      {/* ═══ SECTION 4: Universal Brand OS Truths ═══ */}
      <div className="mt-8">
        <h2 className="text-xs font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-4">Core Brand OS (Universal)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StrategyCard title="Target Audience Architecture" icon={Target} iconColor="bg-sky-50 text-sky-500" content={strategy.targetAudience} />
          <StrategyCard title="Brand Persona & Voice" icon={MessageSquare} iconColor="bg-amber-50 text-amber-500" content={strategy.persona} />
          <StrategyCard title="Core Narratives & Positioning" icon={Swords} iconColor="bg-blue-50 text-blue-500" content={strategy.coreNarratives} />
          {strategy.competitorAnalysis && <StrategyCard title="Competitor Warfare" icon={Swords} iconColor="bg-rose-50 text-rose-500" content={strategy.competitorAnalysis} accentBorder="border-rose-200" />}
          {strategy.psychographicTriggers && <StrategyCard title="Psychographic Triggers" icon={Brain} iconColor="bg-indigo-50 text-indigo-500" content={strategy.psychographicTriggers} accentBorder="border-indigo-200" />}
          {strategy.strategyGrid && <StrategyCard title="Overall Strategy Mechanics" icon={Target} iconColor="bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]" content={strategy.strategyGrid} />}
          {strategy.riskOpportunityMap && (() => {
            const raw = Array.isArray(strategy.riskOpportunityMap) ? strategy.riskOpportunityMap.join('\n') : (strategy.riskOpportunityMap || '')
            const points = raw
              .split(/\n+/)
              .flatMap(line => {
                const t = line.trim().replace(/^[-•*]\s+/, '').replace(/^\d+[.)]\s+/, '')
                if (!t) return []
                return t.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.length > 15)
              })
              .map(s => s.trim())
              .filter(s => s.length > 15)
            const risks = points.filter(p => /threat|risk|danger|weakness|challenge|compete|crowded|losing|behind|vulnerable|biggest|over-index/i.test(p))
            const opps = points.filter(p => /opportunit|advantage|untapped|whitespace|gap|underserved|emerging|potential|leverage|own|wedge|strongest|discover/i.test(p))
            const unmatched = points.filter(p => !risks.includes(p) && !opps.includes(p))
            const riskList = [...risks, ...unmatched.slice(0, Math.ceil(unmatched.length / 2))]
            const oppList = [...opps, ...unmatched.slice(Math.ceil(unmatched.length / 2))]
            return (<>
              {riskList.length > 0 && <StrategyCard title="Immediate Threats" icon={Shield} iconColor="bg-red-50 text-red-500" content={riskList.join('\n')} accentBorder="border-red-200" />}
              {oppList.length > 0 && <StrategyCard title="Untapped Opportunities" icon={Zap} iconColor="bg-emerald-50 text-emerald-500" content={oppList.join('\n')} accentBorder="border-emerald-200" />}
            </>)
          })()}
        </div>
      </div>

      {/* ═══ SECTION 5: Social Media Strategy (Phase 2 — Unlockable) ═══ */}
      <div className="mt-12 pt-8 border-t border-[var(--color-border-subtle)]">

        {!socialStrategyGenerated ? (
          /* ── LOCKED STATE: Unlock Social Media Strategy ── */
          <div className="relative overflow-hidden rounded-3xl border-2 border-dashed border-[var(--color-accent-500)]/40 bg-gradient-to-br from-[var(--color-accent-900)]/5 to-blue-900/5 p-10 text-center">
            <div className="absolute top-0 right-0 w-72 h-72 bg-[var(--color-accent-500)]/5 blur-[100px] -mr-36 -mt-36 rounded-full" />
            <div className="absolute bottom-0 left-0 w-56 h-56 bg-blue-500/5 blur-[80px] -ml-28 -mb-28 rounded-full" />

            <div className="relative z-10 max-w-lg mx-auto">
              <div className="w-16 h-16 bg-[var(--color-accent-600)]/20 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-[var(--color-accent-500)]/30">
                <Zap className="w-8 h-8 text-[var(--color-accent-400)]" />
              </div>
              <h2 className="text-2xl font-black text-[var(--color-text-primary)] mb-3">Unlock Social Media Strategy</h2>
              <p className="text-sm text-[var(--color-text-secondary)] mb-2 leading-relaxed">
                Your marketing strategy is ready. Now generate your platform-specific playbooks, content pillars, and Brand OS compilation.
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mb-8">
                This builds on your Phase 1 strategy to create platform playbooks, content pillars with posting cadence, and anti-pattern checklists tailored to each platform.
              </p>

              {socialError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-bold mb-5 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5" /> {socialError}
                </div>
              )}

              <button
                onClick={handleUnlockSocialStrategy}
                disabled={isGeneratingSocial}
                className="px-10 py-4 bg-[var(--color-accent-600)] hover:bg-[var(--color-accent-500)] text-white rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center gap-3 mx-auto"
              >
                {isGeneratingSocial ? (
                  <><RefreshCw className="w-5 h-5 animate-spin" /> Generating Social Strategy...</>
                ) : (
                  <><Sparkles className="w-5 h-5" /> Generate Social Media Strategy</>
                )}
              </button>

              {isGeneratingSocial && (
                <p className="text-xs text-[var(--color-text-muted)] mt-4 animate-pulse">
                  Building platform playbooks and content pillars... This takes 30-60 seconds.
                </p>
              )}
            </div>
          </div>
        ) : (
        <>
        <h2 className="text-xs font-black text-blue-500 uppercase tracking-widest mb-4">Social Media Playbooks</h2>

        {strategy.platformPlaybooks && Object.keys(strategy.platformPlaybooks).length > 0 ? (
           <div className="grid grid-cols-1 gap-6">
              {Object.entries(strategy.platformPlaybooks).map(([platform, playbook]) => (
                <button 
                  key={platform} 
                  onClick={() => setSelectedPlatform(platform)}
                  className="bg-[var(--color-bg-base)] border-2 border-[var(--color-border-default)] rounded-3xl overflow-hidden hover:border-[var(--color-accent-400)] transition-all shadow-sm text-left cursor-pointer group hover:shadow-lg"
                >
                   <div className="bg-[var(--color-bg-surface)] border-b border-[var(--color-border-subtle)] px-6 py-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-accent-700)] border border-[var(--color-accent-600)] flex items-center justify-center">
                         {(() => {
                            const config = PLATFORM_ICONS[platform] || PLATFORM_ICONS.default;
                            const Icon = config.icon;
                            return <Icon className={`w-4 h-4 ${config.color}`} />;
                         })()}
                      </div>
                      <h3 className="text-lg font-black text-[var(--color-text-primary)] uppercase tracking-tight flex-1">{platform}</h3>
                      {Array.isArray(strategy.contentPillars?.[platform]) && strategy.contentPillars[platform].length > 0 && (
                        <span className="text-[10px] font-black text-[var(--color-accent-400)] bg-[var(--color-accent-900)]/20 px-3 py-1 rounded-full uppercase tracking-widest">
                          {strategy.contentPillars[platform].length} Pillars · {strategy.contentPillars[platform].reduce((s: number, p: any) => s + (Array.isArray(p.buckets) ? p.buckets.length : 0), 0)} Buckets
                        </span>
                      )}
                      <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-accent-400)] transition-colors" />
                   </div>
                   <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                         <label className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-1 block">Strategic Role</label>
                         <p className="text-sm font-bold text-[var(--color-text-secondary)] leading-snug">{playbook?.role || '—'}</p>
                      </div>
                      <div>
                         <label className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-1 block">Format Mechanics</label>
                         <p className="text-sm font-bold text-[var(--color-text-secondary)] leading-snug">{playbook?.mechanics || '—'}</p>
                      </div>
                      <div>
                         <label className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-1 block">Tone Modifier</label>
                         <p className="text-sm font-bold text-[var(--color-text-secondary)] leading-snug">{playbook?.toneModifier || '—'}</p>
                      </div>
                      <div>
                         <label className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-1 block">Cadence</label>
                         <p className="text-sm font-bold text-[var(--color-text-secondary)] leading-snug">{playbook?.cadence || '—'}</p>
                      </div>
                   </div>
                </button>
              ))}
           </div>
        ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {strategy.socialCreativeKit && <StrategyCard title="Content & Format Kit" icon={Palette} iconColor="bg-purple-50 text-purple-500" content={strategy.socialCreativeKit} defaultOpen={true} />}
             {strategy.socialMediaSpine && <StrategyCard title="Channel Spine (Legacy)" icon={Globe} iconColor="bg-indigo-50 text-indigo-500" content={strategy.socialMediaSpine} defaultOpen={true} />}
             {strategy.measurementPlan && <StrategyCard title="Social KPIs & Measurement" icon={BarChart3} iconColor="bg-emerald-50 text-emerald-500" content={strategy.measurementPlan} />}
           </div>
        )}

        {/* ═══ PLATFORM PILLAR/BUCKET POPUP MODAL ═══ */}
        {selectedPlatform && strategy.platformPlaybooks?.[selectedPlatform] && (() => {
          const playbook = strategy.platformPlaybooks[selectedPlatform]
          const pillars = Array.isArray(strategy.contentPillars?.[selectedPlatform]) ? strategy.contentPillars[selectedPlatform] : []
          const totalBuckets = pillars.reduce((s: number, p: any) => s + (Array.isArray(p.buckets) ? p.buckets.length : 0), 0)
          const totalMinPosts = pillars.reduce((s: number, p: any) => s + (Array.isArray(p.buckets) ? p.buckets : []).reduce((bs: number, b: any) => bs + (b.suggestedMinPerMonth || 0), 0), 0)
          const totalMaxPosts = pillars.reduce((s: number, p: any) => s + (Array.isArray(p.buckets) ? p.buckets : []).reduce((bs: number, b: any) => bs + (b.suggestedMaxPerMonth || 0), 0), 0)
          const platConfig = PLATFORM_ICONS[selectedPlatform] || PLATFORM_ICONS.default
          const PlatIcon = platConfig.icon

          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-md bg-black/50 p-4" onClick={() => setSelectedPlatform(null)}>
              <div 
                className="w-[900px] max-h-[90vh] bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] relative flex flex-col animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-[var(--color-border-default)] flex-shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--color-accent-700)] border border-[var(--color-accent-500)]/30 flex items-center justify-center shadow-[0_0_20px_var(--color-accent-glow)]">
                      <PlatIcon className={`w-6 h-6 ${platConfig.color}`} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-display font-bold text-[var(--color-text-primary)] tracking-tight">{selectedPlatform}</h2>
                      <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">Content Pillars & Buckets</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
                      <span className="text-[var(--color-text-muted)]">{pillars.length} Pillars</span>
                      <span className="text-[var(--color-accent-400)]">{totalBuckets} Buckets</span>
                      <span className="text-emerald-400">{totalMinPosts}-{totalMaxPosts} posts/mo</span>
                    </div>
                    <button onClick={() => setSelectedPlatform(null)} className="p-2 rounded-xl hover:bg-[var(--color-bg-hover)] text-[var(--color-text-tertiary)] hover:text-white transition-all">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Playbook Summary */}
                <div className="px-8 py-4 bg-[var(--color-bg-surface)] border-b border-[var(--color-border-subtle)]">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Role', value: playbook?.role },
                      { label: 'Mechanics', value: playbook?.mechanics },
                      { label: 'Tone', value: playbook?.toneModifier },
                      { label: 'Cadence', value: playbook?.cadence },
                    ].map(({ label, value }) => {
                      const text = value || '—'
                      const needsExpand = text.length > 80
                      return (
                        <div key={label} className="group/field">
                          <label className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">{label}</label>
                          <p className={`text-xs font-bold text-[var(--color-text-secondary)] mt-1 cursor-default transition-all ${needsExpand ? 'line-clamp-2 group-hover/field:line-clamp-none' : ''}`} title={text}>{text}</p>
                          {needsExpand && <span className="text-[8px] text-[var(--color-accent-500)] opacity-0 group-hover/field:opacity-100 transition-opacity cursor-default">hover to expand</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Pillars & Buckets */}
                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5 custom-scrollbar">
                  {pillars.length === 0 ? (
                    <div className="text-center py-16">
                      <Sparkles className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-4 opacity-30" />
                      <p className="text-sm font-bold text-[var(--color-text-tertiary)]">No content pillars generated yet.</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">Re-generate your Brand OS strategy to auto-populate pillars & buckets.</p>
                    </div>
                  ) : (
                    pillars.map((pillar, pIdx) => (
                      <div key={pillar.id} className="rounded-2xl border-2 border-[var(--color-border-default)] overflow-hidden bg-[var(--color-bg-surface)]">
                        <div className="px-5 py-4 bg-[var(--color-bg-base)] border-b border-[var(--color-border-subtle)] flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-[var(--color-accent-600)] text-white flex items-center justify-center text-xs font-black">{pIdx + 1}</div>
                          <div className="flex-1">
                            <input value={pillar.name} onChange={(e) => { const u = [...pillars]; u[pIdx] = { ...u[pIdx], name: e.target.value }; setStrategy({ ...strategy, contentPillars: { ...strategy.contentPillars, [selectedPlatform]: u } }) }} className="text-sm font-black text-[var(--color-text-primary)] bg-transparent outline-none uppercase tracking-wider w-full" />
                            <input value={pillar.description} onChange={(e) => { const u = [...pillars]; u[pIdx] = { ...u[pIdx], description: e.target.value }; setStrategy({ ...strategy, contentPillars: { ...strategy.contentPillars, [selectedPlatform]: u } }) }} className="text-[10px] text-[var(--color-text-muted)] bg-transparent outline-none w-full mt-0.5" />
                          </div>
                          <span className="text-[10px] font-bold text-[var(--color-text-muted)]">{(Array.isArray(pillar.buckets) ? pillar.buckets : []).length} buckets</span>
                          <button onClick={() => { setStrategy({ ...strategy, contentPillars: { ...strategy.contentPillars, [selectedPlatform]: pillars.filter((_, i) => i !== pIdx) } }) }} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="divide-y divide-[var(--color-border-subtle)]">
                          {(Array.isArray(pillar.buckets) ? pillar.buckets : []).map((bucket, bIdx) => (
                            <div key={bucket.id} className="px-5 py-3 flex items-center gap-4 hover:bg-[var(--color-bg-hover)] transition-colors group">
                              <div className="w-5 h-5 rounded-md bg-[var(--color-bg-hover)] flex items-center justify-center text-[9px] font-black text-[var(--color-text-muted)]">{pIdx + 1}.{bIdx + 1}</div>
                              <div className="flex-1 min-w-0">
                                <input value={bucket.name} onChange={(e) => { const u = [...pillars]; const nb = [...u[pIdx].buckets]; nb[bIdx] = { ...nb[bIdx], name: e.target.value }; u[pIdx] = { ...u[pIdx], buckets: nb }; setStrategy({ ...strategy, contentPillars: { ...strategy.contentPillars, [selectedPlatform]: u } }) }} className="text-xs font-bold text-[var(--color-text-primary)] bg-transparent outline-none w-full" />
                                <input value={bucket.description} onChange={(e) => { const u = [...pillars]; const nb = [...u[pIdx].buckets]; nb[bIdx] = { ...nb[bIdx], description: e.target.value }; u[pIdx] = { ...u[pIdx], buckets: nb }; setStrategy({ ...strategy, contentPillars: { ...strategy.contentPillars, [selectedPlatform]: u } }) }} className="text-[10px] text-[var(--color-text-muted)] bg-transparent outline-none w-full" />
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="flex flex-col items-center">
                                  <span className="text-[8px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Min</span>
                                  <input type="number" min={0} max={10} value={bucket.suggestedMinPerMonth} onChange={(e) => { const u = [...pillars]; const nb = [...u[pIdx].buckets]; nb[bIdx] = { ...nb[bIdx], suggestedMinPerMonth: parseInt(e.target.value) || 0 }; u[pIdx] = { ...u[pIdx], buckets: nb }; setStrategy({ ...strategy, contentPillars: { ...strategy.contentPillars, [selectedPlatform]: u } }) }} className="w-10 text-center text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg py-1 outline-none focus:border-emerald-400" />
                                </div>
                                <span className="text-[var(--color-text-muted)] text-xs">-</span>
                                <div className="flex flex-col items-center">
                                  <span className="text-[8px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Max</span>
                                  <input type="number" min={0} max={20} value={bucket.suggestedMaxPerMonth} onChange={(e) => { const u = [...pillars]; const nb = [...u[pIdx].buckets]; nb[bIdx] = { ...nb[bIdx], suggestedMaxPerMonth: parseInt(e.target.value) || 0 }; u[pIdx] = { ...u[pIdx], buckets: nb }; setStrategy({ ...strategy, contentPillars: { ...strategy.contentPillars, [selectedPlatform]: u } }) }} className="w-10 text-center text-xs font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg py-1 outline-none focus:border-amber-400" />
                                </div>
                                <span className="text-[9px] text-[var(--color-text-muted)] font-bold">/mo</span>
                              </div>
                              {bucket.formats && (<div className="flex gap-1 shrink-0">{bucket.formats.map(f => (<span key={f} className="text-[8px] font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-hover)] px-1.5 py-0.5 rounded">{f}</span>))}</div>)}
                              <button onClick={() => { const u = [...pillars]; u[pIdx] = { ...u[pIdx], buckets: u[pIdx].buckets.filter((_, i) => i !== bIdx) }; setStrategy({ ...strategy, contentPillars: { ...strategy.contentPillars, [selectedPlatform]: u } }) }} className="p-1 rounded text-[var(--color-text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          ))}
                          <button onClick={() => { const u = [...pillars]; u[pIdx] = { ...u[pIdx], buckets: [...u[pIdx].buckets, { id: `bucket-${Date.now()}`, name: 'New Bucket', description: 'Describe this content bucket...', pillarId: pillar.id, suggestedMinPerMonth: 1, suggestedMaxPerMonth: 3 }] }; setStrategy({ ...strategy, contentPillars: { ...strategy.contentPillars, [selectedPlatform]: u } }) }} className="w-full px-5 py-2.5 text-[10px] font-bold text-[var(--color-accent-500)] hover:bg-[var(--color-accent-500)]/5 transition-all flex items-center gap-1.5 justify-center"><Plus className="w-3 h-3" /> Add Bucket</button>
                        </div>
                      </div>
                    ))
                  )}
                  <button onClick={() => { setStrategy({ ...strategy, contentPillars: { ...strategy.contentPillars, [selectedPlatform]: [...pillars, { id: `pillar-${Date.now()}`, name: 'New Pillar', description: 'Describe this content pillar...', buckets: [] }] } }) }} className="w-full py-4 rounded-2xl border-2 border-dashed border-[var(--color-border-default)] hover:border-[var(--color-accent-500)] text-sm font-bold text-[var(--color-text-muted)] hover:text-[var(--color-accent-400)] transition-all flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Add Content Pillar</button>
                </div>
              </div>
            </div>
          )
        })()}
      </>
        )}
      </div>

      {/* ═══ SECTION 6: Brand Media Library ═══ */}
      <div className="mt-12 pt-8 border-t border-[var(--color-border-subtle)]">
        <h2 className="text-xs font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-6">Brand Media Library</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* References / Moodboards */}
          <div className="bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-3xl p-6">
            <MediaUploadSection
              title="References & Moodboards"
              subtitle="Upload reference images, PPTs, PDFs, moodboards. AI will use these as creative direction."
              icon={<Paperclip className="w-4 h-4 text-amber-500" />}
              iconColor="bg-amber-50"
              assets={brandInfo.brandReferences || []}
              acceptTypes=".png,.jpg,.jpeg,.webp,.pdf,.ppt,.pptx,.doc,.docx"
              onUpload={(files) => handleMediaUpload(files, 'brandReferences')}
              onRemove={(id) => handleMediaRemove(id, 'brandReferences')}
            />
          </div>

          {/* Product Photos */}
          <div className="bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-3xl p-6">
            <MediaUploadSection
              title="Product Photos"
              subtitle="Upload product images. These will be matched to your product catalog for AI-generated posts."
              icon={<ImagePlus className="w-4 h-4 text-pink-500" />}
              iconColor="bg-pink-50"
              assets={brandInfo.productImages || []}
              acceptTypes=".png,.jpg,.jpeg,.webp"
              onUpload={(files) => handleMediaUpload(files, 'productImages')}
              onRemove={(id) => handleMediaRemove(id, 'productImages')}
              linkedProducts={brandInfo.productCatalog?.map(p => p.name)}
            />
          </div>

          {/* Brand Logos */}
          <div className="bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-3xl p-6">
            <MediaUploadSection
              title="Brand Logos"
              subtitle="Upload logo files (PNG, SVG, WebP). AI will reference these for brand consistency."
              icon={<FolderOpen className="w-4 h-4 text-blue-500" />}
              iconColor="bg-blue-50"
              assets={brandInfo.brandLogos || []}
              acceptTypes=".png,.jpg,.jpeg,.webp,.svg"
              onUpload={(files) => handleMediaUpload(files, 'brandLogos')}
              onRemove={(id) => handleMediaRemove(id, 'brandLogos')}
            />
          </div>

          {/* Typography & Fonts */}
          <div className="bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-3xl p-6 space-y-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center"><Type className="w-4 h-4 text-purple-500" /></div>
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Typography</h3>
                <p className="text-[10px] text-[var(--color-text-tertiary)]">Font names are injected into every image generation prompt</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Heading Font</label>
                <input 
                  type="text"
                  value={brandInfo.headingFont || ''}
                  onChange={(e) => setBrandInfo({ ...brandInfo, headingFont: e.target.value })}
                  placeholder="e.g. Playfair Display"
                  className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-sm font-bold text-[var(--color-text-primary)] outline-none focus:border-purple-400 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Body Font</label>
                <input 
                  type="text"
                  value={brandInfo.bodyFont || ''}
                  onChange={(e) => setBrandInfo({ ...brandInfo, bodyFont: e.target.value })}
                  placeholder="e.g. Inter, Open Sans"
                  className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-sm font-bold text-[var(--color-text-primary)] outline-none focus:border-purple-400 transition-colors"
                />
              </div>
            </div>

            <MediaUploadSection
              title="Font Specimens"
              subtitle="Upload screenshots showing your fonts in use. AI uses these as visual reference."
              icon={<Type className="w-4 h-4 text-purple-400" />}
              iconColor="bg-purple-50"
              assets={brandInfo.fontSpecimenImages || []}
              acceptTypes=".png,.jpg,.jpeg,.webp"
              onUpload={(files) => handleMediaUpload(files, 'fontSpecimenImages')}
              onRemove={(id) => handleMediaRemove(id, 'fontSpecimenImages')}
            />
          </div>
        </div>
      </div>

      {/* ── Visual Guardrails (Do's & Don'ts) ── */}
      <div className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-8 space-y-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-[var(--color-text-primary)]">Visual Guardrails</h3>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">AI-derived Do's & Don'ts from your brand references. These are the final rules for image generation.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const newRule: import('@/stores/brand').VisualGuardrail = {
                  id: `vg-${Date.now()}`,
                  type: 'do',
                  rule: '',
                  source: 'user'
                }
                const existing = brandInfo.visualGuardrails || []
                setBrandInfo({ ...brandInfo, visualGuardrails: [...existing, newRule] })
              }}
              className="px-3 py-2 rounded-xl border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-secondary)] hover:border-emerald-500 hover:text-emerald-400 transition-all flex items-center gap-1.5"
            >
              <Edit3 className="w-3 h-3" /> Add Rule
            </button>
            <button
              onClick={async () => {
                if (!brandInfo.brandReferences || brandInfo.brandReferences.length === 0) {
                  alert('Upload brand references first (in the Media Library above or during Onboarding)')
                  return
                }
                setIsAnalyzingRefs(true)
                try {
                  const { analyzeReferenceImages } = await import('@/actions/analyzeRefs')
                  const res = await analyzeReferenceImages(brandInfo.brandReferences, brandInfo.name)
                  if (res.success && res.data) {
                    const existing = brandInfo.visualGuardrails || []
                    const userRules = existing.filter(g => g.source === 'user')
                    setBrandInfo({ ...brandInfo, visualGuardrails: [...res.data, ...userRules] })
                  } else {
                    alert('Analysis failed: ' + (res.error || 'Unknown error'))
                  }
                } catch (e: any) {
                  alert('Error: ' + (e?.message || 'Unknown'))
                } finally {
                  setIsAnalyzingRefs(false)
                }
              }}
              disabled={isAnalyzingRefs}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50 shadow-md"
            >
              {isAnalyzingRefs ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isAnalyzingRefs ? 'Analyzing...' : 'Analyze References'}
            </button>
          </div>
        </div>

        {(brandInfo.visualGuardrails && brandInfo.visualGuardrails.length > 0) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {brandInfo.visualGuardrails.map((g, idx) => (
              <div key={g.id} className={`p-4 rounded-xl border-2 transition-all group ${g.type === 'do' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => {
                      const updated = [...(brandInfo.visualGuardrails || [])]
                      updated[idx] = { ...updated[idx], type: updated[idx].type === 'do' ? 'dont' : 'do' }
                      setBrandInfo({ ...brandInfo, visualGuardrails: updated })
                    }}
                    className={`shrink-0 mt-0.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors cursor-pointer ${g.type === 'do' ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-red-500 text-white border-red-600'}`}
                  >
                    {g.type === 'do' ? 'DO' : "DON'T"}
                  </button>
                  <input
                    value={g.rule}
                    onChange={(e) => {
                      const updated = [...(brandInfo.visualGuardrails || [])]
                      updated[idx] = { ...updated[idx], rule: e.target.value, source: 'user' }
                      setBrandInfo({ ...brandInfo, visualGuardrails: updated })
                    }}
                    placeholder="Type a visual rule..."
                    className="flex-1 bg-transparent text-sm font-medium text-[var(--color-text-primary)] outline-none border-b border-transparent focus:border-[var(--color-border-hover)] transition-colors"
                  />
                  <button
                    onClick={() => {
                      const updated = (brandInfo.visualGuardrails || []).filter((_, i) => i !== idx)
                      setBrandInfo({ ...brandInfo, visualGuardrails: updated })
                    }}
                    className="shrink-0 p-1 rounded-lg text-[var(--color-text-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-[8px] text-[var(--color-text-muted)] mt-1 block ml-12">{g.source === 'ai' ? 'AI-derived' : 'Custom'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="w-10 h-10 text-[var(--color-text-muted)] mb-3 opacity-30" />
            <p className="text-sm text-[var(--color-text-muted)] font-medium">No visual guardrails yet</p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1 max-w-sm">Upload brand references above, then click "Analyze References" to have AI extract your visual Do's and Don'ts automatically.</p>
          </div>
        )}
      </div>

      {/* Re-sync warning */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-bold flex items-center gap-2 animate-in slide-in-from-bottom-2">
          <RefreshCw className="w-4 h-4" /> {error}
        </div>
      )}
    </div>
  )
}
