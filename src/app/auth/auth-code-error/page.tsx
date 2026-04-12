'use client'

import Link from 'next/link'

export default function AuthCodeError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-base)]">
      <div className="max-w-md text-center space-y-6 p-8">
        <div className="text-6xl">🔒</div>
        <h1 className="text-2xl font-display font-bold text-[var(--color-text-primary)]">
          Authentication Error
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          The magic link has expired or was already used. This can happen if:
        </p>
        <ul className="text-xs text-[var(--color-text-tertiary)] space-y-2 text-left list-disc pl-6">
          <li>The link was clicked more than once</li>
          <li>The link expired (they last 1 hour)</li>
          <li>You signed in from a different device than where you requested the link</li>
        </ul>
        <Link 
          href="/login"
          className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-[var(--color-accent-600)] text-white text-sm font-bold hover:bg-[var(--color-accent-500)] transition-colors shadow-lg"
        >
          Try Again
        </Link>
      </div>
    </div>
  )
}
