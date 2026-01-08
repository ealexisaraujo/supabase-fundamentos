/**
 * Upstash Redis Client
 *
 * This module provides a configured Redis client for distributed caching.
 * The client is optional - if environment variables are not configured,
 * the application falls back to using only unstable_cache.
 *
 * Environment Variables Required:
 * - UPSTASH_REDIS_REST_URL: The REST URL for your Upstash Redis instance
 * - UPSTASH_REDIS_REST_TOKEN: The authentication token for Upstash
 *
 * @see https://upstash.com/docs/redis/overall/getstarted
 */

import { Redis } from "@upstash/redis";

// Environment variables for Upstash Redis
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Check if Redis is configured
 * Both URL and token must be present for Redis to be available
 */
export const isRedisConfigured = Boolean(
  UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN
);

/**
 * Redis client instance
 * Returns null if not configured, enabling graceful degradation
 */
let redisClient: Redis | null = null;

if (isRedisConfigured) {
  try {
    redisClient = new Redis({
      url: UPSTASH_REDIS_REST_URL!,
      token: UPSTASH_REDIS_REST_TOKEN!,
    });
    console.log("[Redis] Client initialized successfully");
  } catch (error) {
    console.error("[Redis] Failed to initialize client:", error);
    redisClient = null;
  }
} else {
  console.log(
    "[Redis] Not configured (missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN)"
  );
}

/**
 * Get the Redis client
 * Returns null if Redis is not configured or initialization failed
 */
export function getRedisClient(): Redis | null {
  return redisClient;
}

/**
 * Export the redis client directly for convenience
 * Will be null if not configured
 */
export const redis = redisClient;
