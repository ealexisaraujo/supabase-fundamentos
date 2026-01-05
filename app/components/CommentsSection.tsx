"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { getTimeAgo } from "../utils/time";
import {
  getCommentsByPostId,
  createComment,
} from "../utils/comments";
import type { Comment } from "../types/comment";

function CommentIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-7 h-7"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-5 h-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
      />
    </svg>
  );
}

interface CommentItemProps {
  comment: Comment;
}

function CommentItem({ comment }: CommentItemProps) {
  return (
    <div className="flex items-start gap-2 py-2">
      <div className="relative w-8 h-8 rounded-full overflow-hidden ring-1 ring-border flex-shrink-0">
        <Image
          src={comment.user?.avatar || "https://i.pravatar.cc/32?u=anonymous"}
          alt={comment.user?.username || "Anonymous"}
          fill
          sizes="32px"
          className="object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-semibold text-foreground">
            {comment.user?.username || "Anonymous"}
          </span>{" "}
          <span className="text-foreground/80">{comment.content}</span>
        </p>
        <span className="text-xs text-foreground/50">
          {getTimeAgo(new Date(comment.created_at))}
        </span>
      </div>
    </div>
  );
}

interface CommentsSectionProps {
  postId: string;
  initialCommentCount?: number;
}

export default function CommentsSection({
  postId,
  initialCommentCount = 0,
}: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const hasLoadedRef = useRef(false);

  const loadComments = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getCommentsByPostId(postId);
      setComments(data);
      setCommentCount(data.length);
    } catch (error) {
      console.error("Failed to load comments:", error);
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (isExpanded && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadComments();
    }
  }, [isExpanded, loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const comment = await createComment({
        post_id: postId,
        content: newComment.trim(),
      });

      if (comment) {
        setComments((prev) => [...prev, comment]);
        setCommentCount((prev) => prev + 1);
        setNewComment("");
      }
    } catch (error) {
      console.error("Failed to create comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      {/* Comment button and count */}
      <button
        onClick={toggleExpanded}
        className="flex items-center gap-2 text-foreground/70 hover:text-foreground transition-colors"
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "Hide comments" : "Show comments"}
      >
        <CommentIcon />
        <span className="text-sm font-medium">
          {commentCount} {commentCount === 1 ? "comment" : "comments"}
        </span>
      </button>

      {/* Expanded comments section */}
      {isExpanded && (
        <div className="mt-3">
          {/* Comments list */}
          {isLoading ? (
            <div className="py-4 text-center text-foreground/50">
              <span className="inline-block animate-pulse">Loading comments...</span>
            </div>
          ) : comments.length > 0 ? (
            <div className="max-h-60 overflow-y-auto">
              {comments.map((comment) => (
                <CommentItem key={comment.id} comment={comment} />
              ))}
            </div>
          ) : (
            <p className="py-2 text-sm text-foreground/50">
              No comments yet. Be the first to comment!
            </p>
          )}

          {/* Add comment form */}
          <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              disabled={isSubmitting}
              maxLength={500}
            />
            <button
              type="submit"
              disabled={!newComment.trim() || isSubmitting}
              className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Send comment"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
