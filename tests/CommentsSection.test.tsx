import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import CommentsSection from "../app/components/CommentsSection";

// Mock the AuthProvider - no external variable references in factory
vi.mock("../app/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "test-user-id", email: "test@example.com" },
    session: { user: { id: "test-user-id", email: "test@example.com" } },
    isLoading: false,
    signOut: vi.fn(),
    refreshSession: vi.fn(),
  })),
}));

// Mock the comments service - no external variable references in factory
vi.mock("../app/utils/comments", () => ({
  getCommentsByPostId: vi.fn().mockResolvedValue([
    {
      id: "comment-1",
      post_id: "post-1",
      user_id: "user-1",
      profile_id: "profile-1",
      content: "First comment",
      profile: { id: "profile-1", username: "user1", avatar_url: "https://example.com/avatar1.png" },
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "comment-2",
      post_id: "post-1",
      user_id: "user-2",
      profile_id: "profile-2",
      content: "Second comment",
      profile: { id: "profile-2", username: "user2", avatar_url: "https://example.com/avatar2.png" },
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]),
  getCommentCount: vi.fn().mockResolvedValue(3),
  createComment: vi.fn().mockResolvedValue({
    id: "new-comment",
    post_id: "post-1",
    user_id: "test-user-id",
    profile_id: "test-profile-id",
    content: "New comment",
    profile: { id: "test-profile-id", username: "testuser", avatar_url: "https://example.com/avatar.png" },
    created_at: new Date(),
    updated_at: new Date(),
  }),
  getCurrentUserProfile: vi.fn().mockResolvedValue({
    id: "test-profile-id",
    username: "testuser",
    avatar_url: "https://example.com/avatar.png",
  }),
}));

describe("CommentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders comment button with count", () => {
    render(<CommentsSection postId="post-1" initialCommentCount={5} />);

    expect(screen.getByText("5 comments")).toBeInTheDocument();
  });

  it("renders singular comment text for 1 comment", () => {
    render(<CommentsSection postId="post-1" initialCommentCount={1} />);

    expect(screen.getByText("1 comment")).toBeInTheDocument();
  });

  it("renders 0 comments for no initial count", () => {
    render(<CommentsSection postId="post-1" />);

    expect(screen.getByText("0 comments")).toBeInTheDocument();
  });

  it("expands to show comments when clicked", async () => {
    render(<CommentsSection postId="post-1" initialCommentCount={2} />);

    const button = screen.getByRole("button", { name: /show comments/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("First comment")).toBeInTheDocument();
      expect(screen.getByText("Second comment")).toBeInTheDocument();
    });
  });

  it("shows comment input form when expanded", async () => {
    render(<CommentsSection postId="post-1" />);

    const button = screen.getByRole("button", { name: /show comments/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Add a comment...")).toBeInTheDocument();
    });
  });

  it("shows empty state when no comments", async () => {
    const { getCommentsByPostId } = await import("../app/utils/comments");
    vi.mocked(getCommentsByPostId).mockResolvedValueOnce([]);

    render(<CommentsSection postId="post-no-comments" />);

    const button = screen.getByRole("button", { name: /show comments/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
    });
  });

  it("submits new comment when form is submitted", async () => {
    const { createComment } = await import("../app/utils/comments");

    render(<CommentsSection postId="post-1" />);

    // Expand comments
    const expandButton = screen.getByRole("button", { name: /show comments/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Add a comment...")).toBeInTheDocument();
    });

    // Type and submit comment
    const input = screen.getByPlaceholderText("Add a comment...");
    fireEvent.change(input, { target: { value: "New comment" } });

    const submitButton = screen.getByRole("button", { name: /send comment/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(createComment).toHaveBeenCalledWith({
        post_id: "post-1",
        content: "New comment",
        user_id: "test-user-id",
        profile_id: "test-profile-id",
      });
    });
  });

  it("disables submit button when input is empty", async () => {
    render(<CommentsSection postId="post-1" />);

    const button = screen.getByRole("button", { name: /show comments/i });
    fireEvent.click(button);

    await waitFor(() => {
      const submitButton = screen.getByRole("button", { name: /send comment/i });
      expect(submitButton).toBeDisabled();
    });
  });

  it("enables submit button when input has text", async () => {
    render(<CommentsSection postId="post-1" />);

    const expandButton = screen.getByRole("button", { name: /show comments/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Add a comment...")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Add a comment...");
    fireEvent.change(input, { target: { value: "Test" } });

    const submitButton = screen.getByRole("button", { name: /send comment/i });
    expect(submitButton).not.toBeDisabled();
  });

  it("clears input after successful submission", async () => {
    render(<CommentsSection postId="post-1" />);

    const expandButton = screen.getByRole("button", { name: /show comments/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Add a comment...")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Add a comment...");
    fireEvent.change(input, { target: { value: "New comment" } });

    const submitButton = screen.getByRole("button", { name: /send comment/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });

  it("increments comment count after adding new comment", async () => {
    render(<CommentsSection postId="post-1" initialCommentCount={2} />);

    const expandButton = screen.getByRole("button", { name: /show comments/i });
    fireEvent.click(expandButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Add a comment...")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Add a comment...");
    fireEvent.change(input, { target: { value: "New comment" } });

    const submitButton = screen.getByRole("button", { name: /send comment/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("3 comments")).toBeInTheDocument();
    });
  });

  it("fetches and displays accurate comment count on mount", async () => {
    const { getCommentCount } = await import("../app/utils/comments");
    vi.mocked(getCommentCount).mockResolvedValueOnce(7);

    render(<CommentsSection postId="post-with-comments" />);

    // Initially shows 0 (default)
    expect(screen.getByText("0 comments")).toBeInTheDocument();

    // After fetching, should show the actual count
    await waitFor(() => {
      expect(screen.getByText("7 comments")).toBeInTheDocument();
    });

    // Verify getCommentCount was called with correct postId
    expect(getCommentCount).toHaveBeenCalledWith("post-with-comments");
  });

  it("calls getCommentCount on mount without user interaction", async () => {
    const { getCommentCount } = await import("../app/utils/comments");

    render(<CommentsSection postId="test-post" />);

    await waitFor(() => {
      expect(getCommentCount).toHaveBeenCalledWith("test-post");
    });
  });
});
