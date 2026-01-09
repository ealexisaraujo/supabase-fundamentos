"use client";

/**
 * useScrollRestoration - Preserves scroll position across navigation
 *
 * This hook saves the scroll position to sessionStorage when the user
 * navigates away and restores it when they return to the page.
 *
 * Features:
 * - Saves scroll position on beforeunload and visibilitychange
 * - Restores scroll position on mount (with a small delay for content to render)
 * - Uses sessionStorage (persists during session, cleared on tab close)
 * - Supports custom storage keys for different pages
 *
 * @param key - Unique key for storing scroll position (default: current pathname)
 */

import { useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";

export interface UseScrollRestorationOptions {
  /** Custom storage key (defaults to pathname) */
  key?: string;
  /** Delay in ms before restoring scroll (for content to render) */
  restoreDelay?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export function useScrollRestoration(options: UseScrollRestorationOptions = {}) {
  const pathname = usePathname();
  const { key = pathname, restoreDelay = 100, debug = false } = options;

  const storageKey = `scroll-position:${key}`;
  const hasRestoredRef = useRef(false);

  const log = useCallback(
    (message: string, ...args: unknown[]) => {
      if (debug) {
        console.log(`[ScrollRestoration] ${message}`, ...args);
      }
    },
    [debug]
  );

  // Save scroll position
  const saveScrollPosition = useCallback(() => {
    const scrollY = window.scrollY;
    if (scrollY > 0) {
      sessionStorage.setItem(storageKey, String(scrollY));
      log("Saved scroll position:", scrollY);
    }
  }, [storageKey, log]);

  // Restore scroll position
  const restoreScrollPosition = useCallback(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true; // Mark as attempted early to prevent multiple calls

    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      const scrollY = parseInt(saved, 10);
      if (!isNaN(scrollY) && scrollY > 0) {
        log("Restoring scroll position:", scrollY);

        // Use requestAnimationFrame + setTimeout for reliable restoration
        // This ensures the DOM has been painted before scrolling
        const restore = () => {
          requestAnimationFrame(() => {
            window.scrollTo({ top: scrollY, behavior: "instant" });
            log("Scroll restored to:", scrollY);
          });
        };

        // Restore after initial render
        setTimeout(restore, restoreDelay);
        // Restore again after content might have loaded
        setTimeout(restore, 300);
        // Final attempt for slow content
        setTimeout(restore, 600);
      }
    }
  }, [storageKey, restoreDelay, log]);

  // Clear saved position (call when you want to reset)
  const clearScrollPosition = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    hasRestoredRef.current = false;
    log("Cleared scroll position");
  }, [storageKey, log]);

  useEffect(() => {
    // Disable browser's automatic scroll restoration
    // This allows our custom restoration to work
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    // Restore scroll position on mount
    restoreScrollPosition();

    // Save scroll position when leaving page
    const handleBeforeUnload = () => saveScrollPosition();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveScrollPosition();
      }
    };

    // Save scroll position periodically while scrolling (throttled)
    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(saveScrollPosition, 150);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("scroll", handleScroll, { passive: true });

    // Cleanup
    return () => {
      // Save position before unmounting (navigation)
      saveScrollPosition();

      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [saveScrollPosition, restoreScrollPosition]);

  return {
    saveScrollPosition,
    restoreScrollPosition,
    clearScrollPosition,
  };
}
