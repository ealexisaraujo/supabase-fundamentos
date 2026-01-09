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

    // Check if we've already reached the target
    const checkAndRestore = () => {
      const currentScroll = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

      // If we're at or near the target, we're done
      if (currentScroll >= targetScroll - 10) {
        targetScrollRef.current = null;
        return true;
      }

      // If document is now tall enough, restore scroll
      if (maxScroll >= targetScroll) {
        window.scrollTo({ top: targetScroll, behavior: "instant" });
        targetScrollRef.current = null;
        return true;
      }

      return false;
    };

    // Initial check
    if (checkAndRestore()) return;

    // Use ResizeObserver to detect when content loads and document grows
    const resizeObserver = new ResizeObserver(() => {
      if (checkAndRestore()) {
        resizeObserver.disconnect();
      }
    });

    resizeObserver.observe(document.body);

    // Also use a timeout as fallback (max 2 seconds of retry)
    const timeout = setTimeout(() => {
      resizeObserver.disconnect();
      targetScrollRef.current = null;
    }, 2000);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeout);
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
