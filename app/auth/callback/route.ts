import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Validates and sanitizes the redirect path to prevent open redirect attacks.
 * Only allows internal paths that start with '/' and don't contain protocol indicators.
 *
 * @param path - The redirect path from the 'next' query parameter
 * @returns A safe redirect path, defaulting to '/' if invalid
 */
function getSafeRedirectPath(path: string | null): string {
  const DEFAULT_REDIRECT = '/'

  // If no path provided, use default
  if (!path) {
    return DEFAULT_REDIRECT
  }

  // Decode the path to catch encoded attacks like %2F%2F (which is //)
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(path)
  } catch {
    // If decoding fails, it's malformed - use default
    return DEFAULT_REDIRECT
  }

  // Security checks:
  // 1. Must start with a single forward slash (internal path)
  // 2. Must NOT start with // (protocol-relative URL)
  // 3. Must NOT contain :// (absolute URL with protocol)
  // 4. Must NOT start with dangerous protocols
  const isInternalPath = decodedPath.startsWith('/') && !decodedPath.startsWith('//')
  const hasProtocol = decodedPath.includes('://')
  const hasDangerousProtocol = /^(javascript|data|vbscript):/i.test(decodedPath)

  if (!isInternalPath || hasProtocol || hasDangerousProtocol) {
    return DEFAULT_REDIRECT
  }

  return decodedPath
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = getSafeRedirectPath(searchParams.get('next'))

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options)
              })
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_error`)
}
