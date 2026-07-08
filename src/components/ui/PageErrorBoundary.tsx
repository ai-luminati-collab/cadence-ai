'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { sanitizeErrorForUI } from '@/lib/error-sanitizer'

export function PageErrorBoundary({
  error,
  reset,
  pageName = 'Page'
}: {
  error: Error & { digest?: string }
  reset: () => void
  pageName?: string
}) {
  useEffect(() => {
    console.error('[PageErrorBoundary]', pageName, error)
  }, [error, pageName])

  // Sanitize the error message so raw API/billing details never reach the user
  const safeMessage = error.message ? sanitizeErrorForUI(error.message) : ''
  const digest = typeof error.digest === 'string' ? error.digest : ''

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <div className="max-w-md text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <div>
          <h2 className="text-xl font-black text-[var(--color-text-primary)] mb-2">{pageName} failed to load</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Something went wrong. Try refreshing the page, or head back to the dashboard.
          </p>
          {safeMessage && (
            <p className="text-xs text-red-400 mt-3 font-mono bg-red-500/5 border border-red-500/10 rounded-lg p-3 break-all">
              {safeMessage}
            </p>
          )}
          {digest && (
            <p className="text-[10px] text-slate-400 font-mono mt-2">Ref: {digest}</p>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl bg-[var(--color-accent-600)] text-white text-sm font-bold hover:bg-[var(--color-accent-500)] transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
          <a
            href="/dashboard"
            className="px-5 py-2.5 rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-secondary)] text-sm font-bold hover:border-[var(--color-accent-500)] transition-all flex items-center gap-2"
          >
            <Home className="w-4 h-4" /> Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
