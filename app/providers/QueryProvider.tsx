"use client";

/**
 * QueryProvider - TanStack Query Configuration
 *
 * This provider sets up TanStack Query (React Query) for client-side
 * data fetching and caching. It provides:
 *
 * - Automatic request deduplication
 * - Configurable cache times (staleTime, gcTime)
 * - Background refetching
 * - Optimistic updates support
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/overview
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * Creates a QueryClient with optimized defaults for this application
 *
 * Cache Strategy:
 * - staleTime: 60s - Data is considered fresh for 60 seconds
 * - gcTime: 5min - Unused data kept in cache for 5 minutes
 * - refetchOnWindowFocus: false - Don't refetch when tab regains focus
 * - retry: 1 - Retry failed requests once
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 60 seconds
        // During this time, cached data is returned without refetching
        staleTime: 60 * 1000,

        // Keep unused data in cache for 5 minutes
        // After this, garbage collection removes it
        gcTime: 5 * 60 * 1000,

        // Don't automatically refetch when window regains focus
        // Our real-time subscriptions handle live updates
        refetchOnWindowFocus: false,

        // Don't refetch on component remount if data is fresh
        refetchOnMount: false,

        // Retry failed requests once before showing error
        retry: 1,

        // Don't refetch when reconnecting (we have real-time for that)
        refetchOnReconnect: false,
      },
      mutations: {
        // Retry mutations once on failure
        retry: 1,
      },
    },
  });
}

// Browser: Create client once and reuse
// Server: Create new client for each request (not shared between users)
let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    if (!browserQueryClient) {
      browserQueryClient = makeQueryClient();
    }
    return browserQueryClient;
  }
}

export function QueryProvider({ children }: QueryProviderProps) {
  // Use state to ensure client is created only once per component lifecycle
  // This pattern is recommended by TanStack Query for Next.js App Router
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/**
 * Query Keys - Centralized query key management
 *
 * Using a structured query key factory ensures:
 * - Consistent keys across the app
 * - Easy cache invalidation
 * - Type safety
 *
 * @example
 * ```tsx
 * // Fetching
 * useQuery({
 *   queryKey: queryKeys.posts.liked(sessionId),
 *   queryFn: () => fetchLikedPosts(sessionId),
 * });
 *
 * // Invalidating
 * queryClient.invalidateQueries({ queryKey: queryKeys.posts.all });
 * ```
 */
export const queryKeys = {
  posts: {
    all: ["posts"] as const,
    liked: (sessionId: string) => ["posts", "liked", sessionId] as const,
    home: (sessionId: string, page: number) =>
      ["posts", "home", sessionId, page] as const,
    ranked: (sessionId: string) => ["posts", "ranked", sessionId] as const,
  },
  comments: {
    all: ["comments"] as const,
    byPost: (postId: string) => ["comments", postId] as const,
  },
  profiles: {
    all: ["profiles"] as const,
    byUsername: (username: string) => ["profiles", username] as const,
  },
} as const;
