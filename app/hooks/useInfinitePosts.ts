"use client";

/**
 * useInfinitePosts - TanStack Query infinite scroll with Redis caching
 *
 * This hook provides reliable infinite scroll with:
 * - Server-side Redis caching (distributed, survives deployments)
 * - Client-side TanStack Query caching (deduplication, stale-while-revalidate)
 * - Scroll position restoration (via stable query keys)
 * - Automatic refetch on window focus (configurable)
 * - Optimistic updates support
 *
 * Architecture:
 * useInfiniteQuery → Server Action → Redis → Supabase
 *
 * @see app/actions/cached-posts.ts for server-side caching
 * @see https://tanstack.com/query/latest/docs/react/guides/infinite-queries
 */

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { fetchCachedPostsPage, type PaginatedPostsResponse } from "../actions/cached-posts";
import { fetchCountsFromRedis } from "../utils/posts-with-counts";
import type { Post } from "../mocks/posts";

const POSTS_PER_PAGE = 10;

/**
 * Query key factory for posts
 * Consistent keys ensure proper cache invalidation
 */
export const postsQueryKeys = {
  all: ["posts"] as const,
  home: () => [...postsQueryKeys.all, "home"] as const,
  homeInfinite: () => [...postsQueryKeys.home(), "infinite"] as const,
  ranked: () => [...postsQueryKeys.all, "ranked"] as const,
};

export interface UseInfinitePostsOptions {
  /** Session ID for liked status */
  sessionId: string;
  /** Initial posts from SSR (optional, for hydration) */
  initialPosts?: Post[];
  /** Posts per page */
  limit?: number;
  /** Enable/disable the query */
  enabled?: boolean;
}

export interface UseInfinitePostsReturn {
  /** Flattened array of all loaded posts */
  posts: Post[];
  /** Loading state for initial fetch */
  isLoading: boolean;
  /** Loading state for next page */
  isFetchingNextPage: boolean;
  /** Error state */
  error: Error | null;
  /** Whether there are more pages */
  hasNextPage: boolean;
  /** Function to fetch next page */
  fetchNextPage: () => void;
  /** Ref to attach to scroll trigger element */
  observerRef: React.RefObject<HTMLDivElement>;
  /** Refetch all pages */
  refetch: () => void;
  /** Update a single post optimistically */
  updatePost: (postId: string, updates: Partial<Post>) => void;
}

/**
 * Hook for infinite scroll with Redis-backed caching
 */
export function useInfinitePosts({
  sessionId,
  initialPosts = [],
  limit = POSTS_PER_PAGE,
  enabled = true,
}: UseInfinitePostsOptions): UseInfinitePostsReturn {
  const queryClient = useQueryClient();
  const observerRef = useRef<HTMLDivElement>(null);

  // useInfiniteQuery for paginated data
  const {
    data,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: postsQueryKeys.homeInfinite(),
    queryFn: async ({ pageParam = 0 }): Promise<PaginatedPostsResponse> => {
      // Fetch posts from Redis-cached server action
      const response = await fetchCachedPostsPage(pageParam, limit);

      // Merge with fresh like counts from Redis
      if (response.posts.length > 0 && sessionId) {
        const postIds = response.posts.map((p) => String(p.id));
        const { countsMap, likedMap } = await fetchCountsFromRedis(postIds, sessionId);

        // Merge counts into posts
        response.posts = response.posts.map((post) => ({
          ...post,
          likes: countsMap.get(String(post.id)) ?? post.likes,
          isLiked: likedMap.get(String(post.id)) ?? false,
        }));
      }

      return response;
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: enabled && !!sessionId,
    staleTime: 60 * 1000, // 1 minute - matches Redis TTL
    gcTime: 5 * 60 * 1000, // 5 minutes - keep in memory
    refetchOnMount: true, // Refetch when component mounts (for fresh likes)
    refetchOnWindowFocus: false, // Don't refetch on focus (too aggressive)
    // Use initial data if provided (SSR hydration)
    ...(initialPosts.length > 0 && {
      initialData: {
        pages: [
          {
            posts: initialPosts,
            nextPage: initialPosts.length === limit ? 1 : null,
            hasMore: initialPosts.length === limit,
            totalFetched: initialPosts.length,
            fromCache: true,
          },
        ],
        pageParams: [0],
      },
    }),
  });

  // Flatten pages into single array
  const posts = data?.pages.flatMap((page) => page.posts) ?? initialPosts;

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const currentRef = observerRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observer.observe(currentRef);

    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Optimistic update helper
  const updatePost = useCallback(
    (postId: string, updates: Partial<Post>) => {
      queryClient.setQueryData(
        postsQueryKeys.homeInfinite(),
        (oldData: { pages: PaginatedPostsResponse[]; pageParams: number[] } | undefined) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              posts: page.posts.map((post) =>
                String(post.id) === postId ? { ...post, ...updates } : post
              ),
            })),
          };
        }
      );
    },
    [queryClient]
  );

  return {
    posts,
    isLoading,
    isFetchingNextPage,
    error: error as Error | null,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    observerRef: observerRef as React.RefObject<HTMLDivElement>,
    refetch,
    updatePost,
  };
}

/**
 * Hook to invalidate posts cache
 * Call this after mutations (like, create post, etc.)
 */
export function useInvalidatePosts() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    // Invalidate all posts queries
    queryClient.invalidateQueries({ queryKey: postsQueryKeys.all });
  }, [queryClient]);
}
