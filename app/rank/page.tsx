/**
 * Ranking Page - Server Component
 *
 * This page displays posts ranked by likes (>5 likes threshold).
 * It uses server-side caching to reduce Supabase hits.
 *
 * Architecture:
 * - Server Component (this file): Fetches and caches ranked posts data
 * - Client Component (RankGrid): Handles interactivity, real-time updates, modal
 *
 * Caching Strategy:
 * - Ranked posts are cached for 5 minutes using unstable_cache
 * - Cache is invalidated via revalidateTag('ranked-posts') when likes change
 * - Real-time subscription in RankGrid keeps like counts up-to-date
 *
 * @see app/utils/cached-posts.ts for cache configuration
 * @see app/components/RankGrid.tsx for client-side logic
 */

import { getCachedRankedPosts } from "../utils/cached-posts";
import { RankGrid } from "../components/RankGrid";

// Debug: Log when this server component renders
console.log("[Rank Page] Server Component rendering - fetching cached ranked posts");

export default async function RankPage() {
  // Fetch ranked posts from cache (or Supabase if cache miss)
  // This reduces database hits significantly - cached for 5 minutes
  const initialPosts = await getCachedRankedPosts();

  console.log(`[Rank Page] Passing ${initialPosts.length} cached ranked posts to RankGrid`);

  // Pass cached data to client component for interactive features
  return <RankGrid initialPosts={initialPosts} />;
}
