'use client'

import * as React from 'react'
import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const [isLoading, setIsLoading] = React.useState<boolean>(false)
  const [isSignUp, setIsSignUp] = React.useState<boolean>(false)
  const [message, setMessage] = React.useState<{type: 'error' | 'success', text: string} | null>(null)

  const supabase = React.useMemo(() => createClient(), [])

  async function onSubmit(event: React.SyntheticEvent) {
    event.preventDefault()
    setIsLoading(true)
    setMessage(null)

    const target = event.target as typeof event.target & {
      email: { value: string }
      password: { value: string }
    }
    const email = target.email.value
    const password = target.password.value

    if (isSignUp) {
      const { error: signUpError, data: signUpData } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      })
      if (signUpError) {
        setMessage({ type: 'error', text: signUpError.message })
      } else if (signUpData.session) {
        // Email confirmation is OFF — Supabase returned a session, go straight in.
        setMessage({ type: 'success', text: 'Account created. Signing you in…' })
        window.location.href = '/dashboard'
      } else {
        // No session returned — try password sign-in immediately as a fallback.
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (!signInError) {
          setMessage({ type: 'success', text: 'Account created. Signing you in…' })
          window.location.href = '/dashboard'
        } else if (signInError.message.toLowerCase().includes('not confirmed')) {
          setMessage({ type: 'error', text: 'Account created, but email confirmation is required by Supabase. Disable "Confirm email" in Supabase Auth settings to sign in directly, or check your inbox.' })
        } else {
          setMessage({ type: 'error', text: signInError.message })
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        // Fallback for users trying to use old magic link without password
        if (error.message.includes('Invalid login credentials')) {
          setMessage({ type: 'error', text: 'Invalid credentials. If you previously used a Magic Link, please sign up again with a password.' })
        } else {
          setMessage({ type: 'error', text: error.message })
        }
      } else {
        setMessage({ type: 'success', text: 'Welcome back!' })
        // Middleware will catch the session and redirect automatically.
        // We can force a manual reload as well.
        window.location.href = '/dashboard'
      }
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
          <div className="space-y-2">
             <label htmlFor="password" className="text-sm font-medium leading-none text-[var(--color-text-secondary)]">Password</label>
            <input
              id="password"
              placeholder="••••••••"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              disabled={isLoading}
              required
              minLength={6}
              className="flex h-12 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-input)] px-4 py-2 text-sm text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-500)] disabled:cursor-not-allowed disabled:opacity-50 shadow-inner"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 inline-flex items-center justify-center rounded-[var(--radius-md)] text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-blue-600 text-white hover:bg-blue-500 h-12 py-2 px-4 w-full shadow-lg transform hover:-translate-y-0.5"
          >
            {isLoading && (
              <svg className="mr-2 h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            )}
            {isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </div>
      </form>

      <div className="flex justify-center mt-2">
        <button 
          type="button" 
          onClick={() => { setIsSignUp(!isSignUp); setMessage(null); }}
          className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-accent-500)] transition-colors"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-[var(--radius-sm)] text-sm border font-medium ${message.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
          {message.text}
        </div>
      )}

      {/* Dev bypass — skips Supabase entirely */}
      {process.env.NODE_ENV === 'development' && (
         <div className="mt-8 pt-4 border-t border-[var(--color-border-subtle)] text-center">
            <p className="text-[10px] text-[var(--color-text-tertiary)] mb-2 uppercase tracking-widest font-bold">Developer Bypass</p>
            <button
               type="button"
               onClick={() => { window.location.href = '/onboarding' }}
               className="text-xs px-4 py-2 border border-slate-700 bg-slate-800 text-slate-300 rounded-md hover:bg-slate-700 transition-colors"
            >
               Skip Login (Dev Mode)
            </button>
         </div>
      )}
    </div>
  )
}
