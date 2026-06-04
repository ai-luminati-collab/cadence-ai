'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Calendar, PenTool, Settings, Sparkles, LogOut, Fingerprint, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBrandStore } from '@/stores/brand'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const workspaceNavItems = [
  { href: '/workspace', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/strategy', label: 'Brand OS', icon: Fingerprint },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/performance', label: 'Performance', icon: BarChart3 },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { brands, activeBrandId } = useBrandStore()
  const activeBrand = activeBrandId ? brands[activeBrandId] : null

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="hidden md:flex h-screen w-64 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-surface)] backdrop-blur-3xl sticky top-0">
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center gap-2 group mb-6">
           <div className="w-8 h-8 rounded-xl bg-[var(--color-bg-surface)] flex items-center justify-center shadow-[0_0_15px_var(--color-accent-glow)] group-hover:shadow-[0_0_20px_var(--color-accent-600)] transition-all">
              <Sparkles className="w-4 h-4 text-[var(--color-accent-500)]" />
           </div>
           <span className="font-display font-bold text-lg tracking-tight text-[var(--color-text-primary)] group-hover:text-[var(--color-accent-100)] transition-colors">Cadence</span>
        </Link>

        {activeBrand && (
           <div className="px-3 py-2 rounded-lg bg-[var(--color-bg-hover)] border border-[var(--color-border-subtle)] flex flex-col pt-3 pb-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-tertiary)] mb-0.5">Active Workspace</span>
              <span className="text-sm font-bold text-[var(--color-text-primary)] truncate">{activeBrand.brandInfo?.name || 'Unnamed Brand'}</span>
           </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {activeBrand && (
           <div className="pb-2 mb-1">
              <span className="px-4 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">Workspace</span>
           </div>
        )}
        
        {activeBrand && workspaceNavItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/workspace' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-all duration-200 relative overflow-hidden",
                isActive 
                  ? "bg-[var(--color-accent-glow)] text-[var(--color-accent-400)]" 
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--color-accent-500)] rounded-r-md"></div>
              )}
              <item.icon className={cn("mr-3 h-5 w-5 flex-shrink-0 transition-colors", isActive ? "text-[var(--color-accent-400)]" : "group-hover:text-[var(--color-accent-100)]")} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-[var(--color-border-subtle)] space-y-1.5">
         <Link
            href="/settings"
            className={cn(
              "w-full flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-colors",
              pathname === '/settings'
                ? "text-[var(--color-accent-400)] bg-[var(--color-accent-glow)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            )}
         >
            <Settings className="w-4 h-4" />
            Settings
         </Link>
         <ThemeToggle />
         <div className="flex items-center gap-3 rounded-[var(--radius-md)] p-3 bg-[var(--color-bg-base)] border border-[var(--color-border-default)]">
            <div className="w-8 h-8 rounded-full bg-[var(--color-accent-700)] flex items-center justify-center text-xs font-bold text-white shadow-inner">
               ME
            </div>
            <div className="flex-1 min-w-0">
               <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">My Account</p>
            </div>
         </div>
         <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] transition-colors"
         >
            <LogOut className="w-4 h-4" />
            Sign Out
         </button>
      </div>
    </div>
  )
}
