"use server";

/**
 * Server Actions for Cached Paginated Posts
 *
 * This module provides server actions for fetching paginated posts
 * with proper Redis caching. Used by TanStack Query's useInfiniteQuery.
 *
 * Architecture:
 * - Each page is cached separately in Redis: posts:home:0:10, posts:home:1:10, etc.
 * - Cache survives deployments (distributed)
 * - Invalidated via tags when likes/posts change
 *
 * Why Server Actions?
 * - Runs on server (access to Redis TCP if using local Redis)
 * - Automatic serialization for client
 * - Works with TanStack Query seamlessly
 */

import { createClient } from "@supabase/supabase-js";
import {
  getFromCache,
  setInCache,
  cacheKeys,
  cacheTags,
  cacheTTL,
} from "../utils/redis";
import { transformSupabasePosts, type SupabasePostRaw } from "../utils/transform-post";
import type { Post } from "../mocks/posts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Response type for paginated posts
 * Includes metadata for infinite scroll
 */
export interface PaginatedPostsResponse {
  posts: Post[];
  nextPage: number | null;
  hasMore: boolean;
  totalFetched: number;
  fromCache: boolean;
}

/**
 * Fetch a page of home posts with Redis caching
 *
 * This is the primary function for infinite scroll.
 * Each page is cached independently for optimal cache utilization.
 *
 * @param page - Page number (0-based)
 * @param limit - Posts per page (default: 10)
 * @returns Paginated posts with metadata
 */
export async function fetchCachedPostsPage(
  page: number = 0,
  limit: number = 10
): Promise<PaginatedPostsResponse> {
  const cacheKey = cacheKeys.homePosts(page, limit);

  // Layer 1: Try Redis first
  const cachedPosts = await getFromCache<Post[]>(cacheKey);

  if (cachedPosts !== null) {
    // Cache HIT - return cached data
    const hasMore = cachedPosts.length === limit;
    return {
      posts: cachedPosts,
      nextPage: hasMore ? page + 1 : null,
      hasMore,
      totalFetched: cachedPosts.length,
      fromCache: true,
    };
  }

  // Cache MISS - fetch from Supabase
  const supabase = getSupabaseClient();
  const from = page * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from("posts_new")
    .select(`
      id, image_url, caption, likes, user, user_id, profile_id, created_at,
      profile:profiles (
        username,
        avatar_url,
        full_name
      ),
      comments(count)
    `)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error(`[CachedPosts] Error fetching page ${page}:`, error);
    return {
      posts: [],
      nextPage: null,
      hasMore: false,
      totalFetched: 0,
      fromCache: false,
    };
  }

  const posts = transformSupabasePosts((data || []) as SupabasePostRaw[]);

  // Store in Redis for next time
  await setInCache(cacheKey, posts, cacheTTL.HOME_POSTS, [
    cacheTags.POSTS,
    cacheTags.HOME,
  ]);

  const hasMore = posts.length === limit;
  return {
    posts,
    nextPage: hasMore ? page + 1 : null,
    hasMore,
    totalFetched: posts.length,
    fromCache: false,
  };
}

/**
 * Prefetch multiple pages at once
 *
 * Useful for warming the cache or prefetching likely-needed pages.
 * Can be called during SSR to ensure first N pages are cached.
 *
 * @param pagesToPrefetch - Number of pages to prefetch (default: 3)
 * @param limit - Posts per page (default: 10)
 */
export async function prefetchHomePages(
  pagesToPrefetch: number = 3,
  limit: number = 10
): Promise<void> {
  const prefetchPromises = Array.from({ length: pagesToPrefetch }, (_, i) =>
    fetchCachedPostsPage(i, limit)
  );

  await Promise.all(prefetchPromises);
  console.log(`[CachedPosts] Prefetched ${pagesToPrefetch} pages`);
}

/**
 * Get total posts count (for UI indicators)
 * Cached separately with longer TTL since it changes less frequently
 */
export async function getTotalPostsCount(): Promise<number> {
  const cacheKey = "posts:count:total";

  const cachedCount = await getFromCache<number>(cacheKey);
  if (cachedCount !== null) {
    return cachedCount;
  }

  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("posts_new")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("[CachedPosts] Error fetching count:", error);
    return 0;
  }

  const totalCount = count || 0;

  // Cache for 5 minutes (changes less frequently)
  await setInCache(cacheKey, totalCount, 300, [cacheTags.POSTS]);

  return totalCount;
}
