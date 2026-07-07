import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEV_USER = { id: 'dev-user', email: 'dev@localhost' } as const

export async function requireAuth() {
  // In development, skip auth so local testing works without Supabase SMTP/magic links.
  // Production always enforces real auth.
  if (process.env.NODE_ENV === 'development') {
    return { user: DEV_USER as any, error: null }
  }

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { user, error: null }
}
