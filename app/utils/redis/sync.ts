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
 * Identity Strategy:
 * - For authenticated users (profileId provided): store with profile_id
 * - For anonymous users: store with session_id
 * This ensures authenticated users' likes persist across devices.
 *
 * @see app/utils/redis/counters.ts for the main counter logic
 */

import { supabase } from "../client";
import { ensureRedisReady, isRedisConfigured } from "./client";
import { counterKeys, getLikeIdentifier } from "./counters";

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
 *
 * @param postId - The post being liked/unliked
 * @param sessionId - Browser session ID (always required)
 * @param isLike - true for like, false for unlike
 * @param newCount - The new like count from Redis
 * @param profileId - User profile ID (optional, for authenticated users)
 */
export async function syncLikeToSupabase(
  postId: string,
  sessionId: string,
  isLike: boolean,
  newCount: number,
  profileId?: string
): Promise<void> {
  const identifierType = profileId ? "profile" : "session";
  const shortId = profileId ? profileId.slice(0, 8) : sessionId.slice(0, 8);

  console.log(
    `[RedisSync] Starting sync: post=${postId}, ${identifierType}=${shortId}, isLike=${isLike}, count=${newCount}`
  );

  try {
    // Step 1: Update post_ratings table (the rating record)
    if (isLike) {
      if (profileId) {
        // Authenticated user: store with profile_id (no session_id)
        // First check if like already exists to avoid unique constraint errors
        const { data: existingLike } = await supabase
          .from("post_ratings")
          .select("id")
          .eq("post_id", postId)
          .eq("profile_id", profileId)
          .maybeSingle();

        if (!existingLike) {
          const { error: ratingError } = await supabase
            .from("post_ratings")
            .insert({
              post_id: postId,
              profile_id: profileId,
              session_id: null, // Explicitly null for profile-based likes
              created_at: new Date().toISOString(),
            });

          if (ratingError && ratingError.code !== "23505") {
            // 23505 = unique violation, ignore since like already exists
            console.error("[RedisSync] Failed to insert profile rating:", ratingError);
          }
        }
      } else {
        // Anonymous user: store with session_id (original behavior)
        const { error: ratingError } = await supabase
          .from("post_ratings")
          .upsert(
            {
              post_id: postId,
              session_id: sessionId,
              profile_id: null, // Explicitly null for session-based likes
              created_at: new Date().toISOString(),
            },
            { onConflict: "post_id,session_id" }
          );

        if (ratingError) {
          console.error("[RedisSync] Failed to insert session rating:", ratingError);
        }
      }
    } else {
      // DELETE rating - based on auth status
      if (profileId) {
        const { error: ratingError } = await supabase
          .from("post_ratings")
          .delete()
          .eq("post_id", postId)
          .eq("profile_id", profileId);

        if (ratingError) {
          console.error("[RedisSync] Failed to delete profile rating:", ratingError);
        }
      } else {
        const { error: ratingError } = await supabase
          .from("post_ratings")
          .delete()
          .eq("post_id", postId)
          .eq("session_id", sessionId);

        if (ratingError) {
          console.error("[RedisSync] Failed to delete session rating:", ratingError);
        }
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
 *
 * Handles both session-based and profile-based likes:
 * - session_id likes → session:{sessionId} identifier
 * - profile_id likes → profile:{profileId} identifier
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

    // Get all ratings (including both session_id and profile_id)
    const { data: ratings, error: ratingsError } = await supabase
      .from("post_ratings")
      .select("post_id, session_id, profile_id");

    if (ratingsError) {
      console.error("[RedisSync] Failed to fetch ratings:", ratingsError);
      return;
    }

    let sessionLikes = 0;
    let profileLikes = 0;

    // Rebuild liked sets - handle both session and profile identifiers
    for (const rating of ratings ?? []) {
      const likedSetKey = counterKeys.postLiked(rating.post_id);

      if (rating.profile_id) {
        // Profile-based like
        const identifier = `profile:${rating.profile_id}`;
        const profileLikesKey = counterKeys.profileLikes(rating.profile_id);
        await redis.sadd(likedSetKey, identifier);
        await redis.sadd(profileLikesKey, rating.post_id);
        profileLikes++;
      } else if (rating.session_id) {
        // Session-based like
        const identifier = `session:${rating.session_id}`;
        const sessionLikesKey = counterKeys.sessionLikes(rating.session_id);
        await redis.sadd(likedSetKey, identifier);
        await redis.sadd(sessionLikesKey, rating.post_id);
        sessionLikes++;
      }
    }

    console.log(`[RedisSync] Reconciled ${sessionLikes} session likes, ${profileLikes} profile likes`);
    console.log("[RedisSync] Full reconciliation complete!");
  } catch (error) {
    console.error("[RedisSync] Full reconciliation failed:", error);
  }
}

/**
 * Migrate session likes to profile (called on login)
 *
 * When a user logs in, this function:
 * 1. Finds all session-based likes in Redis
 * 2. Re-keys them to profile-based identifiers
 * 3. Updates Supabase to use profile_id instead of session_id
 *
 * This ensures that likes made before login are preserved after login.
 *
 * @param sessionId - The browser session ID
 * @param profileId - The user's profile ID
 */
export async function migrateSessionLikesToProfile(
  sessionId: string,
  profileId: string
): Promise<void> {
  console.log(`[RedisSync] Migrating session ${sessionId.slice(0, 8)} likes to profile ${profileId.slice(0, 8)}`);

  const redis = await ensureRedisReady();

  try {
    // Step 1: Get all posts liked by this session from Supabase
    const { data: sessionLikes, error } = await supabase
      .from("post_ratings")
      .select("id, post_id")
      .eq("session_id", sessionId);

    if (error) {
      console.error("[RedisSync] Failed to fetch session likes:", error);
      return;
    }

    if (!sessionLikes || sessionLikes.length === 0) {
      console.log("[RedisSync] No session likes to migrate");
      return;
    }

    console.log(`[RedisSync] Found ${sessionLikes.length} session likes to migrate`);

    // Step 2: Update each like in Supabase
    for (const like of sessionLikes) {
      // Check if profile already has this like
      const { data: existingProfileLike } = await supabase
        .from("post_ratings")
        .select("id")
        .eq("post_id", like.post_id)
        .eq("profile_id", profileId)
        .maybeSingle();

      if (existingProfileLike) {
        // Profile already has this like, delete the session one
        await supabase
          .from("post_ratings")
          .delete()
          .eq("id", like.id);
      } else {
        // Migrate: update session_id to null, set profile_id
        await supabase
          .from("post_ratings")
          .update({
            session_id: null,
            profile_id: profileId,
          })
          .eq("id", like.id);
      }
    }

    // Step 3: Update Redis sets
    if (redis) {
      const sessionLikesKey = counterKeys.sessionLikes(sessionId);
      const profileLikesKey = counterKeys.profileLikes(profileId);
      const sessionIdentifier = `session:${sessionId}`;
      const profileIdentifier = `profile:${profileId}`;

      for (const like of sessionLikes) {
        const likedSetKey = counterKeys.postLiked(like.post_id);

        // Remove session identifier, add profile identifier
        await redis.srem(likedSetKey, sessionIdentifier);
        await redis.sadd(likedSetKey, profileIdentifier);

        // Move from session likes to profile likes
        await redis.srem(sessionLikesKey, like.post_id);
        await redis.sadd(profileLikesKey, like.post_id);
      }
    }

    console.log(`[RedisSync] Migration complete: ${sessionLikes.length} likes migrated`);
  } catch (error) {
    console.error("[RedisSync] Migration failed:", error);
  }
}
