/**
 * Post Transformation Utilities
 *
 * This module provides utilities for transforming Supabase post data
 * into the application's Post format. Consolidates duplicated logic from:
 * - cached-posts.ts
 * - posts.ts
 *
 * Features:
 * - Normalizes profile field (array to single object)
 * - Extracts comment count from nested Supabase structure
 * - Handles null/undefined values gracefully
 */

import type { Post } from "../mocks/posts";

/**
 * Raw post data from Supabase query with joined profile and comment count
 */
export interface SupabasePostRaw {
  id: string | number;
  image_url: string;
  caption: string;
  likes: number;
  user?: string;
  user_id?: string | null;
  profile_id?: string | null;
  created_at: string | Date;
  profile?:
    | { username: string; avatar_url: string | null; full_name: string | null }
    | { username: string; avatar_url: string | null; full_name: string | null }[]
    | null;
  comments?: { count: number }[];
}

/**
 * Transforms a raw Supabase post into the application's Post format
 *
 * Handles:
 * - Profile normalization: Supabase may return array or single object
 * - Comment count extraction: Supabase returns { comments: [{ count: N }] }
 *
 * @param post - Raw post data from Supabase
 * @returns Normalized Post object
 *
 * @example
 * ```ts
 * const { data } = await supabase.from('posts_new').select(`
 *   *,
 *   profile:profiles (username, avatar_url, full_name),
 *   comments(count)
 * `);
 *
 * const posts = data.map(transformSupabasePost);
 * ```
 */
export function transformSupabasePost(post: SupabasePostRaw): Post {
  // Extract comment count - Supabase returns { comments: [{ count: N }] }
  const commentsData = post.comments as { count: number }[] | undefined;
  const comments_count = commentsData?.[0]?.count ?? 0;

  // Normalize profile - Supabase may return array or single object depending on relationship
  const profile = Array.isArray(post.profile)
    ? post.profile[0] || null
    : post.profile;

  return {
    ...post,
    profile,
    comments_count,
    comments: undefined, // Remove the nested comments array from response
  } as Post;
}

/**
 * Transforms an array of raw Supabase posts
 *
 * @param posts - Array of raw post data from Supabase
 * @returns Array of normalized Post objects
 */
export function transformSupabasePosts(posts: SupabasePostRaw[]): Post[] {
  return posts.map(transformSupabasePost);
}
