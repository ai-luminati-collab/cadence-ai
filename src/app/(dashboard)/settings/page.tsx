'use client'

import { User, Bell, Shield, Key, Database, CreditCard } from 'lucide-react'

export default function SettingsPage() {

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="border-b border-[var(--color-border-default)] pb-6">
         <h1 className="text-3xl font-display font-bold text-[var(--color-text-primary)] mb-2">Settings</h1>
         <p className="text-[var(--color-text-secondary)]">Manage your account, AI integrations, and billing.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
         {/* Sidebar Navigation */}
         <div className="w-full md:w-64 space-y-1">
            {[
               { icon: User, label: 'Profile', active: true },
               { icon: Bell, label: 'Notifications', active: false },
               { icon: Database, label: 'Workspace', active: false },
               { icon: CreditCard, label: 'Billing', active: false },
            ].map((tab, i) => (
               <button key={i} className={`w-full flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${tab.active ? 'bg-[var(--color-accent-600)] text-[var(--color-text-primary)] shadow-[0_0_15px_var(--color-accent-glow)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'}`}>
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
               </button>
            ))}
         </div>

         {/* Content Area */}
         <div className="flex-1 space-y-6">


            <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-6">
               <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-6">Profile Details</h3>
               
               <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Full Name</label>
                        <input type="text" defaultValue="Yash" className="w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-md px-3 py-2 text-sm text-[var(--color-text-primary)] focus:ring-1 focus:ring-[var(--color-accent-500)] outline-none" />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Email Address</label>
                        <input type="email" disabled defaultValue="yash@example.com" className="w-full bg-[var(--color-bg-hover)] border border-[var(--color-border-default)] rounded-md px-3 py-2 text-sm text-[var(--color-text-tertiary)] outline-none cursor-not-allowed" />
                     </div>
                  </div>
               </div>
            </div>

            <div className="bg-[var(--color-error)]/5 border border-[var(--color-error)]/20 rounded-[var(--radius-lg)] p-6 flex items-start justify-between">
               <div>
                  <h3 className="text-lg font-bold text-[var(--color-error)] mb-1">Danger Zone</h3>
                  <p className="text-sm text-[var(--color-error)]/70">Permanently delete your account and all generated strategies.</p>
               </div>
               <button className="px-4 py-2 border border-[var(--color-error)]/30 text-[var(--color-error)] hover:bg-[var(--color-error)]/10 rounded-lg text-sm font-medium transition-colors">
                  Delete Account
               </button>
            </div>
         </div>
      </div>
    </div>
  )
}
