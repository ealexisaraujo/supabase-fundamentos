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
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProfilePost } from "../../utils/cached-profiles";
import type { Post } from "../../mocks/posts";
import { PostModal } from "../../components/PostModal";
import { HeartIcon, GridIcon, PlusIcon, PinIcon } from "../../components/icons";
import { queryKeys, useAuth } from "../../providers";
import { fetchCountsFromRedis } from "../../utils/posts-with-counts";
import { useLikeHandler, usePostLikesSubscription } from "../../hooks";
import type { HighlightPosition } from "../../types/highlight";

interface ProfileWallProps {
  posts: ProfilePost[];
  username: string;
  avatarUrl: string | null;
  isOwner: boolean;
  /** Set of post IDs that are currently highlighted */
  highlightedPostIds?: Set<string>;
  /** Handler to pin a post (only for owner) */
  onPinPost?: (postId: string, position: HighlightPosition) => Promise<boolean>;
  /** Get available positions for pinning */
  getAvailablePositions?: () => HighlightPosition[];
}

export default function ProfileWall({
  posts: initialPosts,
  username,
  avatarUrl,
  isOwner,
  highlightedPostIds,
  onPinPost,
  getAvailablePositions,
}: ProfileWallProps) {
  // Get sessionId and profileId from centralized provider
  const { sessionId, profileId } = useAuth();

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>(initialPosts);
  const [isPinning, setIsPinning] = useState(false);

  // Fetch counts and liked status from Redis
  // Redis is the source of truth for counters, ensuring consistency across views
  const { data: redisData } = useQuery({
    queryKey: [...queryKeys.posts.profileLiked(username, sessionId), profileId],
    queryFn: async () => {
      if (!sessionId || posts.length === 0) {
        return { countsMap: new Map<string, number>(), likedMap: new Map<string, boolean>() };
      }

      const postIds = posts.map(p => p.id);
      return fetchCountsFromRedis(postIds, sessionId, profileId);
    },
    enabled: !!sessionId && posts.length > 0,
    staleTime: 30 * 1000,
    refetchOnMount: true, // Always refetch on mount to get fresh counts
  });

  // Also read from global counts cache (updated by other views when liking)
  const { data: globalCountsData } = useQuery({
    queryKey: queryKeys.posts.counts(sessionId),
    queryFn: () => ({ countsMap: new Map<string, number>(), likedMap: new Map<string, boolean>() }),
    enabled: !!sessionId,
    staleTime: Infinity, // Never refetch - only updated by setQueryData
  });

  // Merge counts: prefer global cache (updated by likes in other views)
  const countsMap = useMemo(() => {
    const merged = new Map<string, number>(redisData?.countsMap);
    globalCountsData?.countsMap?.forEach((count, id) => merged.set(id, count));
    return merged;
  }, [redisData?.countsMap, globalCountsData?.countsMap]);

  // Merge liked status: prefer global cache (updated by likes in other views)
  const likedMap = useMemo(() => {
    const merged = new Map<string, boolean>(redisData?.likedMap);
    globalCountsData?.likedMap?.forEach((liked, id) => merged.set(id, liked));
    return merged;
  }, [redisData?.likedMap, globalCountsData?.likedMap]);

  // Convert ProfilePost to Post format for PostModal
  // Uses Redis counts for consistency
  const convertToPost = (profilePost: ProfilePost & { isLiked?: boolean }): Post => ({
    id: profilePost.id,
    image_url: profilePost.image_url,
    caption: profilePost.caption,
    likes: countsMap?.get(profilePost.id) ?? profilePost.likes,
    created_at: new Date(profilePost.created_at),
    isLiked: profilePost.isLiked ?? false,
    user: {
      username,
      avatar: avatarUrl || "https://i.pravatar.cc/40?u=anonymous",
    },
  });

  // Centralized like handling with optimistic updates
  const { handleLike, isLikingRef } = useLikeHandler<ProfilePost>({
    sessionId,
    profileId,
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

  // Posts with counts and liked status from Redis
  const postsWithLikedStatus = useMemo(() => {
    return posts.map(post => ({
      ...post,
      likes: countsMap?.get(post.id) ?? post.likes,
      isLiked: likedMap?.get(post.id) ?? false,
    }));
  }, [posts, countsMap, likedMap]);

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

  // Handler for pin button click - auto-assigns first available position (FIFO)
  const handlePinClick = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!onPinPost || !getAvailablePositions || isPinning) return;

    const availablePositions = getAvailablePositions();
    if (availablePositions.length === 0) return;

    // Auto-select first available position
    const position = availablePositions[0];
    setIsPinning(true);
    await onPinPost(postId, position);
    setIsPinning(false);
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {postsWithLikedStatus.map((post) => {
          const isHighlighted = highlightedPostIds?.has(post.id) ?? false;
          const canPin = isOwner && onPinPost && !isHighlighted;

          return (
            <div
              key={post.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedPost(convertToPost(post))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setSelectedPost(convertToPost(post));
                }
              }}
              className="aspect-square relative group overflow-hidden bg-card-bg cursor-pointer"
            >
              <Image
                src={post.image_url}
                alt={post.caption || "Post"}
                fill
                sizes="(max-width: 500px) 33vw, 166px"
                className="object-cover"
                unoptimized
              />

              {/* Highlighted badge (always visible if highlighted) */}
              {isHighlighted && (
                <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-sm">
                  <PinIcon filled className="w-3 h-3" />
                </div>
              )}

              {/* Hover overlay with likes count and pin button */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <div className="flex items-center gap-2 text-white">
                  <HeartIcon filled={post.isLiked} className="w-5 h-5" />
                  <span className="font-semibold">{post.likes}</span>
                </div>

                {/* Pin button (only for owner, only for non-highlighted posts) */}
                {canPin && (
                  <button
                    onClick={(e) => handlePinClick(e, post.id)}
                    className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-amber-500/90 text-white flex items-center justify-center hover:bg-amber-500 transition-colors shadow-lg"
                    aria-label="Agregar a destacados"
                  >
                    <PinIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Post Modal */}
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
