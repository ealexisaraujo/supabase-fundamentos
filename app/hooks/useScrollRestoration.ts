"use client";

/**
 * useScrollRestoration - Preserves scroll position across navigation
 *
 * Handles infinite scroll scenarios by retrying restoration when content loads.
 * Uses useLayoutEffect for initial restoration to minimize visual jank.
 */

import { useLayoutEffect, useEffect, useRef } from "react";

export interface UseScrollRestorationOptions {
  /** Unique key for storing scroll position */
  key: string;
}

export function useScrollRestoration({ key }: UseScrollRestorationOptions) {
  const storageKey = `scroll:${key}`;
  const isRestoredRef = useRef(false);
  const targetScrollRef = useRef<number | null>(null);

  // Use useLayoutEffect for initial scroll restoration - runs before browser paint
  useLayoutEffect(() => {
    // Disable browser's automatic scroll restoration
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    // Get saved scroll position
    if (!isRestoredRef.current) {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const scrollY = parseInt(saved, 10);
        if (!isNaN(scrollY) && scrollY > 0) {
          targetScrollRef.current = scrollY;
          // Try immediate restoration
          window.scrollTo({ top: scrollY, behavior: "instant" });
        }
      }
      isRestoredRef.current = true;
    }
  }, [storageKey]);

  // Handle infinite scroll: retry restoration when document height grows
  useEffect(() => {
    const targetScroll = targetScrollRef.current;
    if (targetScroll === null || targetScroll <= 0) return;

    let attempts = 0;
    const maxAttempts = 20; // Max 2 seconds (20 * 100ms)

    const tryRestore = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

      // If document is tall enough, restore to exact position
      if (maxScroll >= targetScroll) {
        window.scrollTo({ top: targetScroll, behavior: "instant" });
        targetScrollRef.current = null;
        return true;
      }

      // If we've reached the target (or close enough), we're done
      if (window.scrollY >= targetScroll - 10) {
        targetScrollRef.current = null;
        return true;
      }

      // Scroll to bottom to trigger infinite scroll loading
      // This makes the IntersectionObserver trigger and load more content
      window.scrollTo({ top: maxScroll, behavior: "instant" });

      attempts++;
      return attempts >= maxAttempts;
    };

    // Initial attempt
    if (tryRestore()) return;

    // Poll every 100ms until content loads or max attempts reached
    const interval = setInterval(() => {
      if (tryRestore()) {
        clearInterval(interval);
      }
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Use regular useEffect for scroll saving (doesn't need to block paint)
  useEffect(() => {
    // Save scroll position with debounce to avoid capturing navigation resets.
    // When user clicks a navigation link, Next.js resets scroll position which
    // fires a scroll event. Using a 150ms debounce ensures that:
    // 1. User scrolls → debounce timer starts
    // 2. If navigation happens within 150ms, component unmounts and timer is cleared
    // 3. The rapid scroll reset during navigation never gets saved
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        sessionStorage.setItem(storageKey, String(window.scrollY));
        debounceTimer = null;
      }, 150);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, [storageKey]);
}
