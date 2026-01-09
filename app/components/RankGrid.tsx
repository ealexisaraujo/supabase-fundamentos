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
 *
 * Client-side caching:
 * - Liked status: Cached via TanStack Query (60s stale time)
 */

import Image from "next/image";
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCountsFromRedis } from "../utils/posts-with-counts";
import type { Post } from "../mocks/posts";
import { PostModal } from "./PostModal";
import { RankItemSkeleton } from "./Skeletons";
import { HeartIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { queryKeys, useAuth } from "../providers";
import { useLikeHandler, usePostLikesSubscription, useScrollRestoration } from "../hooks";
import { BLUR_DATA_URL } from "../constants";

interface RankGridProps {
  /** Initial ranked posts from server-side cached fetch */
  initialPosts: Post[];
}

export function RankGrid({ initialPosts }: RankGridProps) {
  // Preserve scroll position across navigation
  useScrollRestoration({ key: "rank-grid" });

  // Get sessionId from centralized provider
  const { sessionId } = useAuth();

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  // Initialize posts with server-provided data
  const [posts, setPosts] = useState<Post[]>(initialPosts);

  // Fetch counts and liked status from Redis with TanStack Query caching
  // Redis is the source of truth for counters, ensuring consistency across views
  const { data: redisData, isLoading: isLikedStatusLoading } = useQuery({
    queryKey: queryKeys.posts.ranked(sessionId),
    queryFn: async () => {
      if (!sessionId || posts.length === 0) {
        return { countsMap: new Map<string, number>(), likedMap: new Map<string, boolean>() };
      }

      const postIds = posts.map(p => String(p.id));
      return fetchCountsFromRedis(postIds, sessionId);
    },
    enabled: !!sessionId && posts.length > 0,
    staleTime: 30 * 1000, // Consider fresh for 30 seconds
    refetchOnMount: true, // Always refetch on mount to get fresh counts
  });

  // Also read from global counts cache (updated by other views when liking)
  const { data: globalCountsData } = useQuery({
    queryKey: queryKeys.posts.counts(sessionId),
    queryFn: () => ({ countsMap: new Map<string, number>(), likedMap: new Map<string, boolean>() }),
    enabled: !!sessionId,
    staleTime: Infinity, // Never refetch - only updated by setQueryData
  });

  // Merge counts: prefer global cache (updated by likes in other views)
  const countsMap = useMemo(() => {
    const merged = new Map<string, number>(redisData?.countsMap);
    globalCountsData?.countsMap?.forEach((count, id) => merged.set(id, count));
    return merged;
  }, [redisData?.countsMap, globalCountsData?.countsMap]);

  // Merge liked status: prefer global cache (updated by likes in other views)
  const likedMap = useMemo(() => {
    const merged = new Map<string, boolean>(redisData?.likedMap);
    globalCountsData?.likedMap?.forEach((liked, id) => merged.set(id, liked));
    return merged;
  }, [redisData?.likedMap, globalCountsData?.likedMap]);

  // Derive posts with counts and liked status from Redis
  // This ensures all views show consistent counts from Redis
  const postsWithLikedStatus = useMemo(() => {
    if (!countsMap && !likedMap) {
      return posts;
    }
    return posts.map(post => {
      const id = String(post.id);
      return {
        ...post,
        likes: countsMap?.get(id) ?? post.likes,
        isLiked: likedMap?.get(id) ?? false,
      };
    });
  }, [posts, countsMap, likedMap]);

  // Track initialization state
  const isInitializing = isLikedStatusLoading && posts.length === 0;

  // Centralized like handling with optimistic updates
  const { handleLike, isLikingRef } = useLikeHandler({
    sessionId,
    queryKey: queryKeys.posts.ranked(sessionId),
    setPosts,
    setSelectedPost,
    likedMap,
  });

  // Real-time subscription for like count updates
  usePostLikesSubscription({
    setPosts,
    setSelectedPost,
    isLikingRef,
  });

  // Sort posts by likes (descending) for display, with liked status from cache
  const sortedPosts = useMemo(() => {
    return [...postsWithLikedStatus].sort((a, b) => b.likes - a.likes);
  }, [postsWithLikedStatus]);

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
        {!isInitializing && postsWithLikedStatus.length === 0 && (
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
          {isInitializing && postsWithLikedStatus.length === 0 &&
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

