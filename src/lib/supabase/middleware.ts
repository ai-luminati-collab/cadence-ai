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

  // Race auth check against a timeout so a slow/down Supabase doesn't 504 the whole app
  let user: any = null
  try {
    const authResult = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 5000))
    ])
    user = authResult.data?.user ?? null
  } catch {
    // Supabase unreachable or slow — let the request through rather than 504
    return supabaseResponse
  }

  // Protect all routes except auth routes (like /login, /signup, /auth path, etc.)
  // and public routes if any.
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    request.nextUrl.pathname !== '/'
  ) {
    // TEMPORARY FIX for development:
    // Because Supabase Magic Links require SMTP setup to work reliably locally,
    // I am bypassing this redirect check ONLY in local dev (`npm run dev`)
    // so you can actually view and test the SaaS pages!
    if (process.env.NODE_ENV !== 'development') {
       const url = request.nextUrl.clone()
       url.pathname = '/login'
       return NextResponse.redirect(url)
    }
  }

  // If user is logged in and tries to access /login, redirect to dashboard or home
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
