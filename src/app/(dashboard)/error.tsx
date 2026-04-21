'use client'
import { PageErrorBoundary } from '@/components/ui/PageErrorBoundary'
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageErrorBoundary error={error} reset={reset} pageName="Dashboard" />
}
