/**
 * Background Sync Service
 *
 * Syncs Redis state to Supabase for durability.
 * Called AFTER Redis update succeeds - never blocks the like operation.
 *
 * Updates TWO things in Supabase:
 * 1. post_ratings table - INSERT or DELETE the rating record
 * 2. posts_new.likes column - SET the count (not increment!)
 *
 * Using SET instead of INCREMENT ensures Supabase always matches Redis.
 * This prevents drift between the two systems.
 *
 * @see app/utils/redis/counters.ts for the main counter logic
 */

import { supabase } from "../client";
import { ensureRedisReady, isRedisConfigured } from "./client";
import { counterKeys } from "./counters";
import { revalidatePostsCache } from "../../actions/revalidate-posts";

/**
 * Sync a like/unlike to Supabase (fire-and-forget)
 *
 * This function:
 * 1. Inserts or deletes the rating record in post_ratings
 * 2. Updates posts_new.likes with the count from Redis
 * 3. Triggers Supabase Realtime (other clients get notified)
 *
 * CRITICAL: This is fire-and-forget. Never await this in useLikeHandler.
 * Call it like: syncLikeToSupabase(...).catch(console.error)
 */
export async function syncLikeToSupabase(
  postId: string,
  sessionId: string,
  isLike: boolean,
  newCount: number
): Promise<void> {
  console.log(
    `[RedisSync] Starting sync: post=${postId}, isLike=${isLike}, count=${newCount}`
  );

  try {
    // Step 1: Update post_ratings table (the rating record)
    if (isLike) {
      // INSERT rating - use upsert to handle race conditions
      const { error: ratingError } = await supabase
        .from("post_ratings")
        .upsert(
          {
            post_id: postId,
            session_id: sessionId,
            created_at: new Date().toISOString(),
          },
          { onConflict: "post_id,session_id" }
        );

      if (ratingError) {
        console.error("[RedisSync] Failed to insert rating:", ratingError);
      }
    } else {
      // DELETE rating
      const { error: ratingError } = await supabase
        .from("post_ratings")
        .delete()
        .eq("post_id", postId)
        .eq("session_id", sessionId);

      if (ratingError) {
        console.error("[RedisSync] Failed to delete rating:", ratingError);
      }
    }

    // Step 2: Update posts_new.likes (SET the count, don't increment)
    // Using SET ensures Supabase matches Redis exactly
    const { error: countError } = await supabase
      .from("posts_new")
      .update({ likes: newCount })
      .eq("id", postId);

    if (countError) {
      console.error("[RedisSync] Failed to update count:", countError);
    }

    console.log(`[RedisSync] Sync complete: post=${postId}, count=${newCount}`);

    // Note: Supabase Realtime will automatically broadcast this UPDATE
    // to all subscribed clients via the existing subscription in usePostLikesSubscription

    // Invalidate server-side caches so next page load has fresh data
    // This prevents the "flash" of old count on refresh
    await revalidatePostsCache();
    console.log(`[RedisSync] Cache invalidated for post=${postId}`);
  } catch (error) {
    // Log but never throw - this is fire-and-forget
    console.error("[RedisSync] Unexpected error during sync:", error);
  }
}

/**
 * Reconcile a single counter between Redis and Supabase
 *
 * Use this for:
 * - Periodic reconciliation jobs
 * - Recovery after Redis restart
 * - Debugging count mismatches
 */
export async function reconcileCounter(postId: string): Promise<void> {
  console.log(`[RedisSync] Reconciling counter for post ${postId}`);

  try {
    // Get count from Supabase (source of truth for reconciliation)
    const { data, error } = await supabase
      .from("posts_new")
      .select("likes")
      .eq("id", postId)
      .single();

    if (error) {
      console.error("[RedisSync] Failed to get count from Supabase:", error);
      return;
    }

    const redis = await ensureRedisReady();
    if (!isRedisConfigured || !redis) {
      console.warn("[RedisSync] Redis not configured, skipping reconciliation");
      return;
    }

    // Set Redis to match Supabase
    const key = counterKeys.postLikes(postId);
    await redis.set(key, data.likes);

    console.log(`[RedisSync] Reconciled post ${postId}: count=${data.likes}`);
  } catch (error) {
    console.error("[RedisSync] Reconciliation failed:", error);
  }
}

/**
 * Reconcile all counters from Supabase to Redis
 *
 * Use this for:
 * - Initial migration
 * - Full recovery after Redis data loss
 */
export async function reconcileAllCounters(): Promise<void> {
  console.log("[RedisSync] Starting full reconciliation...");

  const redis = await ensureRedisReady();
  if (!isRedisConfigured || !redis) {
    console.warn("[RedisSync] Redis not configured, skipping reconciliation");
    return;
  }

  try {
    // Get all posts
    const { data: posts, error: postsError } = await supabase
      .from("posts_new")
      .select("id, likes");

    if (postsError) {
      console.error("[RedisSync] Failed to fetch posts:", postsError);
      return;
    }

    // Update all counters
    for (const post of posts ?? []) {
      const key = counterKeys.postLikes(post.id);
      await redis.set(key, post.likes ?? 0);
    }

    console.log(`[RedisSync] Reconciled ${posts?.length ?? 0} counters`);

    // Get all ratings
    const { data: ratings, error: ratingsError } = await supabase
      .from("post_ratings")
      .select("post_id, session_id");

    if (ratingsError) {
      console.error("[RedisSync] Failed to fetch ratings:", ratingsError);
      return;
    }

    // Rebuild liked sets
    for (const rating of ratings ?? []) {
      const likedSetKey = counterKeys.postLiked(rating.post_id);
      const sessionLikesKey = counterKeys.sessionLikes(rating.session_id);
      await redis.sadd(likedSetKey, rating.session_id);
      await redis.sadd(sessionLikesKey, rating.post_id);
    }

    console.log(`[RedisSync] Reconciled ${ratings?.length ?? 0} rating sets`);
    console.log("[RedisSync] Full reconciliation complete!");
  } catch (error) {
    console.error("[RedisSync] Full reconciliation failed:", error);
  }
}
