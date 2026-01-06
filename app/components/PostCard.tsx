import Image from "next/image";
import { getTimeAgo } from "../utils/time";
import type { Post } from "../mocks/posts";
import { HeartIcon, CommentIcon, ShareIcon } from "./icons";
import CommentsSection from "./CommentsSection";

// Base64 gray placeholder for loading images
const BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUErkJggg==";

interface PostCardProps {
  post: Post;
  onLike: (id: number | string) => void;
  showComments?: boolean;
}

export function PostCard({ post, onLike, showComments = true }: PostCardProps) {
  return (
    <article className="bg-card-bg border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Header con usuario y avatar */}
      <div className="flex items-center gap-3 p-4">
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

      {/* Imagen del post */}
      <div className="relative w-full aspect-square bg-card-bg">
        <Image
          src={post.image_url}
          alt={`Post de ${post.user?.username || "Anonymous"}`}
          fill
          sizes="(max-width: 500px) 100vw, 500px"
          className="object-contain w-full h-full"
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          unoptimized
        />
      </div>

      {/* Acciones y caption */}
      <div className="p-4">
        {/* Botones de acción */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => onLike(post.id)}
            className="hover:scale-110 transition-transform active:scale-95"
            aria-label={post.isLiked ? "Quitar like" : "Dar like"}
          >
            <HeartIcon filled={post.isLiked || false} />
          </button>
          <button
            className="hover:scale-110 transition-transform active:scale-95"
            aria-label="Comentar"
          >
            <CommentIcon className="w-7 h-7" />
          </button>
          <button
            className="hover:scale-110 transition-transform active:scale-95"
            aria-label="Compartir"
          >
            <ShareIcon className="w-7 h-7" />
          </button>
        </div>

        {/* Contador de likes */}
        <div className="mt-2">
          <span className="font-semibold text-foreground">
            {post.likes.toLocaleString()} likes
          </span>
        </div>

        {/* Caption */}
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

        {/* Comments Section */}
        {showComments && <CommentsSection postId={String(post.id)} />}
      </div>
    </article>
  );
}
