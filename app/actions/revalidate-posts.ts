"use server";

/**
 * Server Actions for Cache Revalidation
 * 
 * These server actions are used to invalidate cached data after mutations.
 * They use Next.js revalidateTag to mark specific cached data as stale.
 * 
 * In Next.js 16, revalidateTag requires a second parameter for cache profile:
 * - Use "default" for standard revalidation behavior
 * - Or pass a CacheLifeConfig object with expire time
 * 
 * Usage:
 * After a successful like/unlike operation, call revalidatePostsCache()
 * to ensure the next page visit fetches fresh data.
 * 
 * @see app/utils/cached-posts.ts for cache tags
 * @see https://nextjs.org/docs/app/api-reference/functions/revalidateTag
 */

import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "../utils/cached-posts";

// Cache profile for revalidation - use "default" for standard behavior
const CACHE_PROFILE = "default";

/**
 * Revalidates all posts caches (home and ranked)
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
  console.log("[Server Action] Revalidating posts cache");
  
  try {
    // Revalidate all posts-related caches
    // Next.js 16 requires a cache profile as second argument
    revalidateTag(CACHE_TAGS.POSTS, CACHE_PROFILE);
    
    console.log(`[Server Action] Cache revalidated for tags: ${CACHE_TAGS.POSTS}`);
    
    return {
      success: true,
      revalidatedTags: [CACHE_TAGS.POSTS],
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
  console.log("[Server Action] Revalidating home posts cache");
  
  try {
    // Next.js 16 requires a cache profile as second argument
    revalidateTag(CACHE_TAGS.HOME_POSTS, CACHE_PROFILE);
    console.log(`[Server Action] Home cache revalidated`);
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
  console.log("[Server Action] Revalidating ranked posts cache");
  
  try {
    // Next.js 16 requires a cache profile as second argument
    revalidateTag(CACHE_TAGS.RANKED_POSTS, CACHE_PROFILE);
    console.log(`[Server Action] Ranked cache revalidated`);
    return { success: true };
  } catch (error) {
    console.error("[Server Action] Error revalidating ranked cache:", error);
    return { success: false };
  }
}

