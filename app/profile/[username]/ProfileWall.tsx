"use client";

/**
 * ProfileWall - Grid of User's Posts
 *
 * Displays a grid of posts created by the user on their profile page.
 * Shows empty state for users without posts, with a CTA for the profile owner.
 */

import Image from "next/image";
import Link from "next/link";
import type { ProfilePost } from "../../utils/cached-profiles";
import { HeartIcon, GridIcon, PlusIcon } from "../../components/icons";

interface ProfileWallProps {
  posts: ProfilePost[];
  username: string;
  isOwner: boolean;
}

export default function ProfileWall({ posts, username, isOwner }: ProfileWallProps) {
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
    <div className="grid grid-cols-3 gap-1">
      {posts.map((post) => (
        <Link
          key={post.id}
          href={`/p/${post.id}`}
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
              <HeartIcon filled className="w-5 h-5" />
              <span className="font-semibold">{post.likes}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
