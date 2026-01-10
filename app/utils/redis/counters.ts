/**
 * Redis Counter Service
 *
 * Source of truth for like counts. All views read from here.
 * Supabase is updated async for durability.
 *
 * Key Schema:
 * - post:likes:{postId} = "447" (String with atomic INCR/DECR)
 * - post:liked:{postId} = Set<sessionId> (Set of sessions that liked)
 * - session:likes:{sessionId} = Set<postId> (Set of posts liked by session)
 *
 * @see app/utils/redis/sync.ts for background Supabase sync
 */

import { ensureRedisReady } from "./client";
import { supabase } from "../client";

export interface LikeResult {
  success: boolean;
  newCount: number;
  isLiked: boolean;
  error?: string;
}

/**
 * Key generators for counter-related Redis keys
 */
export const counterKeys = {
  /** Like count per post */
  postLikes: (postId: string) => `post:likes:${postId}`,
  /** Set of session IDs that liked a post */
  postLiked: (postId: string) => `post:liked:${postId}`,
  /** Set of post IDs liked by a session */
  sessionLikes: (sessionId: string) => `session:likes:${sessionId}`,
};

/**
 * Toggle like for a post (atomic operation)
 * Returns new count and liked status
 *
 * This is the PRIMARY function for liking/unliking.
 * It uses atomic Redis operations to ensure consistency.
 */
export async function toggleLike(
  postId: string,
  sessionId: string
): Promise<LikeResult> {
  if (!sessionId) {
    return {
      success: false,
      newCount: 0,
      isLiked: false,
      error: "Session ID is required",
    };
  }

  console.log(
    `[RedisCounter] Toggling like for post ${postId} by session ${sessionId.slice(0, 8)}...`
  );

  // Get Redis client (supports both Upstash and local Redis)
  const redis = await ensureRedisReady();

  // Fallback to Supabase if Redis is not available
  if (!redis) {
    console.log("[RedisCounter] Redis not available, falling back to Supabase");
    return toggleLikeViaSupabase(postId, sessionId);
  }

  try {
    const likeKey = counterKeys.postLikes(postId);
    const likedSetKey = counterKeys.postLiked(postId);
    const sessionLikesKey = counterKeys.sessionLikes(sessionId);

    // Check if counter exists in Redis, if not initialize from Supabase
    const existingCount = await redis.get<number>(likeKey);
    if (existingCount === null) {
      console.log(`[RedisCounter] Counter not found for post ${postId}, initializing from Supabase`);
      const { data } = await supabase
        .from("posts_new")
        .select("likes")
        .eq("id", postId)
        .single();
      const initialCount = data?.likes ?? 0;
      await redis.set(likeKey, initialCount);
      console.log(`[RedisCounter] Initialized counter to ${initialCount}`);
    }

    // Check if session already liked this post
    const isCurrentlyLiked = await redis.sismember(likedSetKey, sessionId);

    let newCount: number;
    let isLiked: boolean;

    if (isCurrentlyLiked) {
      // Unlike: decrement count and remove from sets
      newCount = await redis.decr(likeKey);
      await redis.srem(likedSetKey, sessionId);
      await redis.srem(sessionLikesKey, postId);
      isLiked = false;
      console.log(`[RedisCounter] Unlike successful, new count: ${newCount}`);
    } else {
      // Like: increment count and add to sets
      newCount = await redis.incr(likeKey);
      await redis.sadd(likedSetKey, sessionId);
      await redis.sadd(sessionLikesKey, postId);
      isLiked = true;
      console.log(`[RedisCounter] Like successful, new count: ${newCount}`);
    }

    // Ensure count doesn't go negative (shouldn't happen but safety check)
    if (newCount < 0) {
      await redis.set(likeKey, 0);
      newCount = 0;
    }

    return {
      success: true,
      newCount,
      isLiked,
    };
  } catch (error) {
    console.error("[RedisCounter] Error toggling like:", error);
    // Fallback to Supabase on error
    return toggleLikeViaSupabase(postId, sessionId);
  }
}

/**
 * Fallback toggle like via Supabase RPC
 * Used when Redis is unavailable
 */
async function toggleLikeViaSupabase(
  postId: string,
  sessionId: string
): Promise<LikeResult> {
  console.log("[RedisCounter] Using Supabase fallback for toggle");

  const { data, error } = await supabase.rpc("toggle_post_like", {
    p_post_id: postId,
    p_session_id: sessionId,
  });

  if (error) {
    console.error("[RedisCounter] Supabase fallback error:", error);
    return {
      success: false,
      newCount: 0,
      isLiked: false,
      error: error.message,
    };
  }

  const result = data as {
    success: boolean;
    isLiked: boolean;
    newLikeCount: number;
    error?: string;
  };

  return {
    success: result.success,
    newCount: result.newLikeCount,
    isLiked: result.isLiked,
    error: result.error,
  };
}

