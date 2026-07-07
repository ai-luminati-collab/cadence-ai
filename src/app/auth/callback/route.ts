import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function sanitizeRedirectPath(path: string | null): string {
  if (!path) return '/'
  if (!path.startsWith('/')) return '/'
  if (path.startsWith('//')) return '/'
  if (path.includes('://')) return '/'
  return path
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = sanitizeRedirectPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
