"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { getPostsWithLikeStatus } from "./utils/posts";
import { getSessionId } from "./utils/session";
import { togglePostLike, subscribeToPostLikes } from "./utils/ratings";
import type { Post } from "./mocks/posts";
import { PostCard } from "./components/PostCard";
import { PostCardSkeleton } from "./components/Skeletons";
import { ThemeToggle } from "./components/ThemeToggle";
import Link from "next/link";
import { supabase } from "./utils/client";

export default function Home() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [isLiking, setIsLiking] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const POSTS_PER_PAGE = 5;

  const handleLike = async (postId: number | string) => {
    const postIdStr = String(postId);

    // Prevent double-clicking while processing
    if (isLiking.has(postIdStr)) {
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

    // Mark as processing
    setIsLiking((prev) => new Set(prev).add(postIdStr));

    // Persist to database
    const result = await togglePostLike(postIdStr, sessionId);

    // Remove from processing
    setIsLiking((prev) => {
      const next = new Set(prev);
      next.delete(postIdStr);
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
    }
  };

  const fetchPosts = useCallback(async (pageNum: number, isInitial = false) => {
    try {
      const sid = getSessionId();
      setSessionId(sid);

      if (!sid) return;

      if (isInitial) setLoading(true);
      else setLoadingMore(true);

      const data = await getPostsWithLikeStatus(sid, {
        page: pageNum,
        limit: POSTS_PER_PAGE,
      });

      if (data.length < POSTS_PER_PAGE) {
        setHasMore(false);
      }

      setPosts((prev) => (isInitial ? data : [...prev, ...data]));
      setPage(pageNum);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      if (isInitial) setLoading(false);
      else setLoadingMore(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPosts(0, true);
    
    // Check for user session
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    checkUser();
  }, [fetchPosts]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          fetchPosts(page + 1);
        }
      },
      { threshold: 1.0 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loading, loadingMore, page, fetchPosts]);

  // Subscribe to real-time updates for like counts
  useEffect(() => {
    const unsubscribe = subscribeToPostLikes((update) => {
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          post.id === update.postId
            ? { ...post, likes: update.likes }
            : post
        )
      );
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card-bg/80 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Left: Logo */}
          <div className="flex items-center shrink-0">
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Suplatzigram
            </h1>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <ThemeToggle />
            
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-medium text-foreground">{user.email?.split('@')[0]}</span>
                  <span className="text-[10px] text-foreground/60">{user.email}</span>
                </div>
                <button 
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setUser(null);
                    router.refresh();
                  }}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200"
                >
                  Salir
                </button>
              </div>
            ) : (
              <Link 
                href="/auth/login" 
                className="px-6 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-[#a3e635] to-[#bef264] text-black shadow-md hover:shadow-lg hover:brightness-105 transition-all transform hover:-translate-y-0.5"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Feed de posts */}
      <main className="max-w-lg mx-auto px-4 py-6">
        <div className="flex flex-col gap-6">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onLike={handleLike} />
          ))}

          {/* Loading state (initial) */}
          {loading && (
            <>
              <PostCardSkeleton />
              <PostCardSkeleton />
              <PostCardSkeleton />
            </>
          )}

          {/* Infinite scroll trigger and loading more state */}
          <div ref={observerTarget} className="h-4 w-full" />

          {loadingMore && (
            <div className="py-4">
              <PostCardSkeleton />
            </div>
          )}

          {!hasMore && posts.length > 0 && (
            <div className="text-center text-foreground/50 py-8">
              No hay más posts
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
