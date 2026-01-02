import { supabase } from "./client";
import { posts as mockPosts, type Post } from "../mocks/posts";

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

export async function getPosts(): Promise<Post[]> {
  if (USE_MOCKS) {
    console.log("Using mock data");
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

  return data || [];
}

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
