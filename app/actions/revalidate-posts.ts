"use server";

/**
 * Server Actions for Cache Revalidation
 *
 * These server actions are used to invalidate cached data after mutations.
 *
 * Next.js 16 Cache Invalidation Strategy:
 * - revalidateTag: Marks cached data with tag as stale (Data Cache)
 * - revalidatePath: Purges Router Cache for specific paths + revalidates Data Cache
 *
 * For post creation, we use revalidatePath('/') which:
 * 1. Purges the Router Cache for home page
 * 2. Revalidates the Data Cache for home page
 * 3. Ensures next navigation to home shows fresh data
 *
 * @see app/utils/cached-posts.ts for cache tags
 * @see https://nextjs.org/docs/app/api-reference/functions/revalidatePath
 * @see https://nextjs.org/docs/app/api-reference/functions/revalidateTag
 */

import { revalidateTag, revalidatePath } from "next/cache";
import { CACHE_TAGS } from "../utils/cached-posts";

// Cache profile for revalidation - use "default" for standard behavior
const CACHE_PROFILE = "default";

/**
 * Revalidates all posts caches (home and ranked)
 *
 * Uses revalidatePath to purge both Router Cache and Data Cache.
 * This is the most reliable way to ensure fresh data on navigation.
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
    // Revalidate tags (Data Cache)
    revalidateTag(CACHE_TAGS.POSTS, CACHE_PROFILE);
    revalidateTag(CACHE_TAGS.HOME_POSTS, CACHE_PROFILE);

    // Purge Router Cache for affected pages
    // This is critical for client-side navigation to show fresh data
    revalidatePath("/");
    revalidatePath("/rank");

    console.log(
      `[Server Action] Cache revalidated for paths: /, /rank and tags: ${CACHE_TAGS.POSTS}`
    );

    return {
      success: true,
      revalidatedTags: [CACHE_TAGS.POSTS, CACHE_TAGS.HOME_POSTS],
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

