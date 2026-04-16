import { Metadata } from 'next'
import { LoginForm } from './components/login-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Login - Cadence',
  description: 'Sign in to your AI-powered social media command center.',
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center relative overflow-hidden bg-[var(--color-bg-base)]">
      {/* Background Glow Orbs for Premium Dark UI */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[var(--color-accent-700)] opacity-20 blur-[120px] rounded-full animate-pulse-slow" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[var(--color-accent-500)] opacity-20 blur-[120px] rounded-full" />
      
      {/* Glassmorphic Fore-ground */}
      <div className="relative z-10 w-full max-w-md px-8 py-12 backdrop-blur-xl bg-[var(--color-bg-surface)]/60 border border-[var(--color-border-subtle)] rounded-2xl shadow-2xl">
        <div className="mb-8 text-center space-y-2">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-surface)] flex items-center justify-center shadow-[0_0_20px_var(--color-accent-glow)]">
              {/* Fake logo placeholder until we throw a real one */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-primary)] w-6 h-6"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><line x1="12" y1="22" x2="12" y2="12"></line></svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">Welcome back</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">Sign in to your account or create a new one.</p>
        </div>
        
        <LoginForm />
      </div>
    </div>
  )
}
