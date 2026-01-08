"use client";

/**
 * ProfileClientPage - User Profile Display
 *
 * This component displays user profiles with edit functionality for owners.
 * Auth state is managed by AuthProvider (useAuth hook) instead of per-component fetch.
 *
 * Client-side caching:
 * - Auth state: Managed by AuthProvider (single listener, no per-component fetch)
 */

import { useState } from "react";
import Image from "next/image";
import ProfileEditForm from "../../components/ProfileEditForm";
import { ThemeToggle } from "../../components/ThemeToggle";
import { UserIcon, BackIcon, CameraIcon } from "../../components/icons";
import { Button } from "../../components/Button";
import { shouldSkipImageOptimization } from "../../utils/image";
import { useAuth } from "../../providers";

interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  website: string | null;
}

export default function ProfileClientPage({ initialProfile }: { initialProfile: Profile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [isEditing, setIsEditing] = useState(false);

  // Get auth state from centralized provider (no per-component fetch)
  const { user, isLoading: isAuthLoading } = useAuth();

  // Determine if current user is the profile owner
  const isOwner = !isAuthLoading && user?.id === profile.id;

  if (isEditing) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-40 bg-card-bg border-b border-border">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <Button
              variant="accent"
              size="sm"
              onClick={() => setIsEditing(false)}
              leftIcon={<BackIcon className="w-4 h-4" />}
            >
              Volver
            </Button>
            <h1 className="text-xl font-bold">Editar Perfil</h1>
            <div className="w-20" />
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-8">
          <ProfileEditForm
            initialProfile={profile}
            onSuccess={(updated) => {
              setProfile(updated);
              setIsEditing(false);
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card-bg border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Button
            variant="accent"
            size="sm"
            href="/"
            leftIcon={<BackIcon className="w-4 h-4" />}
          >
            Volver
          </Button>
          <h1 className="text-xl font-bold">{profile.username}</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div
            className={`relative ${isOwner ? 'group cursor-pointer' : ''}`}
            onClick={() => isOwner && setIsEditing(true)}
          >
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border bg-card-bg relative">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile.username}
                  fill
                  className="object-cover"
                  unoptimized={shouldSkipImageOptimization(profile.avatar_url)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-primary/10">
                  <UserIcon />
                </div>
              )}
              {isOwner && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                  <CameraIcon className="w-6 h-6 text-white" />
                  <span className="text-white text-xs mt-1 font-medium">Editar foto</span>
                </div>
              )}
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-xl font-bold">{profile.full_name || profile.username}</h2>
            {profile.bio && <p className="text-foreground/80 mt-2 max-w-sm whitespace-pre-wrap">{profile.bio}</p>}
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline mt-2 block text-sm"
              >
                {profile.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>

          {isOwner && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsEditing(true)}
            >
              Editar Perfil
            </Button>
          )}
        </div>

        {/* Placeholder for user posts */}
        <div className="border-t border-border pt-8">
          <div className="flex items-center justify-center gap-2 text-foreground/40 pb-8">
            <div className="w-4 h-4 rounded-full border border-current" />
            <div className="w-4 h-4 rounded-full border border-current" />
            <div className="w-4 h-4 rounded-full border border-current" />
          </div>
          <p className="text-center text-foreground/40">No posts yet (coming soon)</p>
        </div>
      </main>
    </div>
  );
}
