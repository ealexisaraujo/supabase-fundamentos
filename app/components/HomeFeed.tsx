"use client";

/**
 * HomeFeed Client Component
 *
 * This component handles all interactive features for the home page:
 * - Displaying posts received from server component (cached data)
 * - Handling like/unlike interactions
 * - Real-time subscription for like count updates
 * - Infinite scroll for loading more posts
 * - User authentication state
 *
 * The initial posts are passed as props from the Server Component,
 * which uses cached data to reduce Supabase hits.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { getPostsWithLikeStatus } from "../utils/posts";
import { getSessionId } from "../utils/session";
import { togglePostLike, subscribeToPostLikes } from "../utils/ratings";
import type { Post } from "../mocks/posts";
import { PostCard } from "./PostCard";
import { PostCardSkeleton } from "./Skeletons";
import { ThemeToggle } from "./ThemeToggle";
import Link from "next/link";
import { supabase } from "../utils/client";

interface HomeFeedProps {
  /** Initial posts from server-side cached fetch */
  initialPosts: Post[];
}

export function HomeFeed({ initialPosts }: HomeFeedProps) {
  const router = useRouter();
  // Debug: Log initial posts received from server
  console.log(`[HomeFeed] Received ${initialPosts.length} initial posts from server cache`);

  // Initialize posts with server-provided data
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [sessionId, setSessionId] = useState<string>("");
  const [isLiking, setIsLiking] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  // Track if auth state is being loaded - prevents Login button flash
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  // Track if we're still initializing (fetching liked status)
  // This helps show skeletons during brief loading periods or on errors
  const [isInitializing, setIsInitializing] = useState(true);
  const observerTarget = useRef<HTMLDivElement>(null);
  const POSTS_PER_PAGE = 5;

  /**
   * Handles like/unlike toggle for a post
   * Uses optimistic updates for immediate UI feedback
   */
  const handleLike = async (postId: number | string) => {
    const postIdStr = String(postId);

    // Prevent double-clicking while processing
    if (isLiking.has(postIdStr)) {
      console.log(`[HomeFeed] Like already in progress for post ${postIdStr}`);
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

    // If failed, revert the optimistic update
    if (!result.success) {
      console.error("[HomeFeed] Failed to toggle like:", result.error);
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
    }
  };

  /**
   * Fetches additional posts for infinite scroll
   * This is used for loading MORE posts (pagination), not initial load
   */
  const fetchMorePosts = useCallback(async (pageNum: number) => {
    if (!sessionId) return;

    console.log(`[HomeFeed] Fetching more posts - page: ${pageNum}`);
    setLoadingMore(true);

    try {
      const data = await getPostsWithLikeStatus(sessionId, {
        page: pageNum,
        limit: POSTS_PER_PAGE,
      });

      if (data.length < POSTS_PER_PAGE) {
        setHasMore(false);
        console.log("[HomeFeed] No more posts available");
      }

      // Deduplicate posts to prevent "duplicate key" React errors
      // This can happen due to pagination overlap or timing issues
      setPosts((prev) => {
        const existingIds = new Set(prev.map(p => String(p.id)));
        const newPosts = data.filter(p => !existingIds.has(String(p.id)));
        console.log(`[HomeFeed] Adding ${newPosts.length} new posts (${data.length - newPosts.length} duplicates filtered)`);
        return [...prev, ...newPosts];
      });
      setPage(pageNum);
    } catch (error) {
      console.error("[HomeFeed] Error fetching more posts:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [sessionId]);

  /**
   * Initialize session and merge liked status with initial posts
   * The server-provided posts don't have isLiked status (session-specific),
   * so we fetch that on the client side
   */
  useEffect(() => {
    const initializeSession = async () => {
      console.log("[HomeFeed] Initializing session and liked status");

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
          page: 0,
          limit: initialPosts.length,
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

        console.log("[HomeFeed] Liked status merged with initial posts");
      } catch (error) {
        console.error("[HomeFeed] Error fetching liked status:", error);
      } finally {
        setIsInitializing(false);
      }

      // Check for user session
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setIsAuthLoading(false);
    };

    initializeSession();
  }, [initialPosts]);

  // Infinite scroll observer
  useEffect(() => {
    // Capture ref value at effect setup time to use in cleanup
    const currentTarget = observerTarget.current;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && sessionId) {
          console.log("[HomeFeed] Intersection triggered - loading more posts");
          fetchMorePosts(page + 1);
        }
      },
      { threshold: 1.0 }
    );

    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loadingMore, page, fetchMorePosts, sessionId]);

  // Subscribe to real-time updates for like counts
  useEffect(() => {
    console.log("[HomeFeed] Setting up real-time subscription for likes");

    const unsubscribe = subscribeToPostLikes((update) => {
      console.log(`[HomeFeed] Real-time like update received - post: ${update.postId}, likes: ${update.likes}`);
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          post.id === update.postId
            ? { ...post, likes: update.likes }
            : post
        )
      );
    });

    return () => {
      console.log("[HomeFeed] Cleaning up real-time subscription");
      unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card-bg/80 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Left: Logo */}
          <div className="flex items-center shrink-0">
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Suplatzigram
            </h1>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <ThemeToggle />

            {isAuthLoading ? (
              // Loading skeleton while checking auth - prevents Login button flash
              <div className="flex items-center gap-3 animate-pulse">
                <div className="hidden sm:flex flex-col items-end gap-1">
                  <div className="h-3 w-16 bg-foreground/10 rounded" />
                  <div className="h-2 w-24 bg-foreground/10 rounded" />
                </div>
                <div className="h-8 w-16 bg-foreground/10 rounded-full" />
              </div>
            ) : user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-medium text-foreground">{user.email?.split('@')[0]}</span>
                  <span className="text-[10px] text-foreground/60">{user.email}</span>
                </div>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setUser(null);
                    router.refresh();
                  }}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200"
                >
                  Salir
                </button>
              </div>
            ) : (
              <Link
                href="/auth/login"
                className="px-6 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-[#a3e635] to-[#bef264] text-black shadow-md hover:shadow-lg hover:brightness-105 transition-all transform hover:-translate-y-0.5"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Feed de posts */}
      <main className="max-w-lg mx-auto px-4 py-6">
        <div className="flex flex-col gap-6">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onLike={handleLike} />
          ))}

          {/* Loading skeletons - shown during initialization when no posts available */}
          {/* This covers: server fetch failed, Supabase outage, or initial hydration */}
          {isInitializing && posts.length === 0 && (
            <>
              <PostCardSkeleton />
              <PostCardSkeleton />
              <PostCardSkeleton />
            </>
          )}

          {/* Empty state - shown when initialization is complete but no posts */}
          {!isInitializing && posts.length === 0 && (
            <div className="text-center text-foreground/50 py-8">
              No hay posts disponibles
            </div>
          )}

          {/* Infinite scroll trigger and loading more state */}
          <div ref={observerTarget} className="h-4 w-full" />

          {loadingMore && (
            <div className="py-4">
              <PostCardSkeleton />
            </div>
          )}

          {!hasMore && posts.length > 0 && (
            <div className="text-center text-foreground/50 py-8">
              No hay más posts
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

