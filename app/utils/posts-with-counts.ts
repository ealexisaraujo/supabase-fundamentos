/**
 * Posts with Redis Counts Utility
 *
 * This module provides utilities to merge posts with like counts
 * and liked status from Redis.
 *
 * The pattern is:
 * 1. Fetch post content from cache/Supabase (stable data)
 * 2. Fetch counts from Redis (volatile data) via server action
 * 3. Merge them together
 *
 * This ensures all views always show consistent like counts
 * since they all read from the same Redis source.
 *
 * Note: Uses server actions to support local Redis (TCP) which
 * only works on the server side. Upstash (HTTP) works everywhere.
 *
 * @see app/utils/redis/counters.ts for Redis counter operations
 * @see app/actions/redis-counters.ts for server actions
 */

import { fetchCountsFromRedisAction } from "../actions/redis-counters";
import type { Post } from "../mocks/posts";

/**
 * Post without volatile like data
 * This is what we get from cache/Supabase
 */
export type PostWithoutLikes = Omit<Post, "likes" | "isLiked">;

/**
 * Result of fetching counts and liked status from Redis
 */
export interface CountsAndLikedResult {
  countsMap: Map<string, number>;
  likedMap: Map<string, boolean>;
}

/**
 * Fetch like counts and liked status for multiple posts from Redis
 *
 * This is the core function that client components should call
 * to get fresh counter data from Redis.
 *
 * Uses a server action to support local Redis TCP connections
 * (which only work on the server side).
 *
 * IMPORTANT: Server actions don't serialize Maps properly (they become empty objects).
 * The server action returns arrays which we convert back to Maps here.
 *
 * @param postIds - Array of post IDs
 * @param sessionId - Session ID to check liked status
 * @param profileId - Profile ID for authenticated users (for persistent likes)
 * @returns Object with countsMap and likedMap
 */
export async function fetchCountsFromRedis(
  postIds: string[],
  sessionId: string,
  profileId?: string
): Promise<CountsAndLikedResult> {
  if (postIds.length === 0) {
    return {
      countsMap: new Map(),
      likedMap: new Map(),
    };
  }

  // Use server action to fetch from Redis (supports local Redis TCP)
  // Server action returns arrays because Maps don't serialize properly
  const { countsArray, likedArray } = await fetchCountsFromRedisAction(postIds, sessionId, profileId);

  // Reconstruct Maps from arrays
  return {
    countsMap: new Map(countsArray),
    likedMap: new Map(likedArray),
  };
}

/**
 * Merge posts with like counts and liked status from Redis
 *
 * @param posts - Posts (may have stale likes data from cache)
 * @param sessionId - Session ID to check liked status
 * @param profileId - Profile ID for authenticated users (for persistent likes)
 * @returns Posts with fresh likes and isLiked from Redis
 *
 * @example
 * ```ts
 * const cachedPosts = await getCachedPosts(); // May have stale likes
 * const postsWithFreshLikes = await mergePostsWithCounts(cachedPosts, sessionId, profileId);
 * ```
 */
export async function mergePostsWithCounts(
  posts: Array<PostWithoutLikes | Post>,
  sessionId: string,
  profileId?: string
): Promise<Post[]> {
  if (posts.length === 0) {
    return [];
  }

  const postIds = posts.map((post) => String(post.id));
  const { countsMap, likedMap } = await fetchCountsFromRedis(postIds, sessionId, profileId);

  // Merge data
  return posts.map((post) => {
    const id = String(post.id);
    return {
      ...post,
      likes: countsMap.get(id) ?? (post as Post).likes ?? 0,
      isLiked: likedMap.get(id) ?? false,
    };
  });
}

