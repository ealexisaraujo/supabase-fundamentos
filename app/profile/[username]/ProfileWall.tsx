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
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProfilePost } from "../../utils/cached-profiles";
import type { Post } from "../../mocks/posts";
import { PostModal } from "../../components/PostModal";
import { HeartIcon, GridIcon, PlusIcon } from "../../components/icons";
import { queryKeys, useAuth } from "../../providers";
import { supabase } from "../../utils/client";
import { useLikeHandler, usePostLikesSubscription } from "../../hooks";

interface ProfileWallProps {
  posts: ProfilePost[];
  username: string;
  avatarUrl: string | null;
  isOwner: boolean;
}

export default function ProfileWall({ posts: initialPosts, username, avatarUrl, isOwner }: ProfileWallProps) {
  // Get sessionId from centralized provider
  const { sessionId } = useAuth();

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>(initialPosts);

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

  // Centralized like handling with optimistic updates
  const { handleLike, isLikingRef } = useLikeHandler<ProfilePost>({
    sessionId,
    queryKey: queryKeys.posts.profileLiked(username, sessionId),
    setPosts,
    setSelectedPost,
    likedMap,
  });

  // Real-time subscription for like count updates
  usePostLikesSubscription<ProfilePost>({
    setPosts,
    setSelectedPost,
    isLikingRef,
  });

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
