/**
 * Home Page - Server Component
 *
 * This is the main entry point for the home feed. It uses server-side caching
 * to reduce Supabase hits and improve initial load performance.
 *
 * Architecture:
 * - Server Component (this file): Fetches and caches initial posts data
 * - Client Component (HomeFeed): Handles interactivity, real-time updates, infinite scroll
 *
 * Caching Strategy:
 * - Initial posts are cached for 60 seconds using unstable_cache
 * - Cache is invalidated via revalidateTag('posts') when likes change
 * - Real-time subscription in HomeFeed keeps like counts up-to-date
 *
 * @see app/utils/cached-posts.ts for cache configuration
 * @see app/components/HomeFeed.tsx for client-side logic
 */

import { getCachedHomePosts } from "./utils/cached-posts";
import { HomeFeed } from "./components/HomeFeed";

// Debug: Log when this server component renders
console.log("[Home Page] Server Component rendering - fetching cached posts");

export default async function Home() {
  // Fetch initial posts from cache (or Supabase if cache miss)
  // This reduces database hits significantly
  const initialPosts = await getCachedHomePosts(0, 10);

  console.log(`[Home Page] Passing ${initialPosts.length} cached posts to HomeFeed`);

  // Pass cached data to client component for interactive features
  return <HomeFeed initialPosts={initialPosts} />;
}
