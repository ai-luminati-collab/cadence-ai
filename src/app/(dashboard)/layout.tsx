import { AppShell } from '@/components/layout/AppShell'
import { CreativeDirectorChat } from '@/components/ui/CreativeDirectorChat'

export const maxDuration = 300 // Max limit for all server actions running under this layout

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {children}
      <CreativeDirectorChat />
    </AppShell>
  )
}
