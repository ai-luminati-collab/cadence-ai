import { AppShell } from '@/components/layout/AppShell'
import { CreativeDirectorChat } from '@/components/ui/CreativeDirectorChat'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {children}
      <CreativeDirectorChat />
    </AppShell>
  )
}
