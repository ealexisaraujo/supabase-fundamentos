"use client";

/**
 * useHighlights - Hook for managing profile highlights
 *
 * Provides:
 * - Current highlights state
 * - Pin/unpin/reorder handlers
 * - Real-time subscription for live updates
 * - Highlight limit enforcement (max 3)
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  pinPostToHighlights,
  unpinPostFromHighlights,
  reorderHighlight,
  subscribeToProfileHighlights,
  getProfileHighlights,
} from "../utils/highlights";
import type { ProfileHighlight } from "../utils/cached-profiles";
import type { HighlightPosition, HighlightUpdate } from "../types/highlight";

export interface UseHighlightsOptions {
  /** Profile ID to manage highlights for */
  profileId: string;
  /** Username for cache invalidation */
  username: string;
  /** Initial highlights from server */
  initialHighlights?: ProfileHighlight[];
  /** Whether the current user owns this profile */
  isOwner: boolean;
}

export interface UseHighlightsReturn {
  /** Current highlights array */
  highlights: ProfileHighlight[];
  /** Set of post IDs that are highlighted */
  highlightedPostIds: Set<string>;
  /** Current number of highlights (0-3) */
  highlightCount: number;
  /** Whether more highlights can be added */
  canAddMore: boolean;
  /** Whether an operation is in progress */
  isProcessing: boolean;
  /** Current error message (auto-clears after 5s) */
  error: string | null;
  /** Pin a post to highlights at a specific position */
  pinPost: (postId: string, position: HighlightPosition) => Promise<boolean>;
  /** Unpin a post from highlights */
  unpinPost: (postId: string) => Promise<boolean>;
  /** Reorder a highlight to a new position */
  reorderPost: (postId: string, newPosition: HighlightPosition) => Promise<boolean>;
  /** Get the position of a highlighted post */
  getPostPosition: (postId: string) => HighlightPosition | undefined;
  /** Get positions that are not currently used */
  getAvailablePositions: () => HighlightPosition[];
}

export function useHighlights({
  profileId,
  username,
  initialHighlights = [],
  isOwner,
}: UseHighlightsOptions): UseHighlightsReturn {
  const [highlights, setHighlights] = useState<ProfileHighlight[]>(initialHighlights);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived state
  const highlightedPostIds = useMemo(
    () => new Set(highlights.map((h) => h.post_id)),
    [highlights]
  );

  const highlightCount = highlights.length;
  const canAddMore = highlightCount < 3;

  // Get position for a specific post
  const getPostPosition = useCallback(
    (postId: string): HighlightPosition | undefined => {
      const highlight = highlights.find((h) => h.post_id === postId);
      return highlight?.position;
    },
    [highlights]
  );

  // Get next available position (always append to end, no gaps)
  const getAvailablePositions = useCallback((): HighlightPosition[] => {
    // Next position is simply count + 1 (append behavior)
    const nextPosition = (highlights.length + 1) as HighlightPosition;
    if (nextPosition > 3) return []; // Max 3 highlights
    return [nextPosition];
  }, [highlights]);

  // Pin handler
  const pinPost = useCallback(
    async (postId: string, position: HighlightPosition): Promise<boolean> => {
      if (!isOwner || isProcessing) return false;

      if (!canAddMore) {
        setError("Maximo 3 destacados. Por favor quita uno primero.");
        return false;
      }

      setIsProcessing(true);
      setError(null);

      const result = await pinPostToHighlights(profileId, postId, position, username);

      setIsProcessing(false);

      if (!result.success) {
        setError(result.error || "Error al fijar el post");
        return false;
      }

      // Refresh highlights from server to get complete data
      const updated = await getProfileHighlights(profileId);
      setHighlights(updated);

      return true;
    },
    [profileId, username, isOwner, isProcessing, canAddMore]
  );

  // Unpin handler
  const unpinPost = useCallback(
    async (postId: string): Promise<boolean> => {
      if (!isOwner || isProcessing) return false;

      setIsProcessing(true);
      setError(null);

      // Optimistic update
      const previousHighlights = highlights;
      setHighlights((prev) => prev.filter((h) => h.post_id !== postId));

      const result = await unpinPostFromHighlights(profileId, postId, username);

      setIsProcessing(false);

      if (!result.success) {
        setError(result.error || "Error al quitar el post");
        // Rollback optimistic update
        setHighlights(previousHighlights);
        return false;
      }

      // Refetch to get updated positions (backend reorders remaining highlights)
      const updated = await getProfileHighlights(profileId);
      setHighlights(updated);

      return true;
    },
    [profileId, username, isOwner, isProcessing, highlights]
  );

  // Reorder handler
  const reorderPost = useCallback(
    async (postId: string, newPosition: HighlightPosition): Promise<boolean> => {
      if (!isOwner || isProcessing) return false;

      setIsProcessing(true);
      setError(null);

      const result = await reorderHighlight(profileId, postId, newPosition, username);

      setIsProcessing(false);

      if (!result.success) {
        setError(result.error || "Error al reordenar");
        return false;
      }

      // Refresh highlights to get correct order
      const updated = await getProfileHighlights(profileId);
      setHighlights(updated);

      return true;
    },
    [profileId, username, isOwner, isProcessing]
  );

  // Real-time subscription (only for owner)
  useEffect(() => {
    if (!isOwner || !profileId) return;

    const unsubscribe = subscribeToProfileHighlights(
      profileId,
      async (update: HighlightUpdate) => {
        console.log("[useHighlights] Real-time update:", update);
        // Refetch highlights on any change
        const updated = await getProfileHighlights(profileId);
        setHighlights(updated);
      }
    );

    return unsubscribe;
  }, [profileId, isOwner]);

  // Update highlights when initialHighlights changes (e.g., on navigation)
  useEffect(() => {
    setHighlights(initialHighlights);
  }, [initialHighlights]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return {
    highlights,
    highlightedPostIds,
    highlightCount,
    canAddMore,
    isProcessing,
    error,
    pinPost,
    unpinPost,
    reorderPost,
    getPostPosition,
    getAvailablePositions,
  };
}
