/**
 * Redis Cache Utilities
 *
 * This module provides cache utility functions for the Redis layer.
 * All functions include graceful degradation - if Redis is unavailable,
 * they return null/void and allow the application to fall back to
 * unstable_cache or direct Supabase queries.
 *
 * Cache Key Strategy:
 * - posts:home:{page}:{limit} - Home feed posts
 * - posts:ranked - Ranked posts
 * - profile:{username} - User profiles
 * - posts:user:{userId} - User-specific posts
 *
 * Cache Tags Strategy:
 * - Tags are stored as Redis sets containing all keys with that tag
 * - Invalidating a tag deletes all keys in the tag set
 *
 * @see app/utils/redis/client.ts for Redis client configuration
 */

import { getUpstashClient, isRedisConfigured, ensureRedisReady } from "./client";

/**
 * Cache key generators
 * Use these to ensure consistent key naming across the application
 */
export const cacheKeys = {
  /**
   * Generate cache key for home posts
   * @param page - Page number (0-based)
   * @param limit - Number of posts per page
   */
  homePosts: (page: number, limit: number) => `posts:home:${page}:${limit}`,

  /**
   * Generate cache key for ranked posts
   */
  rankedPosts: () => `posts:ranked`,

  /**
   * Generate cache key for a user profile
   * @param username - The username (will be normalized to lowercase)
   */
  profile: (username: string) => `profile:${username.toLowerCase()}`,

  /**
   * Generate cache key for a user's posts
   * @param userId - The user ID
   */
  userPosts: (userId: string) => `posts:user:${userId}`,
} as const;

/**
 * Cache tags for grouped invalidation
 * Tags allow invalidating multiple related cache entries at once
 */
export const cacheTags = {
  /** Tag for all posts (home, ranked, user posts) */
  POSTS: "tag:posts",
  /** Tag for all profiles */
  PROFILES: "tag:profiles",
  /** Tag for home feed specifically */
  HOME: "tag:home",
  /** Tag for ranked posts specifically */
  RANKED: "tag:ranked",
} as const;

/**
 * Get a value from Redis cache
 * Works with both Upstash (HTTP) and local Redis (TCP)
 *
 * @param key - The cache key to retrieve
 * @returns The cached value or null if not found/error
 *
 * @example
 * const posts = await getFromCache<Post[]>(cacheKeys.homePosts(0, 10));
 */
export async function getFromCache<T>(key: string): Promise<T | null> {
  const startTime = Date.now();

  // Try Upstash first
  const upstash = await getUpstashClient();
  if (upstash) {
    try {
      const data = await upstash.get<T>(key);
      const duration = Date.now() - startTime;

      if (data !== null) {
        console.log(`[Redis] HIT ${key} (${duration}ms)`);
      } else {
        console.log(`[Redis] MISS ${key} (${duration}ms)`);
      }

      return data;
    } catch (error) {
      console.error(`[Redis] Upstash error getting from cache (${key}):`, error);
    }
  }

  // Fall back to unified client (local Redis)
  const redis = await ensureRedisReady();
  if (!isRedisConfigured || !redis) {
    return null;
  }

  try {
    const data = await redis.get<T>(key);
    const duration = Date.now() - startTime;

    if (data !== null) {
      console.log(`[Redis] HIT ${key} (local, ${duration}ms)`);
    } else {
      console.log(`[Redis] MISS ${key} (local, ${duration}ms)`);
    }

    return data;
  } catch (error) {
    console.error(`[Redis] Error getting from cache (${key}):`, error);
    return null;
  }
}

/**
 * Set a value in Redis cache
 *
 * @param key - The cache key
 * @param value - The value to cache (must be JSON-serializable)
 * @param ttlSeconds - Time to live in seconds (optional, default: no expiry)
 * @param tags - Array of tags to associate with this key for grouped invalidation
 *
 * @example
 * await setInCache(cacheKeys.homePosts(0, 10), posts, 60, [cacheTags.POSTS, cacheTags.HOME]);
 */
export async function setInCache<T>(
  key: string,
  value: T,
  ttlSeconds?: number,
  tags?: string[]
): Promise<void> {
  // Try Upstash first (supports TTL options natively)
  const upstash = await getUpstashClient();
  if (upstash) {
    const startTime = Date.now();
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await upstash.set(key, value, { ex: ttlSeconds });
      } else {
        await upstash.set(key, value);
      }

      if (tags && tags.length > 0) {
        await Promise.all(tags.map((tag) => upstash.sadd(tag, key)));
      }

      const duration = Date.now() - startTime;
      console.log(`[Redis] SET ${key} (TTL: ${ttlSeconds || 'none'}s, ${duration}ms)`);
      return;
    } catch (error) {
      console.error(`[Redis] Upstash error setting cache (${key}):`, error);
    }
  }

  // Fall back to unified client (local Redis)
  const redis = await ensureRedisReady();
  if (!isRedisConfigured || !redis) {
    return;
  }

  const startTime = Date.now();

  try {
    // For local Redis, serialize to JSON string
    const serialized = JSON.stringify(value);
    await redis.set(key, serialized);

    // Note: Local Redis wrapper doesn't support TTL in set()
    // We rely on manual cleanup or tag-based invalidation

    // Add key to tag sets for grouped invalidation
    if (tags && tags.length > 0) {
      await Promise.all(tags.map((tag) => redis.sadd(tag, key)));
    }

    const duration = Date.now() - startTime;
    console.log(`[Redis] SET ${key} (local, ${duration}ms)`);
  } catch (error) {
    console.error(`[Redis] Error setting cache (${key}):`, error);
  }
}

