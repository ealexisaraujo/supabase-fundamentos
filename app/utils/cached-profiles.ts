/**
 * Cached Profile Data Fetchers
 *
 * This module provides cached versions of profile fetching functions using Next.js unstable_cache.
 * These functions are designed for Server Components and reduce Supabase hits by caching
 * profile data.
 *
 * IMPORTANT: unstable_cache cannot use dynamic data sources like cookies() inside the cached
 * function. We use a standalone Supabase client here since we're only reading public profile
 * data (RLS allows public read for profiles).
 *
 * Cache Strategy:
 * - Individual profiles: 180 second cache (3 minutes)
 * - Profiles change less frequently than posts, so longer cache is appropriate
 *
 * Session-specific data like isOwner is handled in client components.
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/unstable_cache
 */

import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

// Cache configuration constants
const PROFILE_CACHE_REVALIDATE = 180; // 3 minutes for profile pages

// Create a standalone Supabase client for cached functions
// This avoids using cookies() which is not allowed inside unstable_cache
// Since profiles have public read access (RLS), we don't need auth cookies
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Profile type definition
 */
export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  website: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Creates a Supabase client for use in cached functions
 * This is a simple client without cookie handling since we're reading public data
 */
function getSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Fetches a profile from Supabase by username
 * This is the raw fetch function that will be wrapped with unstable_cache
 *
 * NOTE: This function must not use cookies() or other dynamic data sources
 */
async function fetchProfileByUsername(
  username: string
): Promise<Profile | null> {
  console.log(`[CachedProfiles] Fetching profile for username: ${username}`);

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, bio, website, created_at, updated_at")
    .eq("username", username)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned - profile not found
      console.log(`[CachedProfiles] Profile not found for username: ${username}`);
      return null;
    }
    console.error("[CachedProfiles] Error fetching profile:", error);
    return null;
  }

  console.log(`[CachedProfiles] Fetched profile for ${username} from Supabase`);
  return data;
}

/**
 * Cached version of fetchProfileByUsername
 *
 * Uses unstable_cache to cache profile for 3 minutes.
 * The cache key includes the username for targeted caching.
 * Tagged with 'profiles' and 'profile-{username}' for targeted invalidation.
 *
 * @param username - The username to fetch
 * @returns Promise<Profile | null> - Cached profile data or null if not found
 */
export async function getCachedProfile(
  username: string
): Promise<Profile | null> {
  console.log(`[CachedProfiles] getCachedProfile called for: ${username}`);

  // Normalize username for consistent cache keys
  const normalizedUsername = username.toLowerCase();

  // Create a cached function with username-specific cache key
  const cachedFetch = unstable_cache(
    async () => fetchProfileByUsername(normalizedUsername),
    ["profile", normalizedUsername],
    {
      revalidate: PROFILE_CACHE_REVALIDATE,
      tags: ["profiles", `profile-${normalizedUsername}`],
    }
  );

  return cachedFetch();
}

/**
 * Cache tag constants for use with revalidateTag
 * Export these for use in Server Actions that need to invalidate cache
 */
export const PROFILE_CACHE_TAGS = {
  PROFILES: "profiles",
  /**
   * Generate a tag for a specific profile
   * @param username - The username to generate tag for
   */
  profileTag: (username: string) => `profile-${username.toLowerCase()}`,
} as const;

/**
 * Cache configuration export for documentation purposes
 */
export const PROFILE_CACHE_CONFIG = {
  revalidate: PROFILE_CACHE_REVALIDATE,
  description: "Profile cache duration in seconds",
} as const;
