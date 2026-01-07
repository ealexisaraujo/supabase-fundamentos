/**
 * Server-side Supabase client for Server Components
 * 
 * This module provides a Supabase client configured for use in Next.js Server Components.
 * It uses @supabase/ssr for proper cookie handling in SSR contexts.
 * 
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Creates a Supabase client for Server Components (read-only cookie access)
 * 
 * Note: This client is for Server Components where we can read cookies but not set them.
 * For middleware or route handlers that need to set cookies, use a different pattern.
 * 
 * @returns Supabase client configured for server-side use
 */
export async function createClient() {
  // Debug: Log when creating server client
  console.log('[Supabase Server] Creating server-side client')
  
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // Get all cookies for session handling
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // In Server Components, we can't set cookies
          // This is expected behavior - session refresh should happen in middleware
          // Log a warning if this is called unexpectedly
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // This will fail in Server Components, which is expected
            // The warning is only logged in development
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Supabase Server] Cannot set cookies in Server Component')
            }
          }
        },
      },
    }
  )
}

