"use client";

/**
 * useScrollRestoration - Preserves scroll position across navigation
 *
 * A scalable approach that:
 * - Watches for content changes via `dataLength` prop
 * - Retries restoration when new content loads (infinite scroll friendly)
 * - Uses useLayoutEffect for initial attempt to minimize visual jank
 * - Debounces scroll saves to avoid capturing navigation resets
 *
 * @see https://dev.to/hijazi313/nextjs-15-scroll-behavior-a-comprehensive-guide-387j
 */

import { useLayoutEffect, useEffect, useRef } from "react";

export interface UseScrollRestorationOptions {
  /** Unique key for storing scroll position */
  key: string;
  /** Length of loaded data - restoration retries when this changes */
  dataLength?: number;
}

export function useScrollRestoration({ key, dataLength = 0 }: UseScrollRestorationOptions) {
  const storageKey = `scroll:${key}`;
  const targetScrollRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  // Initial restoration attempt - runs before paint
  useLayoutEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    if (!isInitializedRef.current) {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const scrollY = parseInt(saved, 10);
        if (!isNaN(scrollY) && scrollY > 0) {
          targetScrollRef.current = scrollY;
          // Immediate attempt
          window.scrollTo({ top: scrollY, behavior: "instant" });
        }
      }
      isInitializedRef.current = true;
    }
  }, [storageKey]);

  // Retry restoration when content loads (dataLength changes)
  // Also trigger infinite scroll if document is too short
  useEffect(() => {
    const target = targetScrollRef.current;
    if (target === null || target <= 0) return;

    // Use microtask to let DOM update after data change
    const timeoutId = setTimeout(() => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

      // If document is tall enough, restore to exact position
      if (maxScroll >= target) {
        window.scrollTo({ top: target, behavior: "instant" });
        targetScrollRef.current = null;
        return;
      }

      // Otherwise, scroll to bottom to trigger infinite scroll loading
      // This causes IntersectionObserver to fire and load more content
      window.scrollTo({ top: maxScroll, behavior: "instant" });
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [dataLength]);

  // Debounced scroll position saving
  useEffect(() => {
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
