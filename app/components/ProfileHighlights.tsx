"use client";

/**
 * ProfileHighlights - Displays pinned posts section on profile
 *
 * Features:
 * - Shows 0-3 highlighted posts in a special section
 * - Click to open post modal
 * - Owner can unpin via hover button
 */

import Image from "next/image";
import { useState } from "react";
import type { ProfileHighlight, ProfilePost } from "../utils/cached-profiles";
import type { Post } from "../mocks/posts";
import { PostModal } from "./PostModal";
import { StarIcon, CloseIcon } from "./icons";
import { BLUR_DATA_URL } from "../constants";

interface ProfileHighlightsProps {
  highlights: ProfileHighlight[];
  username: string;
  avatarUrl: string | null;
  isOwner: boolean;
  onUnpin?: (postId: string) => Promise<boolean>;
  onLike: (postId: string) => void;
}

export default function ProfileHighlights({
  highlights,
  username,
  avatarUrl,
  isOwner,
  onUnpin,
  onLike,
}: ProfileHighlightsProps) {
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [unpinning, setUnpinning] = useState<string | null>(null);

  // Don't show section if no highlights and not owner
  if (highlights.length === 0 && !isOwner) {
    return null;
  }

  const convertToPost = (highlight: ProfileHighlight): Post => ({
    id: highlight.post_id,
    image_url: highlight.post?.image_url || "",
    caption: highlight.post?.caption || "",
    likes: highlight.post?.likes || 0,
    created_at: new Date(highlight.post?.created_at || Date.now()),
    isLiked: false, // Will be managed by parent
    user: {
      username,
      avatar: avatarUrl || "https://i.pravatar.cc/40?u=anonymous",
    },
  });

  const handleUnpin = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (onUnpin && !unpinning) {
      setUnpinning(postId);
      await onUnpin(postId);
      setUnpinning(null);
    }
  };

  // Empty state for owner with no highlights
  if (highlights.length === 0 && isOwner) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <StarIcon className="w-5 h-5 text-foreground/40" />
          <span className="text-sm font-medium text-foreground/40 uppercase tracking-wider">
            Destacados
          </span>
        </div>
        <div className="text-center py-6 border-2 border-dashed border-border/50 rounded-lg">
          <StarIcon className="w-8 h-8 mx-auto mb-2 text-foreground/30" />
          <p className="text-sm text-foreground/50">
            Fija hasta 3 posts para mostrar aqui
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <StarIcon filled className="w-5 h-5" />
        <span className="text-sm font-medium text-foreground/80 uppercase tracking-wider">
          Destacados
        </span>
      </div>

      {/* Highlights grid */}
      <div className="grid grid-cols-3 gap-2">
        {highlights.map((highlight) => (
          <div
            key={highlight.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedPost(convertToPost(highlight))}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setSelectedPost(convertToPost(highlight));
              }
            }}
            className="aspect-square relative group overflow-hidden rounded-lg ring-2 ring-amber-500/50 hover:ring-amber-500 transition-all cursor-pointer"
          >
            <Image
              src={highlight.post?.image_url || ""}
              alt={highlight.post?.caption || "Highlight"}
              fill
              sizes="(max-width: 500px) 33vw, 166px"
              className="object-cover"
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
              unoptimized
            />

            {/* Owner: Unpin button on hover */}
            {isOwner && onUnpin && (
              <button
                onClick={(e) => handleUnpin(e, highlight.post_id)}
                disabled={unpinning === highlight.post_id}
                className={`absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500 ${
                  unpinning === highlight.post_id ? "opacity-100 bg-red-500" : ""
                }`}
                aria-label="Quitar de destacados"
              >
                {unpinning === highlight.post_id ? (
                  <span className="animate-spin">...</span>
                ) : (
                  <CloseIcon className="w-3 h-3" />
                )}
              </button>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>
        ))}
      </div>

      {/* Modal */}
      {selectedPost && (
        <PostModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onLike={onLike}
        />
      )}
    </div>
  );
}
