"use client";

/**
 * RankGrid Client Component
 *
 * This component handles all interactive features for the ranking page:
 * - Displaying ranked posts received from server component (cached data)
 * - Handling like/unlike interactions
 * - Real-time subscription for like count updates
 * - Post modal for detailed view
 *
 * The initial posts are passed as props from the Server Component,
 * which uses cached data (5 minute cache) to reduce Supabase hits.
 */

import Image from "next/image";
import { useState, useEffect } from "react";
import { getPostsWithLikeStatus } from "../utils/posts";
import { subscribeToPostLikes, togglePostLike } from "../utils/ratings";
import { getSessionId } from "../utils/session";
import type { Post } from "../mocks/posts";
import { PostModal } from "./PostModal";
import { RankItemSkeleton } from "./Skeletons";
import { HeartIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

// Base64 gray placeholder for loading images
const BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mFrYGb6DwAEsAGzK+3tCAAAAABJRU5ErkJggg==";

interface RankGridProps {
  /** Initial ranked posts from server-side cached fetch */
  initialPosts: Post[];
}

export function RankGrid({ initialPosts }: RankGridProps) {
  // Debug: Log initial posts received from server
  console.log(`[RankGrid] Received ${initialPosts.length} initial ranked posts from server cache`);

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  // Initialize posts with server-provided data
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [sessionId, setSessionId] = useState<string>("");
  const [isLiking, setIsLiking] = useState<Set<string>>(new Set());
  // Track if we're still initializing (fetching liked status)
  // This helps show skeletons during brief loading periods
  const [isInitializing, setIsInitializing] = useState(true);

  /**
   * Handles like/unlike toggle for a post
   * Uses optimistic updates for immediate UI feedback
   */
  const handleLike = async (postId: string) => {
    // Prevent double-clicking while processing
    if (isLiking.has(postId)) {
      console.log(`[RankGrid] Like already in progress for post ${postId}`);
      return;
    }

    // Optimistic update for immediate UI feedback
    setPosts((prevPosts) =>
      prevPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              isLiked: !post.isLiked,
              likes: post.isLiked ? post.likes - 1 : post.likes + 1,
            }
          : post
      )
    );
    // Also update selected post
    setSelectedPost((prev) =>
      prev && prev.id === postId
        ? {
            ...prev,
            isLiked: !prev.isLiked,
            likes: prev.isLiked ? prev.likes - 1 : prev.likes + 1,
          }
        : prev
    );

    // Mark as processing
    setIsLiking((prev) => new Set(prev).add(postId));

    // Persist to database
    const result = await togglePostLike(postId, sessionId);

    // Remove from processing
    setIsLiking((prev) => {
      const next = new Set(prev);
      next.delete(postId);
      return next;
    });

    // If failed, revert the optimistic update
    if (!result.success) {
      console.error("[RankGrid] Failed to toggle like:", result.error);
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          post.id === postId
            ? {
                ...post,
                isLiked: !post.isLiked,
                likes: post.isLiked ? post.likes - 1 : post.likes + 1,
              }
            : post
        )
      );
      setSelectedPost((prev) =>
        prev && prev.id === postId
          ? {
              ...prev,
              isLiked: !prev.isLiked,
              likes: prev.isLiked ? prev.likes - 1 : prev.likes + 1,
            }
          : prev
      );
    }
  };

  /**
   * Initialize session and merge liked status with initial posts
   * The server-provided posts don't have isLiked status (session-specific),
   * so we fetch that on the client side
   */
  useEffect(() => {
    const initializeSession = async () => {
      console.log("[RankGrid] Initializing session and liked status");

      // Get or create session ID
      const sid = getSessionId();
      setSessionId(sid);

      if (!sid || initialPosts.length === 0) {
        setIsInitializing(false);
        return;
      }

      // Fetch liked status for initial posts
      try {
        const postsWithLikeStatus = await getPostsWithLikeStatus(sid, {
          minLikes: 5,
          orderBy: "likes",
          ascending: false,
        });

        // Create a map of post ID to liked status
        const likedMap = new Map(
          postsWithLikeStatus.map(post => [String(post.id), post.isLiked || false])
        );

        // Merge liked status into our posts
        setPosts(prevPosts =>
          prevPosts.map(post => ({
            ...post,
            isLiked: likedMap.get(String(post.id)) || false,
          }))
        );

        console.log("[RankGrid] Liked status merged with initial posts");
      } catch (error) {
        console.error("[RankGrid] Error fetching liked status:", error);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeSession();
  }, [initialPosts]);

  // Subscribe to real-time updates for like counts
  useEffect(() => {
    console.log("[RankGrid] Setting up real-time subscription for likes");

    const unsubscribe = subscribeToPostLikes((update) => {
      console.log(`[RankGrid] Real-time like update received - post: ${update.postId}, likes: ${update.likes}`);
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          post.id === update.postId ? { ...post, likes: update.likes } : post
        )
      );
      // Also update selected post if it's the one that changed
      setSelectedPost((prev) =>
        prev && prev.id === update.postId
          ? { ...prev, likes: update.likes }
          : prev
      );
    });

    return () => {
      console.log("[RankGrid] Cleaning up real-time subscription");
      unsubscribe();
    };
  }, []);

  // Sort posts by likes (descending) for display
  const sortedPosts = [...posts].sort((a, b) => b.likes - a.likes);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card-bg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="w-10" /> {/* Spacer for centering */}
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Ranking
          </h1>
          <ThemeToggle />
        </div>
      </header>

      {/* Grid de posts */}
      <main className="max-w-2xl mx-auto p-2">
        {/* Empty state - shown when no ranked posts after initialization completes */}
        {!isInitializing && posts.length === 0 && (
          <div className="text-center text-foreground/50 py-16">
            <p className="text-lg">No hay posts populares aún</p>
            <p className="text-sm mt-2">
              Los posts con más de 5 likes aparecerán aquí
            </p>
          </div>
        )}

        {/* Grid - show skeletons during init or posts when available */}
        <div className="grid grid-cols-3 gap-1">
          {/* Show skeletons during initialization when no posts */}
          {isInitializing && posts.length === 0 &&
            Array.from({ length: 9 }).map((_, i) => (
              <RankItemSkeleton key={`skeleton-${i}`} />
            ))
          }
          {/* Show actual posts */}
          {sortedPosts.map((post) => (
            <button
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className="relative aspect-square overflow-hidden group"
            >
              <Image
                src={post.image_url}
                alt={`Post con ${post.likes} likes`}
                fill
                sizes="(max-width: 768px) 33vw, 20vw"
                className="object-cover transition-transform group-hover:scale-105"
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
                unoptimized
              />
              {/* Overlay con likes al hover */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <HeartIcon
                  filled={post.isLiked || false}
                  className="w-6 h-6"
                />
                <span className="text-white font-semibold">
                  {post.likes.toLocaleString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      </main>

      {/* Modal */}
      {selectedPost && (
        <PostModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onLike={handleLike}
        />
      )}
    </div>
  );
}

