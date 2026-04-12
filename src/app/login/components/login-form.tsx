'use client'

import * as React from 'react'
import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const [isLoading, setIsLoading] = React.useState<boolean>(false)
  const [message, setMessage] = React.useState<{type: 'error' | 'success', text: string} | null>(null)

  // Use the shared Supabase browser client from lib
  const supabase = React.useMemo(() => createClient(), [])

  async function onSubmit(event: React.SyntheticEvent) {
    event.preventDefault()
    setIsLoading(true)
    setMessage(null)

    const target = event.target as typeof event.target & {
      email: { value: string }
    }
    const email = target.email.value

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Secure magic link sent! Check your email.' })
    }
    setIsLoading(false)
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit}>
        <div className="space-y-4">
          <div className="space-y-2">
             <label htmlFor="email" className="text-sm font-medium leading-none text-[var(--color-text-secondary)]">Email address</label>
            <input
              id="email"
              placeholder="name@example.com"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              disabled={isLoading}
              required
              className="flex h-12 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-input)] px-4 py-2 text-sm text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-500)] disabled:cursor-not-allowed disabled:opacity-50 shadow-inner"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-[var(--color-accent-600)] text-[var(--color-text-primary)] hover:bg-[var(--color-accent-500)] h-12 py-2 px-4 w-full shadow-[0_4px_14px_0_var(--color-accent-glow)] transform hover:-translate-y-0.5"
          >
            {isLoading && (
              <svg className="mr-2 h-4 w-4 animate-spin text-[var(--color-text-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            )}
            Sign In with Magic Link
          </button>
        </div>
      </form>

      {message && (
        <div className={`p-4 rounded-[var(--radius-sm)] text-sm border ${message.type === 'error' ? 'bg-[var(--color-error)]/10 border-[var(--color-error)]/20 text-[var(--color-error)]' : 'bg-[var(--color-success)]/10 border-[var(--color-success)]/20 text-[var(--color-success)]'}`}>
          {message.text}
        </div>
      )}

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-[var(--color-border-subtle)]" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-transparent px-2 text-[var(--color-text-tertiary)] rounded-full">
            Or continue with
          </span>
        </div>
      </div>

      <button
        type="button"
        disabled={true}
        title="GitHub OAuth coming soon"
        className="inline-flex items-center justify-center rounded-[var(--radius-md)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-40 disabled:pointer-events-none border border-[var(--color-border-default)] bg-[var(--color-bg-base)] text-[var(--color-text-secondary)] h-12 py-2 px-4 w-full cursor-not-allowed"
      >
        <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="github" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" fill="currentColor"/>
        </svg>
        GitHub
      </button>
    </div>
  )
}
