"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HomeIcon, PlusIcon, RankIcon, UserIcon } from "./icons";
import { useAuth } from "../providers";
import { supabase } from "../utils/client";

export default function BottomNav() {
  const pathname = usePathname();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [profile, setProfile] = useState<{ username: string; avatar_url: string | null } | null>(null);

  // Fetch profile when user is available
  useEffect(() => {
    async function fetchProfile() {
      if (!user) {
        setProfile(null);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data);
      }
    }

    fetchProfile();
  }, [user]);

  // Hide navigation on auth pages
  if (pathname?.startsWith("/auth")) {
    return null;
  }

  // Determine profile link destination
  // If user has no username yet, redirect to /profile (which goes to /profile/create)
  const profileHref = profile?.username ? `/profile/${profile.username}` : "/profile";
  const isProfileActive = pathname?.startsWith("/profile");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card-bg border-t border-border">
      <div className="max-w-lg mx-auto flex items-center justify-around py-2">
        <Link
          href="/"
          scroll={false}
          className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
            pathname === "/" ? "text-primary" : "text-foreground/60 hover:text-foreground"
          }`}
        >
          <HomeIcon filled={pathname === "/"} />
          <span className="text-xs font-medium">Home</span>
        </Link>

        <Link
          href="/rank"
          scroll={false}
          className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
            pathname === "/rank" ? "text-primary" : "text-foreground/60 hover:text-foreground"
          }`}
        >
          <RankIcon filled={pathname === "/rank"} />
          <span className="text-xs font-medium">Rank</span>
        </Link>

        {/* Create post button - links to login if not authenticated */}
        <Link
          href={user ? "/post" : "/auth/login?redirect=/post"}
          className={`flex items-center justify-center w-12 h-12 rounded-full shadow-lg hover:scale-105 transition-transform ${
            user
              ? "bg-gradient-to-r from-primary to-accent text-white"
              : "bg-foreground/20 text-foreground/60"
          }`}
          title={user ? "Crear post" : "Inicia sesion para publicar"}
        >
          <PlusIcon />
        </Link>

        {/* Profile link - shows avatar if logged in */}
        <Link
          href={profileHref}
          className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
            isProfileActive ? "text-primary" : "text-foreground/60 hover:text-foreground"
          }`}
        >
          {isAuthLoading ? (
            // Loading skeleton
            <div className="w-6 h-6 rounded-full bg-foreground/20 animate-pulse" />
          ) : user && profile?.avatar_url ? (
            // Authenticated user with avatar
            <div className={`relative w-6 h-6 rounded-full overflow-hidden ring-2 ${
              isProfileActive ? "ring-primary" : "ring-transparent"
            }`}>
              <Image
                src={profile.avatar_url}
                alt={profile.username}
                fill
                sizes="24px"
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            // Default user icon
            <UserIcon filled={isProfileActive} />
          )}
          <span className="text-xs font-medium">
            {user ? (profile?.username || "Perfil") : "Login"}
          </span>
        </Link>
      </div>
    </nav>
  );
}
