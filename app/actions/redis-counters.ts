"use server";

/**
 * Server Actions for Redis Counter Operations
 *
 * These server actions allow client components to interact with Redis
 * through the server, enabling local Redis TCP support.
 *
 * With Upstash (HTTP), counter operations could run directly in the browser.
 * With local Redis (TCP), they must run on the server.
 *
 * IMPORTANT: Maps don't serialize properly in server actions (become empty objects).
 * We serialize as arrays and reconstruct on the client side.
 */

import {
  getLikeCounts,
  getLikedStatuses,
  toggleLike,
  type LikeResult,
} from "../utils/redis/counters";
import { revalidatePostsCache } from "./revalidate-posts";

/**
 * Serialized result format that survives JSON serialization
 * Maps are converted to arrays: [key, value][]
 */
export interface CountsAndLikedResultSerialized {
  countsArray: [string, number][];
  likedArray: [string, boolean][];
}

/**
 * Fetch counts and liked status for multiple posts
 * Called from client components via server action
 *
 * Returns arrays instead of Maps because Maps don't serialize properly
 * in server action responses (they become empty objects {}).
 */
export async function fetchCountsFromRedisAction(
  postIds: string[],
  sessionId: string
): Promise<CountsAndLikedResultSerialized> {
  if (!sessionId || postIds.length === 0) {
    return {
      countsArray: [],
      likedArray: [],
    };
  }

  // Fetch both counts and liked status in parallel
  const [countsMap, likedMap] = await Promise.all([
    getLikeCounts(postIds),
    getLikedStatuses(postIds, sessionId),
  ]);

  // Convert Maps to arrays for proper JSON serialization
  return {
    countsArray: Array.from(countsMap.entries()),
    likedArray: Array.from(likedMap.entries()),
  };
}

/**
 * Toggle like for a post
 * Called from client components via server action
 *
 * After a successful like/unlike, invalidates the posts cache
 * to ensure rank page and home page show fresh data.
 */
export async function toggleLikeAction(
  postId: string,
  sessionId: string
): Promise<LikeResult> {
  const result = await toggleLike(postId, sessionId);

  // Invalidate cache after successful like/unlike
  // This ensures rank page and home page fetch fresh data
  if (result.success) {
    revalidatePostsCache().catch((err) => {
      console.error("[toggleLikeAction] Error revalidating cache:", err);
    });
  }

  return result;
}
