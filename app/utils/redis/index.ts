/**
 * Redis Cache Module
 *
 * Centralized exports for Redis caching functionality.
 *
 * @example
 * import { getFromCache, setInCache, cacheKeys, cacheTags } from '@/app/utils/redis';
 */

// Client exports
export { redis, getRedisClient, isRedisConfigured } from "./client";

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
