"use server";

/**
 * Server Actions for Cache Revalidation
 *
 * These server actions are used to invalidate cached data after mutations.
 * Supports both Redis (Upstash) and Next.js Data Cache invalidation.
 *
 * Next.js 16 Cache Invalidation Strategy:
 * - revalidateTag: Marks cached data with tag as stale (Data Cache)
 * - revalidatePath: Purges Router Cache for specific paths + revalidates Data Cache
 *
 * Redis Cache Invalidation Strategy:
 * - invalidateCacheByTag: Deletes all Redis keys associated with a tag
 *
 * For post creation, we use revalidatePath('/') which:
 * 1. Purges the Router Cache for home page
 * 2. Revalidates the Data Cache for home page
 * 3. Ensures next navigation to home shows fresh data
 *
 * @see app/utils/cached-posts.ts for cache tags
 * @see app/utils/redis/cache.ts for Redis cache utilities
 * @see https://nextjs.org/docs/app/api-reference/functions/revalidatePath
 * @see https://nextjs.org/docs/app/api-reference/functions/revalidateTag
 */

import { revalidateTag, revalidatePath } from "next/cache";
import { CACHE_TAGS } from "../utils/cached-posts";
import { PROFILE_CACHE_TAGS } from "../utils/cached-profiles";
import { invalidateCacheByTag, cacheTags } from "../utils/redis";

// Cache profile for revalidation - use "default" for standard behavior
const CACHE_PROFILE = "default";

/**
 * Revalidates all posts caches (home and ranked)
 *
 * Invalidates both Redis cache and Next.js Data Cache.
 * Uses revalidatePath to purge Router Cache.
 *
 * Call this after any mutation that affects post data:
 * - Like/Unlike a post
 * - Create a new post
 * - Delete a post
 *
 * @returns Promise<{ success: boolean; revalidatedTags: string[] }>
 */
export async function revalidatePostsCache(): Promise<{
  success: boolean;
  revalidatedTags: string[];
}> {
  try {
    // Layer 1: Invalidate Redis cache (distributed)
    await invalidateCacheByTag(cacheTags.POSTS);
    await invalidateCacheByTag(cacheTags.HOME);
    await invalidateCacheByTag(cacheTags.RANKED);
    // Also invalidate profiles cache since they contain post likes count
    await invalidateCacheByTag(cacheTags.PROFILES);

    // Layer 2: Revalidate Next.js Data Cache tags
    revalidateTag(CACHE_TAGS.POSTS, CACHE_PROFILE);
    revalidateTag(CACHE_TAGS.HOME_POSTS, CACHE_PROFILE);
    // Also revalidate profiles cache for updated likes count on profile pages
    revalidateTag(PROFILE_CACHE_TAGS.PROFILES, CACHE_PROFILE);

    // Layer 3: Purge Router Cache for affected pages
    revalidatePath("/");
    revalidatePath("/rank");

    return {
      success: true,
      revalidatedTags: [CACHE_TAGS.POSTS, CACHE_TAGS.HOME_POSTS, PROFILE_CACHE_TAGS.PROFILES],
    };
  } catch (error) {
    console.error("[Server Action] Error revalidating cache:", error);
    return {
      success: false,
      revalidatedTags: [],
    };
  }
}

/**
 * Revalidates only the home page posts cache
 * 
 * Use this for operations that only affect the home feed (not rankings)
 * 
 * @returns Promise<{ success: boolean }>
 */
export async function revalidateHomeCache(): Promise<{ success: boolean }> {
  try {
    revalidateTag(CACHE_TAGS.HOME_POSTS, CACHE_PROFILE);
    return { success: true };
  } catch (error) {
    console.error("[Server Action] Error revalidating home cache:", error);
    return { success: false };
  }
}

/**
 * Revalidates only the ranked posts cache
 *
 * Use this for operations that primarily affect rankings
 *
 * @returns Promise<{ success: boolean }>
 */
export async function revalidateRankedCache(): Promise<{ success: boolean }> {
  try {
    revalidateTag(CACHE_TAGS.RANKED_POSTS, CACHE_PROFILE);
    return { success: true };
  } catch (error) {
    console.error("[Server Action] Error revalidating ranked cache:", error);
    return { success: false };
  }
}

