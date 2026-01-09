"use client";

/**
 * usePostLikesSubscription - Real-time subscription for post like updates
 *
 * This hook consolidates the duplicated subscription logic from:
 * - HomeFeed.tsx
 * - RankGrid.tsx
 * - ProfileWall.tsx
 *
 * Features:
 * - Subscribes to real-time like count updates
 * - Skips updates for posts being actively liked (prevents flash bug)
 * - Automatic cleanup on unmount
 */

import { useEffect } from "react";
import { subscribeToPostLikes } from "../utils/ratings";
import type { Post } from "../mocks/posts";

/** Generic post type for state updates */
interface PostLike {
  id: string | number;
  likes: number;
}

export interface UsePostLikesSubscriptionOptions<T extends PostLike = Post> {
  /** Callback to update posts state */
  setPosts: React.Dispatch<React.SetStateAction<T[]>>;
  /** Optional callback to update a selected post (for modals) */
  setSelectedPost?: React.Dispatch<React.SetStateAction<Post | null>>;
  /** Ref containing set of post IDs currently being liked (to skip updates) */
  isLikingRef: React.RefObject<Set<string>>;
}

/**
 * Hook for subscribing to real-time post like updates
 *
 * @example
 * ```tsx
 * usePostLikesSubscription({
 *   setPosts,
 *   setSelectedPost, // optional
 *   isLikingRef,
 * });
 * ```
 */
export function usePostLikesSubscription<T extends PostLike = Post>({
  setPosts,
  setSelectedPost,
  isLikingRef,
}: UsePostLikesSubscriptionOptions<T>): void {
  useEffect(() => {
    const unsubscribe = subscribeToPostLikes((update) => {
      // Skip real-time updates for posts currently being liked/unliked
      // This prevents the "flash" bug where the counter briefly shows wrong values
      if (isLikingRef.current?.has(update.postId)) {
        return;
      }

      // Update posts state with new like count
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          String(post.id) === update.postId ? { ...post, likes: update.likes } : post
        )
      );

      // Update selected post if provided (for modals)
      if (setSelectedPost) {
        setSelectedPost((prev) =>
          prev && String(prev.id) === update.postId
            ? { ...prev, likes: update.likes }
            : prev
        );
      }
    });

    return () => unsubscribe();
  }, [setPosts, setSelectedPost, isLikingRef]);
}
