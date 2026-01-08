"use server";

/**
 * Server Actions for Profile Cache Revalidation
 *
 * These server actions are used to invalidate cached profile data after mutations.
 *
 * Next.js 16 Cache Invalidation Strategy:
 * - revalidateTag: Marks cached data with tag as stale (Data Cache)
 * - revalidatePath: Purges Router Cache for specific paths + revalidates Data Cache
 *
 * For profile updates, we use both to ensure:
 * 1. Data Cache is invalidated for the specific profile
 * 2. Router Cache is purged so navigation shows fresh data
 *
 * @see app/utils/cached-profiles.ts for cache tags
 * @see https://nextjs.org/docs/app/api-reference/functions/revalidatePath
 * @see https://nextjs.org/docs/app/api-reference/functions/revalidateTag
 */

import { revalidateTag, revalidatePath } from "next/cache";
import { PROFILE_CACHE_TAGS } from "../utils/cached-profiles";

// Cache profile for revalidation - use "default" for standard behavior
const CACHE_PROFILE = "default";

/**
 * Revalidates a specific profile's cache
 *
 * Uses revalidateTag for the specific profile and revalidatePath for Router Cache.
 * This is the most reliable way to ensure fresh data on navigation.
 *
 * Call this after any mutation that affects a profile:
 * - Update profile (name, bio, website)
 * - Upload avatar
 * - Username change (call for BOTH old and new username)
 *
 * @param username - The username of the profile to revalidate
 * @returns Promise<{ success: boolean; revalidatedTag: string }>
 */
export async function revalidateProfileCache(username: string): Promise<{
  success: boolean;
  revalidatedTag: string;
}> {
  const normalizedUsername = username.toLowerCase();
  const profileTag = PROFILE_CACHE_TAGS.profileTag(normalizedUsername);

  console.log(
    `[Server Action] Revalidating profile cache for: ${normalizedUsername}`
  );

  try {
    // Revalidate the specific profile tag (Data Cache)
    revalidateTag(profileTag, CACHE_PROFILE);

    // Also revalidate the global profiles tag for any lists
    revalidateTag(PROFILE_CACHE_TAGS.PROFILES, CACHE_PROFILE);

    // Purge Router Cache for the profile page
    // This ensures client-side navigation shows fresh data
    revalidatePath(`/profile/${normalizedUsername}`);

    console.log(
      `[Server Action] Profile cache revalidated for: ${normalizedUsername}`
    );

    return {
      success: true,
      revalidatedTag: profileTag,
    };
  } catch (error) {
    console.error(
      `[Server Action] Error revalidating profile cache for ${normalizedUsername}:`,
      error
    );
    return {
      success: false,
      revalidatedTag: profileTag,
    };
  }
}

/**
 * Revalidates cache when username changes
 *
 * This handles the special case where a user changes their username.
 * Both the old and new username caches need to be invalidated.
 *
 * @param oldUsername - The previous username
 * @param newUsername - The new username
 * @returns Promise<{ success: boolean }>
 */
export async function revalidateUsernameChange(
  oldUsername: string,
  newUsername: string
): Promise<{ success: boolean }> {
  console.log(
    `[Server Action] Revalidating username change: ${oldUsername} → ${newUsername}`
  );

  try {
    // Invalidate the old username cache
    await revalidateProfileCache(oldUsername);

    // Invalidate the new username cache
    await revalidateProfileCache(newUsername);

    console.log(
      `[Server Action] Username change cache revalidated: ${oldUsername} → ${newUsername}`
    );

    return { success: true };
  } catch (error) {
    console.error(
      `[Server Action] Error revalidating username change:`,
      error
    );
    return { success: false };
  }
}

/**
 * Revalidates all profile caches
 *
 * Use this sparingly - only when a global change affects all profiles.
 * For individual profile updates, use revalidateProfileCache instead.
 *
 * @returns Promise<{ success: boolean }>
 */
export async function revalidateAllProfiles(): Promise<{ success: boolean }> {
  console.log("[Server Action] Revalidating all profiles cache");

  try {
    // Revalidate the global profiles tag
    revalidateTag(PROFILE_CACHE_TAGS.PROFILES, CACHE_PROFILE);

    // Purge Router Cache for the profile index
    revalidatePath("/profile");

    console.log("[Server Action] All profiles cache revalidated");

    return { success: true };
  } catch (error) {
    console.error(
      "[Server Action] Error revalidating all profiles cache:",
      error
    );
    return { success: false };
  }
}