/**
 * Get like count for a single post
 * Falls back to Supabase if Redis unavailable
 */
export async function getLikeCount(postId: string): Promise<number> {
  const redis = await ensureRedisReady();

  if (!redis) {
    // Fallback to Supabase
    const { data, error } = await supabase
      .from("posts_new")
      .select("likes")
      .eq("id", postId)
      .single();

    if (error) {
      console.error("[RedisCounter] Supabase fallback error:", error);
      return 0;
    }

    return data?.likes ?? 0;
  }

  try {
    const key = counterKeys.postLikes(postId);
    const count = await redis.get<number>(key);

    if (count === null) {
      // Counter not in Redis, sync from Supabase
      return syncCounterFromDB(postId);
    }

    return count;
  } catch (error) {
    console.error("[RedisCounter] Error getting like count:", error);
    // Fallback to Supabase
    const { data } = await supabase
      .from("posts_new")
      .select("likes")
      .eq("id", postId)
      .single();
    return data?.likes ?? 0;
  }
}

/**
 * Get like counts for multiple posts (batch)
 * Uses MGET for efficiency
 */
export async function getLikeCounts(
  postIds: string[]
): Promise<Map<string, number>> {
  const countsMap = new Map<string, number>();

  if (postIds.length === 0) {
    return countsMap;
  }

  const redis = await ensureRedisReady();

  if (!redis) {
    // Fallback to Supabase
    console.log("[RedisCounter] Using Supabase fallback for batch counts");
    const { data, error } = await supabase
      .from("posts_new")
      .select("id, likes")
      .in("id", postIds);

    if (error) {
      console.error("[RedisCounter] Supabase batch fallback error:", error);
      postIds.forEach((id) => countsMap.set(id, 0));
      return countsMap;
    }

    data?.forEach((post) => {
      countsMap.set(post.id, post.likes ?? 0);
    });

    // Fill missing with 0
    postIds.forEach((id) => {
      if (!countsMap.has(id)) {
        countsMap.set(id, 0);
      }
    });

    return countsMap;
  }

  try {
    const keys = postIds.map((id) => counterKeys.postLikes(id));
    const counts = await redis.mget<number>(...keys);

    // Track which posts need to be synced from DB
    const missingPostIds: string[] = [];

    postIds.forEach((id, index) => {
      const count = counts[index];
      if (count === null) {
        missingPostIds.push(id);
        countsMap.set(id, 0); // Temporary
      } else {
        countsMap.set(id, count);
      }
    });

    // Sync missing counters from DB in background
    if (missingPostIds.length > 0) {
      console.log(
        `[RedisCounter] ${missingPostIds.length} counters missing, syncing from DB`
      );
      // Sync in background (don't await)
      syncMissingCounters(missingPostIds, countsMap).catch((err) => {
        console.error("[RedisCounter] Background sync error:", err);
      });
    }

    return countsMap;
  } catch (error) {
    console.error("[RedisCounter] Error getting batch like counts:", error);
    // Fallback to Supabase
    const { data } = await supabase
      .from("posts_new")
      .select("id, likes")
      .in("id", postIds);

    data?.forEach((post) => {
      countsMap.set(post.id, post.likes ?? 0);
    });

    postIds.forEach((id) => {
      if (!countsMap.has(id)) {
        countsMap.set(id, 0);
      }
    });

    return countsMap;
  }
}

/**
 * Helper to sync missing counters from DB
 */
async function syncMissingCounters(
  postIds: string[],
  countsMap: Map<string, number>
): Promise<void> {
  const redis = await ensureRedisReady();
  if (!redis) return;

  const { data, error } = await supabase
    .from("posts_new")
    .select("id, likes")
    .in("id", postIds);

  if (error) {
    console.error("[RedisCounter] Error syncing missing counters:", error);
    return;
  }

  for (const post of data ?? []) {
    const key = counterKeys.postLikes(post.id);
    await redis.set(key, post.likes ?? 0);
    countsMap.set(post.id, post.likes ?? 0);
  }

  console.log(`[RedisCounter] Synced ${data?.length ?? 0} missing counters`);
}

/**
 * Check if session liked a post
 */
export async function isLikedBySession(
  postId: string,
  sessionId: string
): Promise<boolean> {
  if (!sessionId) return false;

  const redis = await ensureRedisReady();

  if (!redis) {
    // Fallback to Supabase
    const { data, error } = await supabase
      .from("post_ratings")
      .select("post_id")
      .eq("post_id", postId)
      .eq("session_id", sessionId)
      .maybeSingle();

    if (error) {
      console.error("[RedisCounter] Supabase fallback error:", error);
      return false;
    }

    return data !== null;
  }

  try {
    const likedSetKey = counterKeys.postLiked(postId);
    const isLiked = await redis.sismember(likedSetKey, sessionId);
    return Boolean(isLiked);
  } catch (error) {
    console.error("[RedisCounter] Error checking liked status:", error);
    return false;
  }
}

