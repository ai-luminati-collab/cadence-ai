import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    /*
     * api/cron and api/apify/webhook are exempt from session auth:
     * they are called by Vercel Cron / Apify servers (no cookies) and
     * protect themselves with shared secrets instead.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/cron|api/apify/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
