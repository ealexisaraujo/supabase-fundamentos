/**
 * Profile Highlights Utilities
 *
 * Handles fetching, pinning, unpinning, and reordering highlights.
 * Follows the same pattern as ratings.ts for RPC calls and real-time subscriptions.
 *
 * @see app/utils/ratings.ts for similar patterns
 */

import { supabase } from "./client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { revalidateProfileCache } from "../actions/revalidate-profiles";
import type {
  ProfileHighlight,
  PinHighlightResult,
  UnpinHighlightResult,
  ReorderHighlightResult,
  HighlightUpdate,
  HighlightPosition,
} from "../types/highlight";

/**
 * Fetches highlights for a profile with joined post data
 *
 * @param profileId - The profile UUID to fetch highlights for
 * @returns Array of highlights sorted by position
 */
export async function getProfileHighlights(
  profileId: string
): Promise<ProfileHighlight[]> {
  const { data, error } = await supabase
    .from("profile_highlights")
    .select(
      `
      id,
      profile_id,
      post_id,
      position,
      created_at,
      updated_at,
      post:posts_new (
        id,
        image_url,
        caption,
        likes,
        created_at
      )
    `
    )
    .eq("profile_id", profileId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[Highlights] Error fetching highlights:", error);
    return [];
  }

  return (data as unknown as ProfileHighlight[]) || [];
}

/**
 * Pins a post to highlights at a specific position
 *
 * Uses an atomic RPC function that:
 * - Validates position (1-3)
 * - Validates post ownership
 * - Checks limit (max 3)
 * - Handles position conflicts
 *
 * @param profileId - The profile UUID
 * @param postId - The post UUID to pin
 * @param position - The position (1, 2, or 3)
 * @param username - Optional username for cache invalidation
 * @returns Result with success status and highlight ID
 */
export async function pinPostToHighlights(
  profileId: string,
  postId: string,
  position: HighlightPosition,
  username?: string
): Promise<PinHighlightResult> {
  console.log(
    `[Highlights] Pinning post ${postId.slice(0, 8)} to position ${position}`
  );

  const { data, error } = await supabase.rpc("pin_post_to_highlights", {
    p_profile_id: profileId,
    p_post_id: postId,
    p_position: position,
  });

  if (error) {
    console.error("[Highlights] Error pinning post:", error);
    return { success: false, error: error.message };
  }

  const result = data as PinHighlightResult;

  if (result.success && username) {
    console.log(`[Highlights] Pin successful, invalidating cache`);
    revalidateProfileCache(username).catch((err) => {
      console.error("[Highlights] Error revalidating cache:", err);
    });
  } else if (!result.success) {
    console.warn(`[Highlights] Pin failed:`, result.error);
  }

  return result;
}

/**
 * Unpins a post from highlights
 *
 * @param profileId - The profile UUID
 * @param postId - The post UUID to unpin
 * @param username - Optional username for cache invalidation
 * @returns Result with success status and removed position
 */
export async function unpinPostFromHighlights(
  profileId: string,
  postId: string,
  username?: string
): Promise<UnpinHighlightResult> {
  console.log(`[Highlights] Unpinning post ${postId.slice(0, 8)}`);

  const { data, error } = await supabase.rpc("unpin_post_from_highlights", {
    p_profile_id: profileId,
    p_post_id: postId,
  });

  if (error) {
    console.error("[Highlights] Error unpinning post:", error);
    return { success: false, error: error.message };
  }

  const result = data as UnpinHighlightResult;

  if (result.success && username) {
    console.log(`[Highlights] Unpin successful, invalidating cache`);
    revalidateProfileCache(username).catch((err) => {
      console.error("[Highlights] Error revalidating cache:", err);
    });
  } else if (!result.success) {
    console.warn(`[Highlights] Unpin failed:`, result.error);
  }

  return result;
}

/**
 * Reorders a highlight to a new position (swaps with existing if occupied)
 *
 * @param profileId - The profile UUID
 * @param postId - The post UUID to reorder
 * @param newPosition - The new position (1, 2, or 3)
 * @param username - Optional username for cache invalidation
 * @returns Result with success status and new position
 */
export async function reorderHighlight(
  profileId: string,
  postId: string,
  newPosition: HighlightPosition,
  username?: string
): Promise<ReorderHighlightResult> {
  console.log(
    `[Highlights] Reordering post ${postId.slice(0, 8)} to position ${newPosition}`
  );

  const { data, error } = await supabase.rpc("reorder_highlight", {
    p_profile_id: profileId,
    p_post_id: postId,
    p_new_position: newPosition,
  });

  if (error) {
    console.error("[Highlights] Error reordering highlight:", error);
    return { success: false, error: error.message };
  }

  const result = data as ReorderHighlightResult;

  if (result.success && username) {
    console.log(`[Highlights] Reorder successful, invalidating cache`);
    revalidateProfileCache(username).catch((err) => {
      console.error("[Highlights] Error revalidating cache:", err);
    });
  } else if (!result.success) {
    console.warn(`[Highlights] Reorder failed:`, result.error);
  }

  return result;
}

/**
 * Checks if a post is highlighted for a profile
 *
 * @param profileId - The profile UUID
 * @param postId - The post UUID to check
 * @returns Object with isHighlighted flag and position if highlighted
 */
export async function isPostHighlighted(
  profileId: string,
  postId: string
): Promise<{ isHighlighted: boolean; position?: HighlightPosition }> {
  const { data, error } = await supabase
    .from("profile_highlights")
    .select("position")
    .eq("profile_id", profileId)
    .eq("post_id", postId)
    .single();

  if (error || !data) {
    return { isHighlighted: false };
  }

  return {
    isHighlighted: true,
    position: data.position as HighlightPosition,
  };
}

/**
 * Gets the current highlight count for a profile
 *
 * @param profileId - The profile UUID
 * @returns Number of current highlights (0-3)
 */
export async function getHighlightCount(profileId: string): Promise<number> {
  const { count, error } = await supabase
    .from("profile_highlights")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", profileId);

  if (error) {
    console.error("[Highlights] Error getting count:", error);
    return 0;
  }

  return count || 0;
}

/**
 * Subscribes to real-time highlight updates for a profile
 *
 * Listens for INSERT, DELETE, and UPDATE events on the profile_highlights table.
 * Used to sync highlight changes across tabs/devices.
 *
 * @param profileId - The profile UUID to subscribe to
 * @param onUpdate - Callback when a highlight changes
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToProfileHighlights(
  profileId: string,
  onUpdate: (update: HighlightUpdate) => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`profile_highlights_${profileId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "profile_highlights",
        filter: `profile_id=eq.${profileId}`,
      },
      (payload) => {
        const newRecord = payload.new as { post_id: string; position: number };
        onUpdate({
          profileId,
          action: "pin",
          postId: newRecord.post_id,
          position: newRecord.position,
        });
      }
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "profile_highlights",
        filter: `profile_id=eq.${profileId}`,
      },
      (payload) => {
        const oldRecord = payload.old as { post_id: string };
        onUpdate({
          profileId,
          action: "unpin",
          postId: oldRecord.post_id,
        });
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "profile_highlights",
        filter: `profile_id=eq.${profileId}`,
      },
      (payload) => {
        const newRecord = payload.new as { post_id: string; position: number };
        onUpdate({
          profileId,
          action: "reorder",
          postId: newRecord.post_id,
          position: newRecord.position,
        });
      }
    )
    .subscribe();

  // Return cleanup function
  return () => {
    supabase.removeChannel(channel);
  };
}
