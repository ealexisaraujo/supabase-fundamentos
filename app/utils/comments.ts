import { supabase } from "./client";
import { comments as mockComments } from "../mocks/comments";
import type { Comment, CommentProfile, CreateCommentInput, UpdateCommentInput } from "../types/comment";

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

/**
 * Get the current user's profile for commenting
 * Returns null if user is not authenticated or has no profile
 */
export async function getCurrentUserProfile(): Promise<CommentProfile | null> {
  if (USE_MOCKS) {
    return {
      id: "mock-profile-id",
      username: "mockuser",
      avatar_url: "https://i.pravatar.cc/40?u=mockuser",
    };
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    console.error("Error fetching user profile for comments:", error);
    return null;
  }

  return profile;
}

export async function getCommentsByPostId(postId: string): Promise<Comment[]> {
  if (USE_MOCKS) {
    console.log("Using mock data for comments");
    return mockComments.filter((c) => c.post_id === postId);
  }

  const { data, error } = await supabase
    .from("comments")
    .select(`
      *,
      profile:profiles (
        id,
        username,
        avatar_url
      )
    `)
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching comments from Supabase:", error);
    return [];
  }

  return data || [];
}

export async function getCommentCount(postId: string): Promise<number> {
  if (USE_MOCKS) {
    return mockComments.filter((c) => c.post_id === postId).length;
  }

  const { count, error } = await supabase
    .from("comments")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId);

  if (error) {
    console.error("Error fetching comment count from Supabase:", error);
    return 0;
  }

  return count || 0;
}

export async function createComment(input: CreateCommentInput): Promise<Comment | null> {
  if (USE_MOCKS) {
    console.log("Mock: Creating comment", input);
    const newComment: Comment = {
      id: crypto.randomUUID(),
      post_id: input.post_id,
      user_id: input.user_id,
      profile_id: input.profile_id,
      content: input.content,
      profile: {
        id: input.profile_id,
        username: "mockuser",
        avatar_url: "https://i.pravatar.cc/40?u=mockuser",
      },
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockComments.push(newComment);
    return newComment;
  }

  // Require authentication - user_id and profile_id are mandatory
  if (!input.user_id || !input.profile_id) {
    console.error("Authentication required: user_id and profile_id must be provided");
    return null;
  }

  const commentData = {
    post_id: input.post_id,
    content: input.content,
    user_id: input.user_id,
    profile_id: input.profile_id,
  };

  const { data, error } = await supabase
    .from("comments")
    .insert(commentData)
    .select(`
      *,
      profile:profiles (
        id,
        username,
        avatar_url
      )
    `)
    .single();

  if (error) {
    console.error("Error creating comment in Supabase:", error);
    return null;
  }

  return data;
}

export async function updateComment(
  commentId: string,
  input: UpdateCommentInput
): Promise<Comment | null> {
  if (USE_MOCKS) {
    console.log("Mock: Updating comment", commentId, input);
    const index = mockComments.findIndex((c) => c.id === commentId);
    if (index === -1) return null;
    mockComments[index] = {
      ...mockComments[index],
      content: input.content,
      updated_at: new Date(),
    };
    return mockComments[index];
  }

  const { data, error } = await supabase
    .from("comments")
    .update({ content: input.content })
    .eq("id", commentId)
    .select()
    .single();

  if (error) {
    console.error("Error updating comment in Supabase:", error);
    return null;
  }

  return data;
}

export async function deleteComment(commentId: string): Promise<boolean> {
  if (USE_MOCKS) {
    console.log("Mock: Deleting comment", commentId);
    const index = mockComments.findIndex((c) => c.id === commentId);
    if (index === -1) return false;
    mockComments.splice(index, 1);
    return true;
  }

  const { error } = await supabase.from("comments").delete().eq("id", commentId);

  if (error) {
    console.error("Error deleting comment from Supabase:", error);
    return false;
  }

  return true;
}
