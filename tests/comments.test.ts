import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Comment, CreateCommentInput } from "../app/types/comment";

// Mock the supabase client
vi.mock("../app/utils/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

// Reset mocks before testing with USE_MOCKS=true
vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");

describe("Comment Types", () => {
  it("should have correct Comment interface structure", () => {
    const comment: Comment = {
      id: "test-uuid",
      post_id: "post-uuid",
      user_id: null,
      content: "Test comment",
      user: { username: "testuser", avatar: "https://example.com/avatar.png" },
      created_at: new Date(),
      updated_at: new Date(),
    };

    expect(comment.id).toBe("test-uuid");
    expect(comment.post_id).toBe("post-uuid");
    expect(comment.user_id).toBeNull();
    expect(comment.content).toBe("Test comment");
    expect(comment.user?.username).toBe("testuser");
    expect(comment.created_at).toBeInstanceOf(Date);
  });

  it("should allow user_id to be a string", () => {
    const comment: Comment = {
      id: "test-uuid",
      post_id: "post-uuid",
      user_id: "user-uuid",
      content: "Test comment",
      created_at: new Date(),
      updated_at: new Date(),
    };

    expect(comment.user_id).toBe("user-uuid");
  });

  it("should have correct CreateCommentInput structure", () => {
    const input: CreateCommentInput = {
      post_id: "post-uuid",
      content: "New comment",
      user: { username: "newuser", avatar: "https://example.com/avatar.png" },
    };

    expect(input.post_id).toBe("post-uuid");
    expect(input.content).toBe("New comment");
    expect(input.user?.username).toBe("newuser");
  });
});

describe("Comments Service with Mocks", () => {
  beforeEach(async () => {
    // Reset module cache to ensure fresh imports
    vi.resetModules();
  });

  it("should get comments by post ID from mock data", async () => {
    const { getCommentsByPostId } = await import("../app/utils/comments");
    const comments = await getCommentsByPostId("1");

    expect(Array.isArray(comments)).toBe(true);
    comments.forEach((comment) => {
      expect(comment.post_id).toBe("1");
    });
  });

  it("should return empty array for non-existent post ID", async () => {
    const { getCommentsByPostId } = await import("../app/utils/comments");
    const comments = await getCommentsByPostId("non-existent-id");

    expect(Array.isArray(comments)).toBe(true);
    expect(comments.length).toBe(0);
  });

  it("should get comment count for a post", async () => {
    const { getCommentCount } = await import("../app/utils/comments");
    const count = await getCommentCount("1");

    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("should create a new comment", async () => {
    const { createComment } = await import("../app/utils/comments");
    const input: CreateCommentInput = {
      post_id: "test-post-id",
      content: "This is a test comment",
    };

    const comment = await createComment(input);

    expect(comment).not.toBeNull();
    expect(comment?.post_id).toBe("test-post-id");
    expect(comment?.content).toBe("This is a test comment");
    expect(comment?.id).toBeDefined();
    expect(comment?.created_at).toBeDefined();
  });

  it("should create comment with custom user info", async () => {
    const { createComment } = await import("../app/utils/comments");
    const input: CreateCommentInput = {
      post_id: "test-post-id",
      content: "Comment with user",
      user: { username: "custom_user", avatar: "https://example.com/avatar.png" },
    };

    const comment = await createComment(input);

    expect(comment?.user?.username).toBe("custom_user");
    expect(comment?.user?.avatar).toBe("https://example.com/avatar.png");
  });

  it("should update an existing comment", async () => {
    const { createComment, updateComment } = await import("../app/utils/comments");

    // First create a comment
    const created = await createComment({
      post_id: "test-post-id",
      content: "Original content",
    });

    expect(created).not.toBeNull();

    // Then update it
    const updated = await updateComment(created!.id, { content: "Updated content" });

    expect(updated).not.toBeNull();
    expect(updated?.content).toBe("Updated content");
    expect(updated?.id).toBe(created!.id);
  });

  it("should delete a comment", async () => {
    const { createComment, deleteComment, getCommentsByPostId } = await import(
      "../app/utils/comments"
    );

    // Create a comment
    const created = await createComment({
      post_id: "delete-test-post",
      content: "To be deleted",
    });

    expect(created).not.toBeNull();

    // Delete it
    const result = await deleteComment(created!.id);
    expect(result).toBe(true);

    // Verify it's gone
    const comments = await getCommentsByPostId("delete-test-post");
    const found = comments.find((c) => c.id === created!.id);
    expect(found).toBeUndefined();
  });

  it("should return false when deleting non-existent comment", async () => {
    const { deleteComment } = await import("../app/utils/comments");
    const result = await deleteComment("non-existent-id");
    expect(result).toBe(false);
  });

  it("should return null when updating non-existent comment", async () => {
    const { updateComment } = await import("../app/utils/comments");
    const result = await updateComment("non-existent-id", { content: "Updated" });
    expect(result).toBeNull();
  });
});

describe("Comment Validation", () => {
  it("should handle empty content gracefully", async () => {
    const { createComment } = await import("../app/utils/comments");

    // Note: In a real app, you'd validate before calling createComment
    // This test just ensures the function handles the input
    const comment = await createComment({
      post_id: "test-post",
      content: "",
    });

    expect(comment).not.toBeNull();
    expect(comment?.content).toBe("");
  });

  it("should handle very long content", async () => {
    const { createComment } = await import("../app/utils/comments");
    const longContent = "A".repeat(1000);

    const comment = await createComment({
      post_id: "test-post",
      content: longContent,
    });

    expect(comment).not.toBeNull();
    expect(comment?.content).toBe(longContent);
  });

  it("should handle special characters in content", async () => {
    const { createComment } = await import("../app/utils/comments");
    const specialContent = "Test <script>alert('xss')</script> & special chars: áéíóú 中文 🎉";

    const comment = await createComment({
      post_id: "test-post",
      content: specialContent,
    });

    expect(comment).not.toBeNull();
    expect(comment?.content).toBe(specialContent);
  });
});
