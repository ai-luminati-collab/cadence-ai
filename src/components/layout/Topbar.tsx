'use client'
import { Bell, Search } from 'lucide-react'

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-[var(--color-border-default)] bg-[var(--color-bg-base)]/80 backdrop-blur-xl px-6 lg:px-8">
      <div className="flex flex-1 items-center gap-x-4">
        {/* Search removed per UI redesign */}
      </div>
      <div className="flex items-center gap-x-4">
         <button className="relative p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors rounded-full hover:bg-[var(--color-bg-hover)]">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[var(--color-error)] border border-[var(--color-bg-base)]"></span>
         </button>
      </div>
    </header>
  )
}