/**
 * Get liked status for multiple posts (batch)
 */
export async function getLikedStatuses(
  postIds: string[],
  sessionId: string
): Promise<Map<string, boolean>> {
  const likedMap = new Map<string, boolean>();

  if (!sessionId || postIds.length === 0) {
    postIds.forEach((id) => likedMap.set(id, false));
    return likedMap;
  }

  const redis = await ensureRedisReady();

  if (!redis) {
    // Fallback to Supabase
    console.log("[RedisCounter] Using Supabase fallback for batch liked status");
    const { data, error } = await supabase
      .from("post_ratings")
      .select("post_id")
      .eq("session_id", sessionId)
      .in("post_id", postIds);

    if (error) {
      console.error("[RedisCounter] Supabase batch fallback error:", error);
      postIds.forEach((id) => likedMap.set(id, false));
      return likedMap;
    }

    // Initialize all as not liked
    postIds.forEach((id) => likedMap.set(id, false));

    // Mark liked posts
    data?.forEach((rating) => {
      likedMap.set(rating.post_id, true);
    });

    return likedMap;
  }

  try {
    // Check each post's liked set for the session
    // Using pipeline would be more efficient but Upstash doesn't support it directly
    // For now, we'll use Promise.all
    const checks = await Promise.all(
      postIds.map(async (postId) => {
        const likedSetKey = counterKeys.postLiked(postId);
        const isLiked = await redis.sismember(likedSetKey, sessionId);
        return { postId, isLiked: Boolean(isLiked) };
      })
    );

    checks.forEach(({ postId, isLiked }) => {
      likedMap.set(postId, isLiked);
    });

    return likedMap;
  } catch (error) {
    console.error("[RedisCounter] Error getting batch liked status:", error);
    // Fallback to Supabase
    const { data } = await supabase
      .from("post_ratings")
      .select("post_id")
      .eq("session_id", sessionId)
      .in("post_id", postIds);

    postIds.forEach((id) => likedMap.set(id, false));
    data?.forEach((rating) => {
      likedMap.set(rating.post_id, true);
    });

    return likedMap;
  }
}

/**
 * Sync a single counter from Supabase to Redis (for recovery)
 */
export async function syncCounterFromDB(postId: string): Promise<number> {
  console.log(`[RedisCounter] Syncing counter from DB for post ${postId}`);

  const { data, error } = await supabase
    .from("posts_new")
    .select("likes")
    .eq("id", postId)
    .single();

  if (error) {
    console.error("[RedisCounter] Error syncing counter from DB:", error);
    return 0;
  }

  const count = data?.likes ?? 0;

  const redis = await ensureRedisReady();
  if (redis) {
    const key = counterKeys.postLikes(postId);
    await redis.set(key, count);
    console.log(`[RedisCounter] Synced post ${postId}: count=${count}`);
  }

  return count;
}

/**
 * Initialize all counters from Supabase (cold start)
 * This should be run once when Redis is empty
 */
export async function initializeCountersFromDB(): Promise<void> {
  const redis = await ensureRedisReady();

  if (!redis) {
    console.log("[RedisCounter] Redis not configured, skipping initialization");
    return;
  }

  console.log("[RedisCounter] Initializing all counters from Supabase...");

  try {
    // Get all posts with likes
    const { data: posts, error: postsError } = await supabase
      .from("posts_new")
      .select("id, likes");

    if (postsError) {
      console.error("[RedisCounter] Error fetching posts:", postsError);
      return;
    }

    // Set counters in Redis
    for (const post of posts ?? []) {
      const key = counterKeys.postLikes(post.id);
      await redis.set(key, post.likes ?? 0);
    }

    console.log(`[RedisCounter] Initialized ${posts?.length ?? 0} post counters`);

    // Get all ratings and build liked sets
    const { data: ratings, error: ratingsError } = await supabase
      .from("post_ratings")
      .select("post_id, session_id");

    if (ratingsError) {
      console.error("[RedisCounter] Error fetching ratings:", ratingsError);
      return;
    }

    // Build liked sets
    for (const rating of ratings ?? []) {
      const likedSetKey = counterKeys.postLiked(rating.post_id);
      const sessionLikesKey = counterKeys.sessionLikes(rating.session_id);
      await redis.sadd(likedSetKey, rating.session_id);
      await redis.sadd(sessionLikesKey, rating.post_id);
    }

    console.log(`[RedisCounter] Initialized ${ratings?.length ?? 0} liked sets`);
    console.log("[RedisCounter] Initialization complete!");
  } catch (error) {
    console.error("[RedisCounter] Error during initialization:", error);
  }
}
