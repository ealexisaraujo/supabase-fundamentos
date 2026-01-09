/**
 * Cached Profile Data Fetchers
 *
 * This module provides cached versions of profile fetching functions using:
 * 1. Upstash Redis (distributed cache, survives deployments)
 * 2. Next.js unstable_cache (per-instance cache, backup layer)
 *
 * IMPORTANT: unstable_cache cannot use dynamic data sources like cookies() inside the cached
 * function. We use a standalone Supabase client here since we're only reading public profile
 * data (RLS allows public read for profiles).
 *
 * Cache Strategy:
 * - Individual profiles: 180 second cache (3 minutes)
 * - Profiles change less frequently than posts, so longer cache is appropriate
 *
 * Data Flow:
 * Request → Redis (fast) → unstable_cache → Supabase (slow)
 *
 * Session-specific data like isOwner is handled in client components.
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/unstable_cache
 * @see app/utils/redis/ for Redis caching layer
 */

import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import {
  getFromCache,
  setInCache,
  cacheKeys,
  cacheTags,
  cacheTTL,
} from "./redis";

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
  // User's posts (populated when fetching with posts)
  posts?: ProfilePost[];
  post_count?: number;
}

/**
 * Simplified post type for profile wall display
 */
export interface ProfilePost {
  id: string;
  image_url: string;
  caption: string;
  likes: number;
  created_at: string;
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
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, bio, website, created_at, updated_at")
    .eq("username", username)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned - profile not found
      return null;
    }
    console.error("[CachedProfiles] Error fetching profile:", error);
    return null;
  }

  return data;
}

/**
 * Cached version of fetchProfileByUsername
 *
 * Uses a two-layer caching strategy:
 * 1. Redis (Upstash) - distributed cache, survives deployments
 * 2. unstable_cache - per-instance fallback
 *
 * The cache key includes the username for targeted caching.
 * Tagged with 'profiles' and 'profile-{username}' for targeted invalidation.
 *
 * @param username - The username to fetch
 * @returns Promise<Profile | null> - Cached profile data or null if not found
 */
export async function getCachedProfile(
  username: string
): Promise<Profile | null> {
  // Normalize username for consistent cache keys
  const normalizedUsername = username.toLowerCase();
  const cacheKey = cacheKeys.profile(normalizedUsername);

  // Layer 1: Try Redis first (fastest)
  const redisData = await getFromCache<Profile>(cacheKey);
  if (redisData) {
    return redisData;
  }

  // Layer 2: Fall back to unstable_cache + Supabase
  const cachedFetch = unstable_cache(
    async () => {
      const profile = await fetchProfileByUsername(normalizedUsername);
      // Store in Redis for next time (only if profile exists)
      if (profile) {
        await setInCache(cacheKey, profile, cacheTTL.PROFILE, [
          cacheTags.PROFILES,
        ]);
      }
      return profile;
    },
    ["profile", normalizedUsername],
    {
      revalidate: PROFILE_CACHE_REVALIDATE,
      tags: ["profiles", `profile-${normalizedUsername}`],
    }
  );

  return cachedFetch();
}

/**
 * Fetches a profile with user's posts from Supabase by username
 * This is the raw fetch function that will be wrapped with unstable_cache
 */
async function fetchProfileWithPosts(
  username: string
): Promise<Profile | null> {
  const supabase = getSupabaseClient();

  // First fetch the profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, bio, website, created_at, updated_at")
    .eq("username", username)
    .single();

  if (profileError) {
    if (profileError.code === "PGRST116") {
      return null;
    }
    console.error("[CachedProfiles] Error fetching profile:", profileError);
    return null;
  }

  // Then fetch user's posts using the profile id
  const { data: posts, error: postsError } = await supabase
    .from("posts_new")
    .select("id, image_url, caption, likes, created_at")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (postsError) {
    console.error("[CachedProfiles] Error fetching user posts:", postsError);
  }

  return {
    ...profile,
    posts: posts || [],
    post_count: posts?.length || 0,
  };
}

/**
 * Cached version of fetchProfileWithPosts
 *
 * Fetches a profile along with the user's posts for the profile wall.
 *
 * @param username - The username to fetch
 * @returns Promise<Profile | null> - Cached profile with posts or null if not found
 */
export async function getCachedProfileWithPosts(
  username: string
): Promise<Profile | null> {
  const normalizedUsername = username.toLowerCase();
  const cacheKey = `${cacheKeys.profile(normalizedUsername)}:with-posts`;

  // Layer 1: Try Redis first
  const redisData = await getFromCache<Profile>(cacheKey);
  if (redisData) {
    return redisData;
  }

  // Layer 2: Fall back to unstable_cache + Supabase
  const cachedFetch = unstable_cache(
    async () => {
      const profile = await fetchProfileWithPosts(normalizedUsername);
      if (profile) {
        await setInCache(cacheKey, profile, cacheTTL.PROFILE, [
          cacheTags.PROFILES,
        ]);
      }
      return profile;
    },
    ["profile-with-posts", normalizedUsername],
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
