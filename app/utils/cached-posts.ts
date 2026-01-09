/**
 * Cached Posts Data Fetchers
 *
 * This module provides cached versions of post fetching functions using:
 * 1. Upstash Redis (distributed cache, survives deployments)
 * 2. Next.js unstable_cache (per-instance cache, backup layer)
 *
 * IMPORTANT: unstable_cache cannot use dynamic data sources like cookies() inside the cached
 * function. We use the browser-compatible Supabase client here since we're only reading
 * public data (no auth required for reading posts).
 *
 * Cache Strategy:
 * - Home posts: 60 second cache (balance freshness with performance)
 * - Ranked posts: 300 second cache (ranking changes less frequently)
 *
 * Data Flow:
 * Request → Redis (fast) → unstable_cache → Supabase (slow)
 *
 * Real-time updates for likes are handled separately in client components.
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/unstable_cache
 * @see app/utils/redis/ for Redis caching layer
 */

import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { posts as mockPosts, type Post } from '../mocks/posts'
import {
  getFromCache,
  setInCache,
  cacheKeys,
  cacheTags,
  cacheTTL,
} from './redis'

// Debug: Check if we're using mocks
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true'

// Cache configuration constants
const HOME_CACHE_REVALIDATE = 60 // 60 seconds for home page
const RANK_CACHE_REVALIDATE = 300 // 5 minutes for ranking page

// Create a standalone Supabase client for cached functions
// This avoids using cookies() which is not allowed inside unstable_cache
// Since we're only reading public posts data, we don't need auth cookies
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Creates a Supabase client for use in cached functions
 * This is a simple client without cookie handling since we're reading public data
 */
function getSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}

/**
 * Fetches posts from Supabase for the home page
 * This is the raw fetch function that will be wrapped with unstable_cache
 *
 * NOTE: This function must not use cookies() or other dynamic data sources
 */
async function fetchHomePosts(page: number = 0, limit: number = 10): Promise<Post[]> {
  console.log(`[CachedPosts] Fetching home posts - page: ${page}, limit: ${limit}`)

  if (USE_MOCKS) {
    console.log('[CachedPosts] Using mock data for home posts')
    const start = page * limit
    const end = start + limit
    return [...mockPosts]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(start, end)
  }

  const supabase = getSupabaseClient()

  const from = page * limit
  const to = from + limit - 1

  // Fetch posts with joined profile data and comment count
  // Using comments(count) to get the count in a single query (avoids N+1)
  const { data, error } = await supabase
    .from('posts_new')
    .select(`
      id, image_url, caption, likes, user, user_id, profile_id, created_at,
      profile:profiles (
        username,
        avatar_url,
        full_name
      ),
      comments(count)
    `)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('[CachedPosts] Error fetching home posts:', error)
    return []
  }

  // Transform the data to ensure profile is a single object (not array)
  // Supabase returns joined data that may be array or object depending on relationship
  // Also extract comment count from nested structure: comments: [{ count: N }]
  const posts = (data || []).map(post => {
    // Extract comment count - Supabase returns { comments: [{ count: N }] }
    const commentsData = post.comments as { count: number }[] | undefined
    const comments_count = commentsData?.[0]?.count ?? 0

    return {
      ...post,
      profile: Array.isArray(post.profile) ? post.profile[0] || null : post.profile,
      comments_count,
      comments: undefined, // Remove the nested comments array from response
    }
  })

  console.log(`[CachedPosts] Fetched ${posts.length} home posts from Supabase`)
  return posts
}

/**
 * Fetches ranked posts from Supabase (posts with >5 likes, sorted by likes)
 * This is the raw fetch function that will be wrapped with unstable_cache
 *
 * NOTE: This function must not use cookies() or other dynamic data sources
 */
