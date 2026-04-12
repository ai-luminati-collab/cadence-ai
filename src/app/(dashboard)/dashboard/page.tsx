'use client'

import { Sparkles, CheckCircle2, Plus, Building2 } from 'lucide-react'
import { useBrandStore } from '@/stores/brand'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function DashboardPage() {
  const router = useRouter()
  const { brands, setActiveBrand, clearActiveBrand } = useBrandStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const brandList = Object.values(brands)

  const handleCreateBrand = () => {
     clearActiveBrand()
     router.push('/onboarding')
  }

  const handleSelectBrand = (id: string) => {
     setActiveBrand(id)
     router.push('/workspace')
  }

  return (
    <div className="min-h-screen flex flex-col py-24 px-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto w-full">
      <div className="flex items-end justify-between border-b border-[var(--color-border-default)] pb-8 relative mb-12">
         <div className="absolute top-[-50%] left-[10%] w-[30%] h-[100%] bg-[var(--color-accent-700)] opacity-10 blur-[80px] rounded-full pointer-events-none" />
         
         <div>
            <h1 className="text-3xl font-display font-bold text-[var(--color-text-primary)] mb-2 flex items-center gap-2">
               Agency Workspace <Building2 className="w-6 h-6 text-[var(--color-accent-500)]" />
            </h1>
            <p className="text-[var(--color-text-secondary)]">Manage your clients and elite AI brand strategies in one place.</p>
         </div>
         
         <button onClick={handleCreateBrand} className="h-10 bg-[var(--color-accent-600)] hover:bg-[var(--color-accent-500)] text-white px-6 rounded-[var(--radius-md)] shadow-[0_0_15px_var(--color-accent-glow)] transition-all font-medium text-sm flex items-center gap-2 justify-center transform hover:-translate-y-0.5">
            <Plus className="w-4 h-4" /> New AI Brand
         </button>
      </div>

      {brandList.length === 0 ? (
         <div className="flex flex-col items-center justify-center p-24 text-center border border-dashed border-[var(--color-border-default)] rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] mt-10">
            <div className="w-20 h-20 rounded-full bg-[var(--color-accent-900)]/20 flex items-center justify-center mb-8 border border-[var(--color-accent-500)]/30">
               <Sparkles className="w-10 h-10 text-[var(--color-accent-400)]" />
            </div>
            <h3 className="text-3xl font-bold text-[var(--color-text-primary)] mb-4">No Brands Yet</h3>
            <p className="text-[var(--color-text-secondary)] mb-8 max-w-sm text-lg">Launch your first fractional CMO session by onboarding a new brand's DNA.</p>
            <button onClick={handleCreateBrand} className="px-10 py-4 bg-[var(--color-accent-500)] text-white hover:bg-[var(--color-accent-400)] text-sm font-bold tracking-widest rounded-full transition-all shadow-xl uppercase">
               Initialize First Brand
            </button>
         </div>
      ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {brandList.map((brand) => (
               <div 
                  key={brand.id} 
                  onClick={() => handleSelectBrand(brand.id)}
                  className="group bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-8 hover:border-[var(--color-accent-400)] transition-all cursor-pointer relative overflow-hidden flex flex-col items-start shadow-sm hover:shadow-2xl hover:-translate-y-1"
               >
                  <div className="absolute top-[-20px] right-[-20px] w-32 h-32 bg-[var(--color-accent-500)] opacity-5 blur-[30px] rounded-full group-hover:opacity-10 transition-opacity"></div>
                  
                  <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-hover)] flex items-center justify-center mb-6 border border-[var(--color-border-subtle)] group-hover:bg-[var(--color-bg-base)] transition-colors shadow-sm">
                     <span className="font-display font-bold text-[var(--color-text-primary)] text-3xl">
                        {brand.brandInfo?.name?.charAt(0) || 'B'}
                     </span>
                  </div>

                  <h3 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2 group-hover:text-[var(--color-accent-600)] transition-colors">
                     {brand.brandInfo?.name || 'Unnamed Brand'}
                  </h3>
                  <p className="text-[var(--color-text-secondary)] mb-8">
                     {brand.brandInfo?.industry || 'Unknown Sector'}
                  </p>

                  <div className="mt-auto w-full space-y-4">
                     <div className="flex justify-between items-center text-sm">
                        <span className="text-[var(--color-text-tertiary)] font-bold uppercase tracking-tighter">AI Strategy</span>
                        {brand.strategy ? <span className="text-[var(--color-success)] flex items-center gap-1 font-bold"><CheckCircle2 className="w-4 h-4"/> Mapped</span> : <span className="text-[var(--color-text-muted)] italic">Pending</span>}
                     </div>
                     <div className="w-full h-px bg-[var(--color-border-subtle)]"></div>
                     <div className="flex justify-between items-center text-sm">
                        <span className="text-[var(--color-text-tertiary)] font-bold uppercase tracking-tighter">Calendar</span>
                        <span className="text-[var(--color-text-primary)] font-black">{brand.calendar?.length || 0} Posts</span>
                     </div>
                  </div>
               </div>
            ))}
         </div>
      )}
    </div>
  )
}
