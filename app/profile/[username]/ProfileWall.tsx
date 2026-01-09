"use client";

/**
 * ProfileWall - Grid of User's Posts with Modal
 *
 * Displays a grid of posts created by the user on their profile page.
 * Clicking a post opens a modal with the full post details and like functionality.
 * Reuses the PostModal component from RankGrid.
 */

import Image from "next/image";
import Link from "next/link";
import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProfilePost } from "../../utils/cached-profiles";
import type { Post } from "../../mocks/posts";
import { PostModal } from "../../components/PostModal";
import { HeartIcon, GridIcon, PlusIcon } from "../../components/icons";
import { getSessionId } from "../../utils/session";
import { togglePostLike, subscribeToPostLikes } from "../../utils/ratings";
import { queryKeys } from "../../providers";
import { supabase } from "../../utils/client";

interface ProfileWallProps {
  posts: ProfilePost[];
  username: string;
  avatarUrl: string | null;
  isOwner: boolean;
}

export default function ProfileWall({ posts: initialPosts, username, avatarUrl, isOwner }: ProfileWallProps) {
  const queryClient = useQueryClient();
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>(initialPosts);
  const [sessionId] = useState<string>(() => getSessionId());
  const [isLiking, setIsLiking] = useState<Set<string>>(new Set());

  // Fetch liked status for profile posts
  const { data: likedMap } = useQuery({
    queryKey: queryKeys.posts.profileLiked(username, sessionId),
    queryFn: async () => {
      if (!sessionId || posts.length === 0) return new Map<string, boolean>();

      const postIds = posts.map(p => p.id);
      const { data } = await supabase
        .from("post_ratings")
        .select("post_id")
        .eq("session_id", sessionId)
        .in("post_id", postIds);

      const likedSet = new Set(data?.map(r => r.post_id) || []);
      return new Map<string, boolean>(
        postIds.map(id => [id, likedSet.has(id)])
      );
    },
    enabled: !!sessionId && posts.length > 0,
    staleTime: 60 * 1000,
  });

  // Convert ProfilePost to Post format for PostModal
  const convertToPost = (profilePost: ProfilePost, isLiked: boolean): Post => ({
    id: profilePost.id,
    image_url: profilePost.image_url,
    caption: profilePost.caption,
    likes: profilePost.likes,
    created_at: new Date(profilePost.created_at),
    isLiked,
    user: {
      username,
      avatar: avatarUrl || "https://i.pravatar.cc/40?u=anonymous",
    },
  });

  // Handle like/unlike with optimistic updates
  const handleLike = async (postId: string) => {
    if (isLiking.has(postId)) return;

    const currentlyLiked = likedMap?.get(postId) ?? false;

    // Optimistic update for posts state
    setPosts((prevPosts) =>
      prevPosts.map((post) =>
        post.id === postId
          ? { ...post, likes: currentlyLiked ? post.likes - 1 : post.likes + 1 }
          : post
      )
    );

    // Update selected post if open in modal
    setSelectedPost((prev) =>
      prev && String(prev.id) === postId
        ? { ...prev, isLiked: !currentlyLiked, likes: currentlyLiked ? prev.likes - 1 : prev.likes + 1 }
        : prev
    );

    // Update likedMap in TanStack Query cache
    queryClient.setQueryData(
      queryKeys.posts.profileLiked(username, sessionId),
      (old: Map<string, boolean> | undefined) => {
        if (!old) return new Map([[postId, !currentlyLiked]]);
        const newMap = new Map(old);
        newMap.set(postId, !currentlyLiked);
        return newMap;
      }
    );

    setIsLiking((prev) => new Set(prev).add(postId));

    const result = await togglePostLike(postId, sessionId);

    setIsLiking((prev) => {
      const next = new Set(prev);
      next.delete(postId);
      return next;
    });

    if (!result.success) {
      // Revert on failure
      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          post.id === postId
            ? { ...post, likes: currentlyLiked ? post.likes + 1 : post.likes - 1 }
            : post
        )
      );
      setSelectedPost((prev) =>
        prev && String(prev.id) === postId
          ? { ...prev, isLiked: currentlyLiked, likes: currentlyLiked ? prev.likes + 1 : prev.likes - 1 }
          : prev
      );
      queryClient.setQueryData(
        queryKeys.posts.profileLiked(username, sessionId),
        (old: Map<string, boolean> | undefined) => {
          if (!old) return new Map([[postId, currentlyLiked]]);
          const newMap = new Map(old);
          newMap.set(postId, currentlyLiked);
          return newMap;
        }
      );
    } else {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.all });
    }
  };

  // Real-time subscription for like updates
  const isLikingRef = useRef(isLiking);
  isLikingRef.current = isLiking;

  useEffect(() => {
    const unsubscribe = subscribeToPostLikes((update) => {
      if (isLikingRef.current.has(update.postId)) return;

      setPosts((prevPosts) =>
        prevPosts.map((post) =>
          post.id === update.postId ? { ...post, likes: update.likes } : post
        )
      );
      setSelectedPost((prev) =>
        prev && String(prev.id) === update.postId
          ? { ...prev, likes: update.likes }
          : prev
      );
    });

    return () => unsubscribe();
  }, []);

  // Posts with liked status
  const postsWithLikedStatus = useMemo(() => {
    return posts.map(post => ({
      ...post,
      isLiked: likedMap?.get(post.id) || false,
    }));
  }, [posts, likedMap]);

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-card-bg border border-border flex items-center justify-center">
          <GridIcon className="w-8 h-8 text-foreground/40" />
        </div>
        <p className="text-foreground/60 mb-4">
          {isOwner
            ? "Aun no has publicado nada"
            : `@${username} no ha publicado nada`}
        </p>
        {isOwner && (
          <Link
            href="/post"
            className="inline-flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-primary to-accent text-white rounded-full font-medium hover:opacity-90 transition-opacity"
          >
            <PlusIcon className="w-4 h-4" />
            Crear tu primer post
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {postsWithLikedStatus.map((post) => (
          <button
            key={post.id}
            onClick={() => setSelectedPost(convertToPost(post, post.isLiked))}
            className="aspect-square relative group overflow-hidden bg-card-bg"
          >
            <Image
              src={post.image_url}
              alt={post.caption || "Post"}
              fill
              sizes="(max-width: 500px) 33vw, 166px"
              className="object-cover"
              unoptimized
            />
            {/* Hover overlay with likes count */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <div className="flex items-center gap-2 text-white">
                <HeartIcon filled={post.isLiked} className="w-5 h-5" />
                <span className="font-semibold">{post.likes}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Modal */}
      {selectedPost && (
        <PostModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onLike={handleLike}
        />
      )}
    </>
  );
}
