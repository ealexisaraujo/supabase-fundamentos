"use client";

/**
 * useScrollRestoration - Preserves scroll position across navigation
 *
 * Uses useLayoutEffect to restore scroll BEFORE the browser paints,
 * eliminating the visible "jump" from top to saved position.
 * The 'instant' scroll behavior ensures no animation delay.
 */

import { useLayoutEffect, useEffect, useRef } from "react";

export interface UseScrollRestorationOptions {
  /** Unique key for storing scroll position */
  key: string;
}

export function useScrollRestoration({ key }: UseScrollRestorationOptions) {
  const storageKey = `scroll:${key}`;
  const isRestoredRef = useRef(false);

  // Use useLayoutEffect for scroll restoration - runs before browser paint
  // This prevents the visible "flash" of the page at top before jumping to position
  useLayoutEffect(() => {
    // Disable browser's automatic scroll restoration
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    // Restore scroll position once on mount, BEFORE paint
    if (!isRestoredRef.current) {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const scrollY = parseInt(saved, 10);
        if (!isNaN(scrollY) && scrollY > 0) {
          // Use instant behavior to avoid animation
          window.scrollTo({ top: scrollY, behavior: "instant" });
        }
      }
      isRestoredRef.current = true;
    }
  }, [storageKey]);

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
