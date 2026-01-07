"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, PlusIcon, RankIcon } from "./icons";

export default function BottomNav() {
  const pathname = usePathname();

  // Hide navigation on auth pages
  if (pathname?.startsWith("/auth")) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card-bg border-t border-border">
      <div className="max-w-lg mx-auto flex items-center justify-around py-2">
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
            pathname === "/" ? "text-primary" : "text-foreground/60 hover:text-foreground"
          }`}
        >
          <HomeIcon filled={pathname === "/"} />
          <span className="text-xs font-medium">Home</span>
        </Link>

        <Link
          href="/post"
          className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-primary to-accent text-white shadow-lg hover:scale-105 transition-transform"
        >
          <PlusIcon />
        </Link>

        <Link
          href="/rank"
          className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
            pathname === "/rank" ? "text-primary" : "text-foreground/60 hover:text-foreground"
          }`}
        >
          <RankIcon filled={pathname === "/rank"} />
          <span className="text-xs font-medium">Rank</span>
        </Link>
      </div>
    </nav>
  );
}
