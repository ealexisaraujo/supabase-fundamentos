import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CommentsSection from "../app/components/CommentsSection";

// Mock the comments service
vi.mock("../app/utils/comments", () => ({
  getCommentsByPostId: vi.fn().mockResolvedValue([
    {
      id: "comment-1",
      post_id: "post-1",
      user_id: null,
      content: "First comment",
      user: { username: "user1", avatar: "https://example.com/avatar1.png" },
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "comment-2",
      post_id: "post-1",
      user_id: null,
      content: "Second comment",
      user: { username: "user2", avatar: "https://example.com/avatar2.png" },
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]),
  createComment: vi.fn().mockResolvedValue({
    id: "new-comment",
    post_id: "post-1",
    user_id: null,
    content: "New comment",
    user: { username: "anonymous", avatar: "https://i.pravatar.cc/40?u=anonymous" },
    created_at: new Date(),
    updated_at: new Date(),
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
});
