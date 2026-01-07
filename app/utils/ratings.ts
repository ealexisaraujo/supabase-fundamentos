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
 * Toggles a like for a post by session
 * - If session hasn't liked the post: adds like and increments count
 * - If session has already liked: removes like and decrements count
 *
 * Uses database constraints to enforce one rating per session per post.
 * After a successful operation, invalidates the posts cache to ensure
 * fresh data on next page visit.
 *
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

  // Check if session has already liked this post
  const { data: existingRating } = await supabase
    .from("post_ratings")
    .select("id")
    .eq("post_id", postId)
    .eq("session_id", sessionId)
    .single();

  if (existingRating) {
    // Remove like (unlike)
    console.log(`[Ratings] Removing like from post ${postId}`);

    const { error: deleteError } = await supabase
      .from("post_ratings")
      .delete()
      .eq("post_id", postId)
      .eq("session_id", sessionId);

    if (deleteError) {
      console.error(`[Ratings] Error removing like:`, deleteError);
      return {
        success: false,
        isLiked: true,
        newLikeCount: 0,
        error: deleteError.message,
      };
    }

    // Decrement likes count on post
    const { data: currentPost } = await supabase
      .from("posts_new")
      .select("likes")
      .eq("id", postId)
      .single();

    const newLikes = Math.max(0, (currentPost?.likes || 1) - 1);

    const { error: updateError } = await supabase
      .from("posts_new")
      .update({ likes: newLikes })
      .eq("id", postId);

    if (updateError) {
      console.error(`[Ratings] Error updating like count:`, updateError);
      return {
        success: false,
        isLiked: false,
        newLikeCount: 0,
        error: updateError.message,
      };
    }

    // Invalidate posts cache after successful unlike
    console.log(`[Ratings] Unlike successful, invalidating cache`);
    revalidatePostsCache().catch((err) => {
      console.error("[Ratings] Error revalidating cache:", err);
    });

    return {
      success: true,
      isLiked: false,
      newLikeCount: newLikes,
    };
  } else {
    // Add like
    console.log(`[Ratings] Adding like to post ${postId}`);

    const { error: insertError } = await supabase
      .from("post_ratings")
      .insert({
        post_id: postId,
        session_id: sessionId,
      });

    if (insertError) {
      // Handle unique constraint violation (race condition)
      if (insertError.code === "23505") {
        console.warn(`[Ratings] Race condition - post already liked`);
        return {
          success: false,
          isLiked: true,
          newLikeCount: 0,
          error: "Already liked this post",
        };
      }
      console.error(`[Ratings] Error adding like:`, insertError);
      return {
        success: false,
        isLiked: false,
        newLikeCount: 0,
        error: insertError.message,
      };
    }

    // Increment likes count on post
    const { data: currentPost } = await supabase
      .from("posts_new")
      .select("likes")
      .eq("id", postId)
      .single();

    const newLikes = (currentPost?.likes || 0) + 1;

    const { error: updateError } = await supabase
      .from("posts_new")
      .update({ likes: newLikes })
      .eq("id", postId);

    if (updateError) {
      console.error(`[Ratings] Error updating like count:`, updateError);
      return {
        success: false,
        isLiked: true,
        newLikeCount: 0,
        error: updateError.message,
      };
    }

    // Invalidate posts cache after successful like
    console.log(`[Ratings] Like successful, invalidating cache`);
    revalidatePostsCache().catch((err) => {
      console.error("[Ratings] Error revalidating cache:", err);
    });

    return {
      success: true,
      isLiked: true,
      newLikeCount: newLikes,
    };
  }
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
