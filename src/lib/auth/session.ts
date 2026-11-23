import { createClient } from '@/lib/supabase/server'

/**
 * Server-side identity checks for Server Actions.
 *
 * Server Actions are public POST endpoints: anyone who finds an action id in
 * the page's JavaScript can call it directly. Every action must therefore
 * verify the caller itself — the page-level redirect in the proxy is not
 * enough. (Next.js 16 data-security guidance.)
 */

export class AuthError extends Error {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message)
    this.name = 'AuthError'
  }
}

/** The signed-in user plus a Supabase client acting as them (RLS applies). */
export async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new AuthError()
  return { supabase, user }
}

/**
 * Gate for actions that spend AI credit. Production always requires a signed-in
 * user. Local development without a session is allowed so the app can be run
 * without Supabase auth, matching requireAuth() for API routes.
 */
export async function guardAI(): Promise<void> {
  if (process.env.NODE_ENV === 'development') {
    try {
      await requireUser()
    } catch {
      return
    }
    return
  }
  await requireUser()
}
