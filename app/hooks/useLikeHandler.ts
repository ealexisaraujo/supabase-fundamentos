"use client";

/**
 * useLikeHandler - Centralized like/unlike handling with optimistic updates
 *
 * This hook consolidates the duplicated like handling logic from:
 * - HomeFeed.tsx
 * - RankGrid.tsx
 * - ProfileWall.tsx
 *
 * Features:
 * - Optimistic updates for immediate UI feedback
 * - TanStack Query cache synchronization
 * - Rollback on failure
 * - Double-click prevention
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { togglePostLike } from "../utils/ratings";
import { queryKeys } from "../providers";
import type { Post } from "../mocks/posts";

/** Generic post type for state updates */
interface PostLike {
  id: string | number;
  likes: number;
  isLiked?: boolean;
}

export interface UseLikeHandlerOptions<T extends PostLike = Post> {
  /** Session ID for the current user/session */
  sessionId: string;
  /** Query key to update in TanStack Query cache */
  queryKey: readonly unknown[];
  /** Callback to update posts state */
  setPosts: React.Dispatch<React.SetStateAction<T[]>>;
  /** Optional callback to update a selected post (for modals) */
  setSelectedPost?: React.Dispatch<React.SetStateAction<Post | null>>;
  /** Map of post IDs to liked status from TanStack Query */
  likedMap?: Map<string, boolean>;
}

export interface UseLikeHandlerReturn {
  /** Handler function to toggle like on a post */
  handleLike: (postId: string | number) => Promise<void>;
  /** Set of post IDs currently being processed */
  isLiking: Set<string>;
  /** Ref to isLiking for use in real-time subscriptions */
  isLikingRef: React.RefObject<Set<string>>;
}

/**
 * Hook for handling post likes with optimistic updates
 *
 * @example
 * ```tsx
 * const { handleLike, isLiking, isLikingRef } = useLikeHandler({
 *   sessionId,
 *   queryKey: queryKeys.posts.liked(sessionId),
 *   setPosts,
 *   setSelectedPost, // optional
 *   likedMap,
 * });
 * ```
 */
export function useLikeHandler<T extends PostLike = Post>({
  sessionId,
  queryKey,
  setPosts,
  setSelectedPost,
  likedMap,
}: UseLikeHandlerOptions<T>): UseLikeHandlerReturn {
  const queryClient = useQueryClient();
  const [isLiking, setIsLiking] = useState<Set<string>>(new Set());

  // Ref for real-time subscription to check processing status
  const isLikingRef = useRef<Set<string>>(new Set());

  // Keep ref in sync with state (must be in useEffect, not during render)
  useEffect(() => {
    isLikingRef.current = isLiking;
  }, [isLiking]);

  const handleLike = useCallback(
    async (postId: string | number) => {
      const postIdStr = String(postId);

      // Prevent double-clicking while processing
      if (isLiking.has(postIdStr)) {
        return;
      }

      // Get current liked status from likedMap (source of truth)
      // This prevents the flash bug where optimistic update goes wrong direction
      const currentlyLiked = likedMap?.get(postIdStr) ?? false;

      // Optimistic update for posts state
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          String(post.id) === postIdStr
            ? {
                ...post,
                isLiked: !currentlyLiked,
                likes: currentlyLiked ? post.likes - 1 : post.likes + 1,
              }
            : post
        )
      );

      // Update selected post if provided (for modals)
      if (setSelectedPost) {
        setSelectedPost((prev) =>
          prev && String(prev.id) === postIdStr
            ? {
                ...prev,
                isLiked: !currentlyLiked,
                likes: currentlyLiked ? prev.likes - 1 : prev.likes + 1,
              }
            : prev
        );
      }

      // Update likedMap in TanStack Query cache
      queryClient.setQueryData(queryKey, (old: Map<string, boolean> | undefined) => {
        if (!old) return new Map([[postIdStr, !currentlyLiked]]);
        const newMap = new Map(old);
        newMap.set(postIdStr, !currentlyLiked);
        return newMap;
      });

      // Mark as processing
      setIsLiking((prev) => new Set(prev).add(postIdStr));

      // Persist to database
      const result = await togglePostLike(postIdStr, sessionId);

      // Remove from processing
      setIsLiking((prev) => {
        const next = new Set(prev);
        next.delete(postIdStr);
        return next;
      });

      // Handle failure - revert optimistic update
      if (!result.success) {
        console.error("[useLikeHandler] Failed to toggle like:", result.error);

        // Revert posts state
        setPosts((prevPosts) =>
          prevPosts.map((post) =>
            String(post.id) === postIdStr
              ? {
                  ...post,
                  isLiked: currentlyLiked,
                  likes: currentlyLiked ? post.likes + 1 : post.likes - 1,
                }
              : post
          )
        );

        // Revert selected post if provided
        if (setSelectedPost) {
          setSelectedPost((prev) =>
            prev && String(prev.id) === postIdStr
              ? {
                  ...prev,
                  isLiked: currentlyLiked,
                  likes: currentlyLiked ? prev.likes + 1 : prev.likes - 1,
                }
              : prev
          );
        }

        // Revert likedMap cache
        queryClient.setQueryData(queryKey, (old: Map<string, boolean> | undefined) => {
          if (!old) return new Map([[postIdStr, currentlyLiked]]);
          const newMap = new Map(old);
          newMap.set(postIdStr, currentlyLiked);
          return newMap;
        });
      } else {
        // Invalidate all posts queries to ensure fresh data on navigation
        queryClient.invalidateQueries({ queryKey: queryKeys.posts.all });
      }
    },
    [sessionId, queryKey, setPosts, setSelectedPost, likedMap, isLiking, queryClient]
  );

  return {
    handleLike,
    isLiking,
    isLikingRef,
  };
}
