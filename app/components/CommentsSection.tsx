"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { getTimeAgo } from "../utils/time";
import {
  getCommentsByPostId,
  getCommentCount,
  createComment,
  getCurrentUserProfile,
} from "../utils/comments";
import { useAuth } from "../providers/AuthProvider";
import type { Comment, CommentProfile } from "../types/comment";
import { CommentSkeleton } from "./Skeletons";

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
  // Prefer profile data (from FK join), fallback to legacy user JSONB
  const displayName = comment.profile?.username || comment.user?.username || "Anonymous";
  const avatarUrl = comment.profile?.avatar_url || comment.user?.avatar || "https://i.pravatar.cc/32?u=anonymous";

  return (
    <div className="flex items-start gap-2 py-2">
      <Link
        href={comment.profile ? `/profile/${displayName}` : "#"}
        className={comment.profile ? "cursor-pointer" : "cursor-default"}
      >
        <div className="relative w-8 h-8 rounded-full overflow-hidden ring-1 ring-border flex-shrink-0">
          <Image
            src={avatarUrl}
            alt={displayName}
            fill
            sizes="32px"
            className="object-cover"
          />
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <Link
            href={comment.profile ? `/profile/${displayName}` : "#"}
            className={`font-semibold text-foreground ${comment.profile ? "hover:underline" : ""}`}
          >
            {displayName}
          </Link>{" "}
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
  initiallyExpanded?: boolean;
}

export default function CommentsSection({
  postId,
  initialCommentCount = 0,
  initiallyExpanded = false,
}: CommentsSectionProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [newComment, setNewComment] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [userProfile, setUserProfile] = useState<CommentProfile | null>(null);
  const hasLoadedRef = useRef(false);
  const hasLoadedCountRef = useRef(false);
  const hasLoadedProfileRef = useRef(false);

  // Fetch user's profile when authenticated
  useEffect(() => {
    if (hasLoadedProfileRef.current || authLoading) return;

    if (user) {
      hasLoadedProfileRef.current = true;
      getCurrentUserProfile().then(setUserProfile);
    }
  }, [user, authLoading]);

  // Fetch comment count on mount to display accurate initial count
  useEffect(() => {
    if (hasLoadedCountRef.current) return;
    hasLoadedCountRef.current = true;

    const fetchCount = async () => {
      const count = await getCommentCount(postId);
      setCommentCount(count);
    };
    fetchCount();
  }, [postId]);

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

    // Require authentication
    if (!user || !userProfile) {
      console.error("Authentication required to comment");
      return;
    }

    setIsSubmitting(true);
    try {
      const comment = await createComment({
        post_id: postId,
        content: newComment.trim(),
        user_id: user.id,
        profile_id: userProfile.id,
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
            <div className="py-2 space-y-2">
              <CommentSkeleton />
              <CommentSkeleton />
              <CommentSkeleton />
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

          {/* Add comment form - only for authenticated users */}
          {user && userProfile ? (
            <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
              <div className="relative w-8 h-8 rounded-full overflow-hidden ring-1 ring-border flex-shrink-0">
                <Image
                  src={userProfile.avatar_url || "https://i.pravatar.cc/32?u=default"}
                  alt={userProfile.username}
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              </div>
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
          ) : (
            <div className="mt-3 p-3 bg-card-bg rounded-lg border border-border text-center">
              <p className="text-sm text-foreground/60">
                <Link href="/auth/login" className="text-primary hover:underline font-medium">
                  Login
                </Link>{" "}
                to add a comment
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
