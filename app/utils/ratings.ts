import { supabase } from "./client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { revalidatePostsCache } from "../actions/revalidate-posts";

export interface RatingResult {
  success: boolean;
  isLiked: boolean;
  newLikeCount: number;
  error?: string;
}

export interface PostLikesUpdate {
  postId: string;
  likes: number;
}

/**
 * Toggles a like for a post by session using an atomic RPC function.
 *
 * This uses a single database transaction to:
 * - Check if the rating exists
 * - Insert or delete the rating
 * - Update the likes count atomically
 *
 * This eliminates race conditions that caused the "flash" bug where
 * the counter would briefly show incorrect values during like/unlike.
 *
 * @see supabase/migrations/*_add_toggle_post_like_rpc.sql for the RPC function
 * @see app/actions/revalidate-posts.ts for cache invalidation
 */
export async function togglePostLike(
  postId: string,
  sessionId: string
): Promise<RatingResult> {
  if (!sessionId) {
    return {
      success: false,
      isLiked: false,
      newLikeCount: 0,
      error: "Session ID is required",
    };
  }

  console.log(`[Ratings] Toggling like for post ${postId} by session ${sessionId.slice(0, 8)}...`);

  // Call the atomic RPC function that handles everything in a single transaction
  const { data, error } = await supabase.rpc("toggle_post_like", {
    p_post_id: postId,
    p_session_id: sessionId,
  });

  if (error) {
    console.error(`[Ratings] Error toggling like:`, error);
    return {
      success: false,
      isLiked: false,
      newLikeCount: 0,
      error: error.message,
    };
  }

  // The RPC returns: { success, isLiked, newLikeCount, error? }
  const result = data as RatingResult;

  if (result.success) {
    console.log(`[Ratings] ${result.isLiked ? "Like" : "Unlike"} successful, new count: ${result.newLikeCount}`);

    // Invalidate posts cache after successful operation
    revalidatePostsCache().catch((err) => {
      console.error("[Ratings] Error revalidating cache:", err);
    });
  } else {
    console.warn(`[Ratings] Toggle failed:`, result.error);
  }

  return result;
}

/**
 * Gets the liked status for multiple posts by session
 * Returns a map of postId -> isLiked
 */
export async function getSessionLikes(
  postIds: string[],
  sessionId: string
): Promise<Map<string, boolean>> {
  const likedMap = new Map<string, boolean>();

  if (!sessionId || postIds.length === 0) {
    return likedMap;
  }

  const { data: ratings, error } = await supabase
    .from("post_ratings")
    .select("post_id")
    .eq("session_id", sessionId)
    .in("post_id", postIds);

  if (error) {
    console.error("Error fetching session likes:", error);
    return likedMap;
  }

  // Initialize all posts as not liked
  postIds.forEach((id) => likedMap.set(id, false));

  // Mark liked posts
  ratings?.forEach((rating) => {
    likedMap.set(rating.post_id, true);
  });

  return likedMap;
}

/**
 * Subscribes to real-time updates on post likes
 * Uses Supabase's pub/sub system for instant updates across all clients
 *
 * @param onUpdate - Callback when a post's likes count changes
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToPostLikes(
  onUpdate: (update: PostLikesUpdate) => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel("posts_likes_updates")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "posts_new",
        filter: undefined, // Listen to all post updates
      },
      (payload) => {
        const newRecord = payload.new as { id: string; likes: number };
        if (newRecord && typeof newRecord.likes === "number") {
          onUpdate({
            postId: newRecord.id,
            likes: newRecord.likes,
          });
        }
      }
    )
    .subscribe();

  // Return cleanup function
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribes to real-time rating changes for a specific session
 * Notifies when the current session's ratings change (useful for multi-tab sync)
 *
 * @param sessionId - The session to track
 * @param onRatingChange - Callback when a rating is added or removed
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToSessionRatings(
  sessionId: string,
  onRatingChange: (postId: string, isLiked: boolean) => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`session_ratings_${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "post_ratings",
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        const newRecord = payload.new as { post_id: string };
        if (newRecord?.post_id) {
          onRatingChange(newRecord.post_id, true);
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "post_ratings",
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        const oldRecord = payload.old as { post_id: string };
        if (oldRecord?.post_id) {
          onRatingChange(oldRecord.post_id, false);
        }
      }
    )
    .subscribe();

  // Return cleanup function
  return () => {
    supabase.removeChannel(channel);
  };
}