/**
 * Invalidate cache entries by pattern
 *
 * Uses Redis SCAN to find and delete keys matching a pattern.
 * Use with caution as SCAN can be slow for large datasets.
 *
 * @param pattern - The pattern to match (e.g., "posts:*")
 *
 * @example
 * await invalidateCache("posts:home:*"); // Invalidate all home post pages
 */
export async function invalidateCache(pattern: string): Promise<void> {
  // Try Upstash first
  const upstash = await getUpstashClient();
  if (upstash) {
    const startTime = Date.now();
    try {
      let cursor: number = 0;
      let deletedCount = 0;

      do {
        const result = await upstash.scan(cursor, { match: pattern, count: 100 });
        cursor = typeof result[0] === "string" ? parseInt(result[0], 10) : result[0];
        const keys = result[1];

        if (keys.length > 0) {
          await upstash.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== 0);

      const duration = Date.now() - startTime;
      console.log(
        `[Redis] INVALIDATE pattern "${pattern}" (${deletedCount} keys deleted, ${duration}ms)`
      );
      return;
    } catch (error) {
      console.error(`[Redis] Upstash error invalidating cache (${pattern}):`, error);
    }
  }

  // Fall back to unified client (local Redis)
  const redis = await ensureRedisReady();
  if (!isRedisConfigured || !redis) {
    return;
  }

  const startTime = Date.now();

  try {
    // Use SCAN to find matching keys
    let cursor: number = 0;
    let deletedCount = 0;

    do {
      const result = await redis.scan(cursor, { match: pattern, count: 100 });
      cursor = typeof result[0] === "string" ? parseInt(result[0], 10) : result[0];
      const keys = result[1];

      if (keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== 0);

    const duration = Date.now() - startTime;
    console.log(
      `[Redis] INVALIDATE pattern "${pattern}" (local, ${deletedCount} keys deleted, ${duration}ms)`
    );
  } catch (error) {
    console.error(`[Redis] Error invalidating cache (${pattern}):`, error);
  }
}

/**
 * Invalidate cache entries by tag
 *
 * Retrieves all keys associated with a tag and deletes them.
 * Also cleans up the tag set itself.
 *
 * @param tag - The tag to invalidate (e.g., cacheTags.POSTS)
 *
 * @example
 * await invalidateCacheByTag(cacheTags.POSTS); // Invalidate all posts
 */
export async function invalidateCacheByTag(tag: string): Promise<void> {
  // Try Upstash first
  const upstash = await getUpstashClient();
  if (upstash) {
    const startTime = Date.now();
    try {
      const keys = await upstash.smembers(tag);

      if (keys.length > 0) {
        await upstash.del(...keys);
        await upstash.del(tag);
      }

      const duration = Date.now() - startTime;
      console.log(
        `[Redis] INVALIDATE tag "${tag}" (${keys.length} keys deleted, ${duration}ms)`
      );
      return;
    } catch (error) {
      console.error(`[Redis] Upstash error invalidating by tag (${tag}):`, error);
    }
  }

  // Fall back to unified client (local Redis)
  const redis = await ensureRedisReady();
  if (!isRedisConfigured || !redis) {
    return;
  }

  const startTime = Date.now();

  try {
    // Get all keys in the tag set
    const keys = await redis.smembers(tag);

    if (keys.length > 0) {
      // Delete all keys
      await redis.del(...keys);
      // Clear the tag set
      await redis.del(tag);
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Redis] INVALIDATE tag "${tag}" (local, ${keys.length} keys deleted, ${duration}ms)`
    );
  } catch (error) {
    console.error(`[Redis] Error invalidating by tag (${tag}):`, error);
  }
}

/**
 * Invalidate multiple tags at once
 *
 * @param tags - Array of tags to invalidate
 *
 * @example
 * await invalidateMultipleTags([cacheTags.POSTS, cacheTags.HOME]);
 */
export async function invalidateMultipleTags(tags: string[]): Promise<void> {
  // Check if any Redis client is available
  const upstash = await getUpstashClient();
  const redis = upstash || await ensureRedisReady();

  if (!isRedisConfigured || !redis) {
    return;
  }

  await Promise.all(tags.map((tag) => invalidateCacheByTag(tag)));
}

/**
 * Check if Redis is available and functioning
 * Works with both Upstash (HTTP) and local Redis (TCP)
 *
 * @returns true if Redis is configured and responding
 */
export async function isRedisAvailable(): Promise<boolean> {
  if (!isRedisConfigured) {
    return false;
  }

  // Try Upstash first
  const upstash = await getUpstashClient();
  if (upstash) {
    try {
      await upstash.ping();
      return true;
    } catch {
      // Fall through to try unified client
    }
  }

  // Try unified client (works for both Upstash and local Redis)
  const redis = await ensureRedisReady();
  if (redis) {
    try {
      // For local Redis, try a simple get operation to verify connection
      await redis.get("__health_check__");
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Cache TTL configuration
 * Centralized TTL values for consistency
 */
export const cacheTTL = {
  /** Home posts cache duration */
  HOME_POSTS: 60,
  /** Ranked posts cache duration */
  RANKED_POSTS: 300,
  /** Profile cache duration */
  PROFILE: 180,
} as const;
