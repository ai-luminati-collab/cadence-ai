'use client'

import { useState, useEffect } from 'react'
import { Brain, Check, X, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { DetectedPattern } from '@/lib/edit-pattern-detector'

interface PatternPromptProps {
  pattern: DetectedPattern
  onAccept: (rule: string) => void   // User confirms → add to KB
  onDismiss: () => void               // User dismisses → don't nag again
  onEditRule: (rule: string) => void  // User edits the rule before accepting
}

export function PatternPrompt({ pattern, onAccept, onDismiss, onEditRule }: PatternPromptProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [showEvidence, setShowEvidence] = useState(false)
  const [editedRule, setEditedRule] = useState(pattern.suggestedRule)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    // Slide in animation
    requestAnimationFrame(() => setIsVisible(true))
  }, [])

  const handleAccept = () => {
    setIsVisible(false)
    setTimeout(() => onAccept(editedRule), 300)
  }

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(onDismiss, 300)
  }

  const strengthLabel = pattern.occurrences >= 5 ? 'Strong pattern' : 'Emerging pattern'
  const strengthColor = pattern.occurrences >= 5
    ? 'text-emerald-400'
    : 'text-amber-400'

  return (
    <div
      className={`fixed bottom-6 right-6 z-[9999] max-w-md transition-all duration-300 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="bg-[var(--color-bg-surface)] border-2 border-[var(--color-accent-500)]/40 rounded-3xl shadow-2xl shadow-[var(--color-accent-500)]/10 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--color-accent-500)]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Brain className="w-5 h-5 text-[var(--color-accent-400)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--color-accent-400)]">
                Pattern Detected
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${strengthColor}`}>
                {strengthLabel} ({pattern.occurrences}x)
              </span>
            </div>
            <p className="text-sm text-[var(--color-text-primary)] font-semibold leading-snug">
              I noticed you keep{' '}
              <span className="text-[var(--color-accent-300)]">
                {getHumanLabel(pattern)}
              </span>
              {pattern.format ? ` in ${pattern.platform} ${pattern.format}s` : ` on ${pattern.platform}`}.
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              Want me to remember this for all future content?
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-xl hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Rule Preview / Edit */}
        <div className="px-6 pb-3">
          {isEditing ? (
            <textarea
              value={editedRule}
              onChange={(e) => setEditedRule(e.target.value)}
              className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-xl p-3 text-xs text-[var(--color-text-secondary)] font-mono resize-none outline-none focus:border-[var(--color-accent-500)] transition-colors"
              rows={3}
              autoFocus
            />
          ) : (
            <div
              onClick={() => setIsEditing(true)}
              className="bg-[var(--color-bg-hover)]/50 rounded-xl p-3 text-xs text-[var(--color-text-secondary)] font-mono cursor-text hover:bg-[var(--color-bg-hover)] transition-colors border border-transparent hover:border-[var(--color-border-subtle)]"
            >
              {editedRule}
            </div>
          )}
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5 italic">
            Click to edit the rule before saving
          </p>
        </div>

        {/* Evidence Toggle */}
        <div className="px-6 pb-3">
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="text-[10px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] uppercase tracking-wider flex items-center gap-1 transition-colors"
          >
            {showEvidence ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Show evidence ({pattern.occurrences} edits)
          </button>
          {showEvidence && (
            <div className="mt-2 space-y-1.5">
              {pattern.evidence.map((e, i) => (
                <div key={i} className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg-hover)]/30 rounded-lg p-2 font-mono truncate">
                  {e}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex gap-2">
          <button
            onClick={handleAccept}
            className="flex-1 h-10 rounded-xl bg-[var(--color-accent-600)] hover:bg-[var(--color-accent-500)] text-white text-xs font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 shadow-lg active:scale-[0.97]"
          >
            <Zap className="w-3.5 h-3.5" />
            Yes, remember this
          </button>
          <button
            onClick={handleDismiss}
            className="h-10 px-4 rounded-xl border border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider transition-all"
          >
            Just this time
          </button>
        </div>
      </div>
    </div>
  )
}

function getHumanLabel(pattern: DetectedPattern): string {
  const labels: Record<string, string> = {
    removed_opening_question: 'removing opening questions',
    shortened_text: 'shortening the content',
    lengthened_text: 'adding more detail',
    removed_emojis: 'removing emojis',
    added_emojis: 'adding emojis',
    removed_exclamations: 'removing exclamation marks',
    removed_hashtags: 'removing hashtags',
    tone_shift: 'adjusting the tone',
    removed_ai_smog: 'removing generic marketing buzzwords',
    added_specificity: 'making things more specific',
    restructured: 'rewriting the structure',
    cta_changed: 'changing the call-to-action',
    copilot_instruction: 'giving similar refinement instructions',
  }
  return labels[pattern.editType] || 'making the same type of edit'
}
