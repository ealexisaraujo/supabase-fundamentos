/**
 * Redis Cache Module
 *
 * Centralized exports for Redis caching functionality.
 *
 * @example
 * import { getFromCache, setInCache, cacheKeys, cacheTags } from '@/app/utils/redis';
 *
 * Counter operations (source of truth for likes):
 * import { toggleLike, getLikeCounts, getLikedStatuses } from '@/app/utils/redis';
 *
 * Background sync to Supabase:
 * import { syncLikeToSupabase, reconcileCounter } from '@/app/utils/redis';
 */

// Client exports
export { redis, getRedisClient, isRedisConfigured, ensureRedisReady } from "./client";

// Cache utility exports
export {
  getFromCache,
  setInCache,
  invalidateCache,
  invalidateCacheByTag,
  invalidateMultipleTags,
  isRedisAvailable,
  cacheKeys,
  cacheTags,
  cacheTTL,
} from "./cache";

// Counter exports (source of truth for like counts)
export {
  toggleLike,
  getLikeCount,
  getLikeCounts,
  isLikedBySession,
  getLikedStatuses,
  syncCounterFromDB,
  initializeCountersFromDB,
  counterKeys,
  getLikeIdentifier,
  getUserLikesKey,
  type LikeResult,
} from "./counters";

// Sync exports (background Supabase synchronization)
export {
  syncLikeToSupabase,
  reconcileCounter,
  reconcileAllCounters,
  migrateSessionLikesToProfile,
} from "./sync";
