'use client'

import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { usePathname } from 'next/navigation'
import { useBrandStore } from '@/stores/brand'
import { cn } from '@/lib/utils'
import { CreativeDirectorChat } from '@/components/ui/CreativeDirectorChat'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { activeBrandId } = useBrandStore()
  
  // Hide sidebar on global brand picker and onboarding — show everywhere else when a brand is active
  const hideSidebar = !activeBrandId || ['/dashboard', '/onboarding'].includes(pathname)

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg-base)] text-[var(--color-text-primary)] font-sans">
      {!hideSidebar && <Sidebar />}
      <div className={cn("flex flex-1 flex-col overflow-hidden relative transition-all duration-500", hideSidebar ? "w-full" : "flex-1")}>
        {!hideSidebar && <Topbar />}
        
        {/* Subtle background glow for the main content area */}
        <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-[var(--color-accent-700)] opacity-10 blur-[100px] rounded-full pointer-events-none z-0" />
        
        <main className={cn("flex-1 overflow-y-auto relative scroll-smooth", hideSidebar ? "px-0 py-0" : "px-6 py-8 lg:px-8")}>
          {children}
        </main>
        
        {/* Floating Creative Director Hub */}
        <CreativeDirectorChat />
      </div>
    </div>
  )
}