async function fetchRankedPosts(): Promise<Post[]> {
  console.log('[CachedPosts] Fetching ranked posts')

  if (USE_MOCKS) {
    console.log('[CachedPosts] Using mock data for ranked posts')
    return [...mockPosts]
      .filter(post => post.likes > 5)
      .sort((a, b) => b.likes - a.likes)
  }

  const supabase = getSupabaseClient()

  // Fetch ranked posts with joined profile data and comment count
  const { data, error } = await supabase
    .from('posts_new')
    .select(`
      id, image_url, caption, likes, user, user_id, profile_id, created_at,
      profile:profiles (
        username,
        avatar_url,
        full_name
      ),
      comments(count)
    `)
    .gt('likes', 5)
    .order('likes', { ascending: false })

  if (error) {
    console.error('[CachedPosts] Error fetching ranked posts:', error)
    return []
  }

  // Transform the data to ensure profile is a single object (not array)
  // Also extract comment count from nested structure: comments: [{ count: N }]
  const posts = (data || []).map(post => {
    // Extract comment count - Supabase returns { comments: [{ count: N }] }
    const commentsData = post.comments as { count: number }[] | undefined
    const comments_count = commentsData?.[0]?.count ?? 0

    return {
      ...post,
      profile: Array.isArray(post.profile) ? post.profile[0] || null : post.profile,
      comments_count,
      comments: undefined, // Remove the nested comments array from response
    }
  })

  console.log(`[CachedPosts] Fetched ${posts.length} ranked posts from Supabase`)
  return posts
}

/**
 * Cached version of fetchHomePosts
 *
 * Uses a two-layer caching strategy:
 * 1. Redis (Upstash) - distributed cache, survives deployments
 * 2. unstable_cache - per-instance fallback
 *
 * The cache key includes the page number to support pagination.
 * Tagged with 'posts' for targeted invalidation via revalidateTag.
 *
 * @param page - Page number (0-based)
 * @param limit - Number of posts per page
 * @returns Promise<Post[]> - Cached posts data
 */
export async function getCachedHomePosts(page: number = 0, limit: number = 10): Promise<Post[]> {
  console.log(`[CachedPosts] getCachedHomePosts called - page: ${page}, limit: ${limit}`)

  const cacheKey = cacheKeys.homePosts(page, limit)

  // Layer 1: Try Redis first (fastest)
  const redisData = await getFromCache<Post[]>(cacheKey)
  if (redisData) {
    console.log(`[CachedPosts] Redis HIT for ${cacheKey}`)
    return redisData
  }

  // Layer 2: Fall back to unstable_cache + Supabase
  console.log(`[CachedPosts] Redis MISS for ${cacheKey}, fetching from Supabase`)
  const cachedFetch = unstable_cache(
    async () => {
      const posts = await fetchHomePosts(page, limit)
      // Store in Redis for next time (with tags for grouped invalidation)
      await setInCache(cacheKey, posts, cacheTTL.HOME_POSTS, [
        cacheTags.POSTS,
        cacheTags.HOME,
      ])
      return posts
    },
    ['home-posts', `page-${page}`, `limit-${limit}`],
    {
      revalidate: HOME_CACHE_REVALIDATE,
      tags: ['posts', 'home-posts'],
    }
  )

  return cachedFetch()
}

/**
 * Cached version of fetchRankedPosts
 *
 * Uses a two-layer caching strategy:
 * 1. Redis (Upstash) - distributed cache, survives deployments
 * 2. unstable_cache - per-instance fallback
 *
 * Tagged with 'ranked-posts' for targeted invalidation.
 *
 * @returns Promise<Post[]> - Cached ranked posts data
 */
export async function getCachedRankedPosts(): Promise<Post[]> {
  console.log('[CachedPosts] getCachedRankedPosts called')

  const cacheKey = cacheKeys.rankedPosts()

  // Layer 1: Try Redis first (fastest)
  const redisData = await getFromCache<Post[]>(cacheKey)
  if (redisData) {
    console.log(`[CachedPosts] Redis HIT for ${cacheKey}`)
    return redisData
  }

  // Layer 2: Fall back to unstable_cache + Supabase
  console.log(`[CachedPosts] Redis MISS for ${cacheKey}, fetching from Supabase`)
  const cachedFetch = unstable_cache(
    async () => {
      const posts = await fetchRankedPosts()
      // Store in Redis for next time (with tags for grouped invalidation)
      await setInCache(cacheKey, posts, cacheTTL.RANKED_POSTS, [
        cacheTags.POSTS,
        cacheTags.RANKED,
      ])
      return posts
    },
    ['ranked-posts'],
    {
      revalidate: RANK_CACHE_REVALIDATE,
      tags: ['posts', 'ranked-posts'],
    }
  )

  return cachedFetch()
}

/**
 * Cache tag constants for use with revalidateTag
 * Export these for use in Server Actions that need to invalidate cache
 */
export const CACHE_TAGS = {
  POSTS: 'posts',
  HOME_POSTS: 'home-posts',
  RANKED_POSTS: 'ranked-posts',
} as const

