import { notFound } from "next/navigation";
import { getCachedProfile } from "../../utils/cached-profiles";
import ProfileClientPage from "./ProfileClientPage";

/**
 * Profile Page - Server Component with Caching
 *
 * This page uses unstable_cache to cache profile data for 3 minutes.
 * The cached data is passed to ProfileClientPage for interactivity.
 *
 * Cache Strategy:
 * - Cache duration: 180 seconds (3 minutes)
 * - Cache tags: 'profiles', 'profile-{username}'
 * - Invalidation: Via revalidateProfileCache() after profile updates
 *
 * What's cached: Profile data (username, full_name, bio, website, avatar_url)
 * What's client-side: isOwner check (requires auth session)
 *
 * @see app/utils/cached-profiles.ts for caching implementation
 * @see app/actions/revalidate-profiles.ts for cache invalidation
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = await params;
  const username = resolvedParams.username;

  // Fetch cached profile data
  // This uses unstable_cache with a standalone Supabase client
  // (no cookies needed since profiles have public read access)
  const profile = await getCachedProfile(username);

  if (!profile) {
    notFound();
  }

  return <ProfileClientPage initialProfile={profile} />;
}
