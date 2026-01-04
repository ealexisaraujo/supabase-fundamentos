import { supabase } from "./client";
import { posts as mockPosts, type Post } from "../mocks/posts";
import { getSessionLikes } from "./ratings";

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

export async function getRankedPosts(): Promise<Post[]> {
  if (USE_MOCKS) {
    console.log("Using mock data for ranking");
    return [...mockPosts].sort((a, b) => b.likes - a.likes);
  }

  const { data, error } = await supabase
    .from("posts_new")
    .select("id, image_url, caption, likes, user, user_id, created_at")
    .gt("likes", 5)
    .order("likes", { ascending: false });

  if (error) {
    console.error("Error fetching ranked from Supabase:", JSON.stringify(error, null, 2));
    return [];
  }

  return data || [];
}

/**
 * Fetches posts with session-specific liked status
 * This combines post data with whether the current session has liked each post
 */
export async function getPostsWithLikeStatus(sessionId: string): Promise<Post[]> {
  if (USE_MOCKS) {
    console.log("Using mock data with session likes");
    return mockPosts;
  }

  const { data, error } = await supabase
    .from("posts_new")
    .select("*")
    .order("created_at", { ascending: false });

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

  // Merge liked status into posts
  return data.map((post) => ({
    ...post,
    isLiked: likedMap.get(post.id) || false,
  }));
}
