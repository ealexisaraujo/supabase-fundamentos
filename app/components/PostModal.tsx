"use client";

import { useEffect } from "react";
import Image from "next/image";
import { getTimeAgo } from "../utils/time";
import type { Post } from "../mocks/posts";
import { HeartIcon, CloseIcon } from "./icons";
import CommentsSection from "./CommentsSection";

// Base64 gray placeholder for loading images
const BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mFrYGb6DwAEsAGzK+3tCAAAAABJRU5ErkJggg==";

interface PostModalProps {
  post: Post;
  onClose: () => void;
  onLike: (id: string) => void;
}

export function PostModal({ post, onClose, onLike }: PostModalProps) {
  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    // Prevent body scroll when modal is open
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [onClose]);

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
          <CloseIcon />
        </button>

        {/* Header con usuario */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-primary">
            <Image
              src={post.user?.avatar || "https://i.pravatar.cc/40?u=anonymous"}
              alt={post.user?.username || "Anonymous"}
              fill
              sizes="40px"
              className="object-cover"
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
              unoptimized
            />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">
              {post.user?.username || "Anonymous"}
            </span>
            <span className="text-xs text-foreground/50">
              {getTimeAgo(new Date(post.created_at))}
            </span>
          </div>
        </div>

        {/* Imagen */}
        <div className="relative w-full aspect-square max-h-[40vh]">
          <Image
            src={post.image_url}
            alt={`Post de ${post.user?.username || "Anonymous"}`}
            fill
            sizes="(max-width: 768px) 100vw, 500px"
            className="object-cover"
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
            unoptimized
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
              <HeartIcon filled={post.isLiked || false} className="w-6 h-6" />
            </button>
            <span className="text-lg font-bold text-foreground">
              {post.likes.toLocaleString()} likes
            </span>
          </div>
          {(post.caption || post.user?.username) && (
            <p className="mt-2 text-foreground">
              <span className="font-semibold">
                {post.user?.username || "Anonymous"}
              </span>
              {post.caption && (
                <>
                  {" "}
                  <span className="text-foreground/80">{post.caption}</span>
                </>
              )}
            </p>
          )}
          {/* Comments section */}
          <CommentsSection postId={String(post.id)} />
        </div>
      </div>
    </div>
  );
}
