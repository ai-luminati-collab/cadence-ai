'use client'

import React, { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('cadence-theme')
    if (saved === 'dark') {
      setIsDark(true)
      document.documentElement.classList.add('dark')
    }
  }, [])

  const toggle = () => {
    const next = !isDark
    setIsDark(next)
    if (next) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('cadence-theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('cadence-theme', 'light')
    }
  }

  if (!mounted) return null

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-all group"
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-amber-400 group-hover:text-amber-300" />
      ) : (
        <Moon className="w-4 h-4 text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-primary)]" />
      )}
      <span className="text-sm font-medium">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
    </button>
  )
}
