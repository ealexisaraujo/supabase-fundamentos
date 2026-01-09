"use client";

/**
 * HomeFeed Client Component
 *
 * This component handles all interactive features for the home page:
 * - Displaying posts received from server component (cached data)
 * - Handling like/unlike interactions
 * - Real-time subscription for like count updates
 * - Infinite scroll for loading more posts
 * - User authentication state (via AuthProvider)
 *
 * The initial posts are passed as props from the Server Component,
 * which uses cached data to reduce Supabase hits.
 *
 * Client-side caching:
 * - Auth state: Managed by AuthProvider (single listener, no per-component fetch)
 * - Liked status: Cached via TanStack Query (60s stale time)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getPostsWithLikeStatus } from "../utils/posts";
import type { Post } from "../mocks/posts";
import { PostCard } from "./PostCard";
import { PostCardSkeleton } from "./Skeletons";
import { ThemeToggle } from "./ThemeToggle";
import Link from "next/link";
import { useAuth, queryKeys } from "../providers";
import { useLikeHandler, usePostLikesSubscription } from "../hooks";

interface HomeFeedProps {
  /** Initial posts from server-side cached fetch */
  initialPosts: Post[];
}

export function HomeFeed({ initialPosts }: HomeFeedProps) {
  const router = useRouter();

  // Auth state and sessionId from centralized provider
  const { user, isLoading: isAuthLoading, signOut, sessionId } = useAuth();

  // Initialize posts with server-provided data
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observerTarget = useRef<HTMLDivElement>(null);
  const POSTS_PER_PAGE = 5;

  // Fetch liked status with TanStack Query caching
  // Returns a Map of postId -> isLiked for efficient lookups
  const { data: likedMap, isLoading: isLikedStatusLoading } = useQuery({
    queryKey: queryKeys.posts.liked(sessionId),
    queryFn: async () => {
      if (!sessionId || initialPosts.length === 0) return new Map<string, boolean>();

      const postsWithLikeStatus = await getPostsWithLikeStatus(sessionId, {
        page: 0,
        limit: initialPosts.length,
      });

      // Create a map of post ID to liked status
      return new Map<string, boolean>(
        postsWithLikeStatus.map(post => [String(post.id), post.isLiked || false])
      );
    },
    enabled: !!sessionId && initialPosts.length > 0,
    staleTime: 60 * 1000, // Consider fresh for 60 seconds
  });

  // Derive posts with liked status using useMemo (TanStack Query best practice)
  // This is a computed value that combines base posts with the cached likedMap
  // No useEffect needed - the value is always in sync with its dependencies
  const postsWithLikedStatus = useMemo(() => {
    if (!likedMap || likedMap.size === 0) {
      return posts;
    }
    return posts.map(post => ({
      ...post,
      isLiked: likedMap.get(String(post.id)) || false,
    }));
  }, [posts, likedMap]);

  // Track initialization state
  const isInitializing = isLikedStatusLoading && posts.length === 0;

  // Centralized like handling with optimistic updates
  const { handleLike, isLikingRef } = useLikeHandler({
    sessionId,
    queryKey: queryKeys.posts.liked(sessionId),
    setPosts,
    likedMap,
  });

  // Real-time subscription for like count updates
  usePostLikesSubscription({
    setPosts,
    isLikingRef,
  });

  /**
   * Fetches additional posts for infinite scroll
   * This is used for loading MORE posts (pagination), not initial load
   */
  const fetchMorePosts = useCallback(async (pageNum: number) => {
    if (!sessionId) return;

    setLoadingMore(true);

    try {
      const data = await getPostsWithLikeStatus(sessionId, {
        page: pageNum,
        limit: POSTS_PER_PAGE,
      });

      if (data.length < POSTS_PER_PAGE) {
        setHasMore(false);
      }

      // Deduplicate posts to prevent "duplicate key" React errors
      setPosts((prev) => {
        const existingIds = new Set(prev.map(p => String(p.id)));
        const newPosts = data.filter(p => !existingIds.has(String(p.id)));
        return [...prev, ...newPosts];
      });
      setPage(pageNum);
    } catch (error) {
      console.error("[HomeFeed] Error fetching more posts:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [sessionId]);

  // Note: Session initialization and liked status fetching is now handled by:
  // - sessionId: initialized with getSessionId() in useState
  // - liked status: fetched via useQuery with caching
  // - auth state: managed by AuthProvider (useAuth hook)

  // Infinite scroll observer
  useEffect(() => {
    // Capture ref value at effect setup time to use in cleanup
    const currentTarget = observerTarget.current;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && sessionId) {
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
                    await signOut();
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
          {postsWithLikedStatus.map((post) => (
            <PostCard key={post.id} post={post} onLike={handleLike} />
          ))}

          {/* Loading skeletons - shown during initialization when no posts available */}
          {/* This covers: server fetch failed, Supabase outage, or initial hydration */}
          {isInitializing && postsWithLikedStatus.length === 0 && (
            <>
              <PostCardSkeleton />
              <PostCardSkeleton />
              <PostCardSkeleton />
            </>
          )}

          {/* Empty state - shown when initialization is complete but no posts */}
          {!isInitializing && postsWithLikedStatus.length === 0 && (
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

          {!hasMore && postsWithLikedStatus.length > 0 && (
            <div className="text-center text-foreground/50 py-8">
              No hay más posts
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

