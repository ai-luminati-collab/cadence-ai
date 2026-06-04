'use client'

import { useState } from 'react'
import { Sparkles, Loader2, Wand2 } from 'lucide-react'
import { suggestFieldValue } from '@/actions/suggest'

interface AskAIButtonProps {
  fieldName: string
  fieldDescription: string
  context: {
    brandName: string
    industry: string
    website?: string
    researchSummary?: string
    previousAnswers?: Record<string, string>
  }
  onSelect: (value: string) => void
  currentValue?: string
}

export function AskAIButton({ fieldName, fieldDescription, context, onSelect, currentValue }: AskAIButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAsk = async () => {
    if (isLoading) return
    setIsLoading(true)
    setIsOpen(true)
    setSuggestions([])
    setError(null)

    try {
      const res = await suggestFieldValue(fieldName, fieldDescription, context)
      if (res.success && res.suggestions) {
        setSuggestions(res.suggestions)
      } else {
        setError(res.error || 'AI could not generate suggestions. Please try again.')
      }
    } catch (e) {
      console.error("Ask AI failed:", e)
      setError('AI service unavailable. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelect = (suggestion: string) => {
    // If the user already wrote something, append the suggestion. Otherwise, just use the suggestion.
    const newVal = (currentValue && currentValue.trim()) 
      ? `${currentValue.trim()}\n\n${suggestion}`
      : suggestion
      
    onSelect(newVal)
    // We intentionally do NOT close the modal, allowing them to click multiple!
  }

  const handleSelectAll = () => {
    const combined = suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n\n')
    const newVal = (currentValue && currentValue.trim()) 
      ? `${currentValue.trim()}\n\n${combined}`
      : combined
      
    onSelect(newVal)
  }

  const closeMenu = () => {
    setIsOpen(false)
    setSuggestions([])
    setError(null)
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleAsk}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full border transition-all
          bg-blue-50 border-blue-200 text-blue-600
          hover:bg-blue-100 hover:border-blue-300 hover:shadow-md
          disabled:opacity-50 active:scale-95"
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
        {isLoading ? 'Thinking...' : 'Ask AI'}
      </button>

      {isOpen && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
          {error ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
              <span className="text-xs font-bold text-red-600">{error}</span>
              <button type="button" onClick={handleAsk} className="text-xs font-black text-red-500 underline ml-auto shrink-0">Retry</button>
            </div>
          ) : isLoading ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
              <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              <span className="text-xs font-bold text-blue-600">Analyzing your brand context...</span>
            </div>
          ) : (
            suggestions.map((suggestion, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelect(suggestion)}
                className="w-full text-left p-3.5 rounded-xl border border-slate-200 bg-white
                  hover:border-blue-300 hover:bg-blue-50/50
                  transition-all text-sm text-slate-600 leading-relaxed
                  active:scale-[0.99] group"
              >
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-black text-blue-600 group-hover:bg-blue-200">{i + 1}</span>
                  <span>{suggestion}</span>
                </div>
              </button>
            ))
          )}
          {!isLoading && suggestions.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="w-full text-center p-2 rounded-lg bg-slate-900 text-white
                    hover:bg-slate-800 transition-all text-xs font-bold active:scale-[0.99]"
                >
                  Insert all {suggestions.length}
                </button>
                <button
                  type="button"
                  onClick={handleAsk}
                  className="w-full text-center p-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700
                    hover:bg-slate-200 transition-all text-xs font-bold active:scale-[0.99] flex items-center justify-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Regenerate
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-medium text-center">
                Click multiple to append them. <button type="button" onClick={closeMenu} className="underline hover:text-slate-600">Close when done</button>.
              </p>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

/* ── Expand with AI button ── */
interface ExpandAIButtonProps {
  fieldName: string
  fieldDescription: string
  context: {
    brandName: string
    industry: string
    website?: string
    researchSummary?: string
    previousAnswers?: Record<string, string>
  }
  currentValue: string
  onExpand: (value: string) => void
}

export function ExpandAIButton({ fieldName, fieldDescription, context, currentValue, onExpand }: ExpandAIButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  // Only show if user has typed something
  if (!currentValue || currentValue.trim().length < 3) return null

  const handleExpand = async () => {
    if (isLoading) return
    setIsLoading(true)

    try {
      const expandContext = {
        ...context,
        previousAnswers: {
          ...context.previousAnswers,
          [`Current ${fieldName} draft`]: currentValue,
        }
      }
      const res = await suggestFieldValue(
        `Expand: ${fieldName}`,
        `The user has written a brief draft for "${fieldName}": "${currentValue}". Expand and enrich this into a detailed, professional version. Keep their intent but make it more specific, strategic, and actionable. Return a single expanded paragraph, NOT an array. Return only the expanded text as a JSON array with one item.`,
        expandContext
      )
      if (res.success && res.suggestions?.[0]) {
        onExpand(res.suggestions[0])
      }
    } catch (e) {
      console.error("Expand AI failed:", e)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExpand}
      disabled={isLoading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full border transition-all
        bg-emerald-50 border-emerald-200 text-emerald-600
        hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-md
        disabled:opacity-50 active:scale-95"
    >
      {isLoading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Wand2 className="w-3 h-3" />
      )}
      {isLoading ? 'Expanding...' : 'Expand with AI'}
    </button>
  )
}
