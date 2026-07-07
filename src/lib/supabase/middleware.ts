import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Use getSession() instead of getUser() in middleware.
  // getSession() reads from the cookie (no network call) so it won't
  // trigger MIDDLEWARE_INVOCATION_TIMEOUT on Vercel's Edge runtime.
  // The heavier getUser() validation happens in API routes via requireAuth().
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const isPublicRoute =
    request.nextUrl.pathname === '/' ||
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/auth')

  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')

  // API routes handle their own auth via requireAuth() — don't redirect them.
  // In dev mode, skip page-level redirect so local testing works without Supabase SMTP.
  if (!session && !isPublicRoute && !isApiRoute && process.env.NODE_ENV !== 'development') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (session && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
