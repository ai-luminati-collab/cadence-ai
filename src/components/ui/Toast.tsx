'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, X, AlertCircle } from 'lucide-react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
  onClose: () => void
}

export function Toast({ message, type = 'success', duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true))
    
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300) // Wait for exit animation
    }, duration)
    
    return () => clearTimeout(timer)
  }, [duration, onClose])

  const Icon = type === 'success' ? CheckCircle2 : AlertCircle
  const colors = type === 'success' 
    ? 'bg-[var(--color-success)]/10 border-[var(--color-success)]/30 text-[var(--color-success)]'
    : type === 'info'
    ? 'bg-[var(--color-info)]/10 border-[var(--color-info)]/30 text-[var(--color-info)]'
    : 'bg-[var(--color-error)]/10 border-[var(--color-error)]/30 text-[var(--color-error)]'

  return (
    <div 
      className={`fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-xl border shadow-2xl backdrop-blur-xl transition-all duration-300 ${colors} ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm font-bold">{message}</span>
      <button onClick={() => { setIsVisible(false); setTimeout(onClose, 300) }} className="ml-2 opacity-60 hover:opacity-100 transition-opacity">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// Simple hook for managing toast state
export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type })
  }
  
  const hideToast = () => setToast(null)
  
  return { toast, showToast, hideToast }
}
