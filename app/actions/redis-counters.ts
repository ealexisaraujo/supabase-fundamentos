"use server";

/**
 * Server Actions for Redis Counter Operations
 *
 * These server actions allow client components to interact with Redis
 * through the server, enabling local Redis TCP support.
 *
 * With Upstash (HTTP), counter operations could run directly in the browser.
 * With local Redis (TCP), they must run on the server.
 */

import {
  getLikeCounts,
  getLikedStatuses,
  toggleLike,
  type LikeResult,
} from "../utils/redis/counters";

export interface CountsAndLikedResult {
  countsMap: Map<string, number>;
  likedMap: Map<string, boolean>;
}

/**
 * Fetch counts and liked status for multiple posts
 * Called from client components via server action
 */
export async function fetchCountsFromRedisAction(
  postIds: string[],
  sessionId: string
): Promise<CountsAndLikedResult> {
  if (!sessionId || postIds.length === 0) {
    return {
      countsMap: new Map<string, number>(),
      likedMap: new Map<string, boolean>(),
    };
  }

  // Fetch both counts and liked status in parallel
  const [countsMap, likedMap] = await Promise.all([
    getLikeCounts(postIds),
    getLikedStatuses(postIds, sessionId),
  ]);

  return { countsMap, likedMap };
}

/**
 * Toggle like for a post
 * Called from client components via server action
 */
export async function toggleLikeAction(
  postId: string,
  sessionId: string
): Promise<LikeResult> {
  return toggleLike(postId, sessionId);
}
