import { supabase } from "./client";
import { posts as mockPosts, type Post } from "../mocks/posts";
import { getSessionLikes } from "./ratings";
import { transformSupabasePost, type SupabasePostRaw } from "./transform-post";

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

/**
 * Options for fetching posts with like status
 */
export interface GetPostsOptions {
  /** Minimum number of likes to filter by (e.g., 5 for ranked posts) */
  minLikes?: number;
  /** Field to order by */
  orderBy?: 'created_at' | 'likes';
  /** Sort direction */
  ascending?: boolean;
  /** Page number (0-based) */
  page?: number;
  /** Number of items per page */
  limit?: number;
}

/**
 * Fetches posts with session-specific liked status
 * This combines post data with whether the current session has liked each post
 *
 * @param sessionId - The session ID to check like status against
 * @param options - Optional filtering and sorting options
 * @returns Posts with isLiked status for the session
 *
 * @example
 * // Home page - all posts, newest first (default)
 * const posts = await getPostsWithLikeStatus(sessionId);
 *
 * @example
 * // Rank page - posts with >5 likes, sorted by likes
 * const rankedPosts = await getPostsWithLikeStatus(sessionId, {
 *   minLikes: 5,
 *   orderBy: 'likes',
 *   ascending: false
 * });
 */
export async function getPostsWithLikeStatus(
  sessionId: string,
  options: GetPostsOptions = {}
): Promise<Post[]> {
  const { minLikes, orderBy = 'created_at', ascending = false, page = 0, limit = 10 } = options;

  if (USE_MOCKS) {
    let result = [...mockPosts];

    // Apply minLikes filter for mocks
    if (minLikes !== undefined) {
      result = result.filter(post => post.likes > minLikes);
    }

    // Apply sorting for mocks
    if (orderBy === 'likes') {
      result.sort((a, b) => ascending ? a.likes - b.likes : b.likes - a.likes);
    } else {
      result.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return ascending ? dateA - dateB : dateB - dateA;
      });
    }

    // Apply pagination for mocks
    const start = page * limit;
    const end = start + limit;
    return result.slice(start, end);
  }

  // Build query - include comment count using Supabase aggregation
  let query = supabase
    .from("posts_new")
    .select(`
      *,
      comments(count)
    `);

  // Apply minLikes filter if specified
  if (minLikes !== undefined) {
    query = query.gt("likes", minLikes);
  }

  // Apply ordering
  query = query.order(orderBy, { ascending });

  // Apply pagination
  const from = page * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching from Supabase:", error);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Get liked status for all posts
  const postIds = data.map((post) => post.id);
  const likedMap = await getSessionLikes(postIds, sessionId);

  // Transform and merge liked status into posts
  return data.map((post) => {
    const transformedPost = transformSupabasePost(post as SupabasePostRaw);
    return {
      ...transformedPost,
      isLiked: likedMap.get(post.id) || false,
    };
  });
}
