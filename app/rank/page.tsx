"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { getTimeAgo } from "../utils/time";
import { getPostsWithLikeStatus } from "../utils/posts";
import { subscribeToPostLikes, togglePostLike } from "../utils/ratings";
import { getSessionId } from "../utils/session";
import type { Post } from "../mocks/posts";
import CommentsSection from "../components/CommentsSection";

function HeartIcon({ filled }: { filled: boolean }) {
  if (filled) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-6 h-6 text-red-500"
      >
        <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-6 h-6"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
      />
    </svg>
  );
}

function Modal({
  post,
  onClose,
  onLike,
}: {
  post: Post;
  onClose: () => void;
  onLike: (id: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-card-bg rounded-xl overflow-hidden max-w-lg w-full shadow-xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón cerrar */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          aria-label="Cerrar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Header con usuario */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-primary">
            <Image
              src={post.user?.avatar || "https://picsum.photos/40"}
              alt={post.user?.username || "default_user"}
              fill
              sizes="40px"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">{post.user?.username || "default_user"}</span>
            <span className="text-xs text-foreground/50">{getTimeAgo(new Date(post.created_at))}</span>
          </div>
        </div>

        {/* Imagen */}
        <div className="relative w-full aspect-square max-h-[40vh]">
          <Image
            src={post.image_url}
            alt={`Post de ${post.user?.username || "default_user"}`}
            fill
            sizes="(max-width: 768px) 100vw, 500px"
            className="object-cover"
          />
        </div>

        {/* Likes y caption */}
        <div className="p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onLike(String(post.id))}
              className="hover:scale-110 transition-transform active:scale-95"
              aria-label={post.isLiked ? "Quitar like" : "Dar like"}
            >
              <HeartIcon filled={post.isLiked || false} />
            </button>
            <span className="text-lg font-bold text-foreground">
              {post.likes.toLocaleString()} likes
            </span>
          </div>
          <p className="mt-2 text-foreground">
            <span className="font-semibold">{post.user?.username || "default_user"}</span>{" "}
            <span className="text-foreground/80">{post.caption}</span>
          </p>
          {/* Comments section */}
          <CommentsSection postId={String(post.id)} />
        </div>
      </div>
    </div>
  );
}

export default function RankPage() {
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [isLiking, setIsLiking] = useState<Set<string>>(new Set());

  const handleLike = async (postId: string) => {
    // Prevent double-clicking while processing
    if (isLiking.has(postId)) {
      return;
    }

    // Optimistic update for immediate UI feedback
    setPosts((prevPosts) =>
      prevPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              isLiked: !post.isLiked,
              likes: post.isLiked ? post.likes - 1 : post.likes + 1,
            }
          : post
      )
    );
    // Also update selected post
    setSelectedPost((prev) =>
      prev && prev.id === postId
        ? {
            ...prev,
            isLiked: !prev.isLiked,
            likes: prev.isLiked ? prev.likes - 1 : prev.likes + 1,
          }
        : prev
    );

    // Mark as processing
    setIsLiking((prev) => new Set(prev).add(postId));

    // Persist to database
    const result = await togglePostLike(postId, sessionId);

    // Remove from processing
    setIsLiking((prev) => {
      const next = new Set(prev);
      next.delete(postId);
      return next;
    });

    // If failed, revert the optimistic update
    if (!result.success) {
      console.error("Failed to toggle like:", result.error);
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          post.id === postId
            ? {
                ...post,
                isLiked: !post.isLiked,
                likes: post.isLiked ? post.likes - 1 : post.likes + 1,
              }
            : post
        )
      );
      setSelectedPost((prev) =>
        prev && prev.id === postId
          ? {
              ...prev,
              isLiked: !prev.isLiked,
              likes: prev.isLiked ? prev.likes - 1 : prev.likes + 1,
            }
          : prev
      );
    }
  };

  useEffect(() => {
    // Get or create session ID
    const sid = getSessionId();
    setSessionId(sid);

    const fetchPosts = async () => {
      if (sid) {
        const data = await getPostsWithLikeStatus(sid, {
          minLikes: 5,
          orderBy: 'likes',
          ascending: false
        });
        setPosts(data);
      }
    };

    fetchPosts();

    // Subscribe to real-time like updates
    const unsubscribe = subscribeToPostLikes((update) => {
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          post.id === update.postId
            ? { ...post, likes: update.likes }
            : post
        )
      );
      // Also update selected post if it's the one that changed
      setSelectedPost((prev) =>
        prev && prev.id === update.postId
          ? { ...prev, likes: update.likes }
          : prev
      );
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card-bg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-center">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Ranking
          </h1>
        </div>
      </header>

      {/* Grid de posts */}
      <main className="max-w-2xl mx-auto p-2">
        <div className="grid grid-cols-3 gap-1">
          {[...posts].sort((a, b) => b.likes - a.likes).map((post) => (
            <button
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className="relative aspect-square overflow-hidden group"
            >
              <Image
                src={post.image_url}
                alt={`Post con ${post.likes} likes`}
                fill
                sizes="(max-width: 768px) 33vw, 20vw"
                className="object-cover transition-transform group-hover:scale-105"
              />
              {/* Overlay con likes al hover */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <HeartIcon filled={post.isLiked || false} />
                <span className="text-white font-semibold">
                  {post.likes.toLocaleString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      </main>

      {/* Modal */}
      {selectedPost && (
        <Modal post={selectedPost} onClose={() => setSelectedPost(null)} onLike={handleLike} />
      )}
    </div>
  );
}
