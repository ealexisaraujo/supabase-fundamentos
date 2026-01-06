"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { getPostsWithLikeStatus } from "../utils/posts";
import { subscribeToPostLikes, togglePostLike } from "../utils/ratings";
import { getSessionId } from "../utils/session";
import type { Post } from "../mocks/posts";
import { PostModal } from "../components/PostModal";
import { RankItemSkeleton } from "../components/Skeletons";
import { HeartIcon } from "../components/icons";
import { ThemeToggle } from "../components/ThemeToggle";

// Base64 gray placeholder for loading images
const BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mFrYGb6DwAEsAGzK+3tCAAAAABJRU5ErkJggg==";

export default function RankPage() {
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [isLiking, setIsLiking] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

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
      try {
        if (sid) {
          setLoading(true);
          const data = await getPostsWithLikeStatus(sid, {
            minLikes: 5,
            orderBy: "likes",
            ascending: false,
          });
          setPosts(data);
        }
      } catch (error) {
        console.error("Error fetching ranked posts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();

    // Subscribe to real-time like updates
    const unsubscribe = subscribeToPostLikes((update) => {
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          post.id === update.postId ? { ...post, likes: update.likes } : post
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

  const sortedPosts = [...posts].sort((a, b) => b.likes - a.likes);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card-bg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="w-10" /> {/* Spacer for centering */}
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Ranking
          </h1>
          <ThemeToggle />
        </div>
      </header>

      {/* Grid de posts */}
      <main className="max-w-2xl mx-auto p-2">
        {/* Empty state */}
        {!loading && posts.length === 0 && (
          <div className="text-center text-foreground/50 py-16">
            <p className="text-lg">No hay posts populares aún</p>
            <p className="text-sm mt-2">
              Los posts con más de 5 likes aparecerán aquí
            </p>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-3 gap-1">
          {loading
            ? Array.from({ length: 9 }).map((_, i) => (
                <RankItemSkeleton key={i} />
              ))
            : sortedPosts.map((post) => (
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
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                    unoptimized
                  />
                  {/* Overlay con likes al hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <HeartIcon
                      filled={post.isLiked || false}
                      className="w-6 h-6"
                    />
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
        <PostModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onLike={handleLike}
        />
      )}
    </div>
  );
}
