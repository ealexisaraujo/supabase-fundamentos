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
    // Save scroll position on scroll (throttled)
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          sessionStorage.setItem(storageKey, String(window.scrollY));
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      // Save final position on unmount
      sessionStorage.setItem(storageKey, String(window.scrollY));
      window.removeEventListener("scroll", handleScroll);
    };
  }, [storageKey]);
}
