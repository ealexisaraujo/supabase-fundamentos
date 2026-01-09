/**
 * Redis Client
 *
 * This module provides a configured Redis client for distributed caching.
 * Supports both:
 * - Upstash Redis (HTTP-based) for production/serverless
 * - Local Redis (TCP-based) for local development (server-side only)
 *
 * Environment Variables:
 * - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN: Use Upstash (HTTP)
 * - REDIS_URL: Use local Redis (TCP) - e.g., redis://localhost:6379
 *
 * Priority: Upstash > Local Redis > Fallback to Supabase
 *
 * Note: Local Redis (TCP) uses dynamic imports to avoid bundling Node.js
 * modules (net, dns) that don't work in the browser.
 *
 * @see https://upstash.com/docs/redis/overall/getstarted
 */

import { Redis as UpstashRedis } from "@upstash/redis";

// Type-only import for RedisClientType (doesn't cause bundling issues)
type RedisClientType = Awaited<ReturnType<typeof import("redis")["createClient"]>>;

// Environment variables
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Check configuration
const isUpstashConfigured = Boolean(
  UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN
);
const isLocalRedisEnabled = Boolean(process.env.REDIS_URL) ||
  (process.env.NODE_ENV === "development" && !isUpstashConfigured);

export const isRedisConfigured = isUpstashConfigured || isLocalRedisEnabled;

/**
 * Unified Redis interface that works with both Upstash and local Redis
 */
export interface UnifiedRedis {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: string | number): Promise<void>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  sismember(key: string, member: string): Promise<number | boolean>;
  smembers(key: string): Promise<string[]>;
  mget<T>(...keys: string[]): Promise<(T | null)[]>;
  del(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

// Client instances
let upstashClient: UpstashRedis | null = null;
let localClient: RedisClientType | null = null;
let unifiedClient: UnifiedRedis | null = null;

/**
 * Create Upstash Redis wrapper
 */
function createUpstashWrapper(client: UpstashRedis): UnifiedRedis {
  return {
    get: (key) => client.get(key),
    set: async (key, value) => { await client.set(key, value); },
    incr: (key) => client.incr(key),
    decr: (key) => client.decr(key),
    sadd: (key, ...members) => client.sadd(key, members),
    srem: (key, ...members) => client.srem(key, members),
    sismember: (key, member) => client.sismember(key, member),
    smembers: (key) => client.smembers(key),
    mget: (...keys) => client.mget(keys),
    del: (key) => client.del(key),
    keys: (pattern) => client.keys(pattern),
  };
}

/**
 * Create local Redis wrapper
 */
function createLocalWrapper(client: RedisClientType): UnifiedRedis {
  return {
    get: async <T>(key: string) => {
      const value = await client.get(key);
      if (value === null) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    },
    set: async (key, value) => {
      await client.set(key, String(value));
    },
    incr: (key) => client.incr(key),
    decr: (key) => client.decr(key),
    sadd: (key, ...members) => client.sAdd(key, members),
    srem: (key, ...members) => client.sRem(key, members),
    sismember: (key, member) => client.sIsMember(key, member),
    smembers: (key) => client.sMembers(key),
    mget: async <T>(...keys: string[]) => {
      const values = await client.mGet(keys);
      return values.map(v => {
        if (v === null) return null;
        try {
          return JSON.parse(v) as T;
        } catch {
          return v as unknown as T;
        }
      });
    },
    del: async (key) => {
      const result = await client.del(key);
      return result;
    },
    keys: (pattern) => client.keys(pattern),
  };
}

/**
 * Initialize Redis client
 */
async function initializeRedis(): Promise<void> {
  // Try Upstash first (production/serverless)
  if (isUpstashConfigured) {
    try {
      upstashClient = new UpstashRedis({
        url: UPSTASH_REDIS_REST_URL!,
        token: UPSTASH_REDIS_REST_TOKEN!,
      });
      unifiedClient = createUpstashWrapper(upstashClient);
      console.log("[Redis] Upstash client initialized successfully");
      return;
    } catch (error) {
      console.error("[Redis] Failed to initialize Upstash client:", error);
    }
  }

  // Try local Redis (development) - only on server side
  // Uses dynamic import to avoid bundling Node.js modules for the browser
  if (isLocalRedisEnabled && typeof window === "undefined") {
    try {
      // Dynamic import to avoid bundling Node.js modules (net, dns) for the browser
      const { createClient } = await import("redis");
      localClient = createClient({ url: REDIS_URL }) as RedisClientType;

      localClient.on("error", (err: Error) => {
        console.error("[Redis] Local client error:", err.message);
      });

      await localClient.connect();
      unifiedClient = createLocalWrapper(localClient);
      console.log(`[Redis] Local client connected to ${REDIS_URL}`);
      return;
    } catch (error) {
      console.error("[Redis] Failed to connect to local Redis:", error);
      localClient = null;
    }
  }

  console.log("[Redis] No Redis configured, using Supabase fallback");
}

// Initialize on module load (for server components)
// Note: This is async but we don't await here to avoid blocking
let initPromise: Promise<void> | null = null;

if (typeof window === "undefined") {
  // Server-side: initialize immediately
  initPromise = initializeRedis();
}

/**
 * Get the Redis client (ensures initialization is complete)
 */
export async function getRedisClient(): Promise<UnifiedRedis | null> {
  if (initPromise) {
    await initPromise;
  }
  return unifiedClient;
}

/**
 * Export the redis client directly for convenience
 * May be null during initial load or if not configured
 */
export const redis = unifiedClient;

/**
 * Get the Upstash Redis client directly (for advanced operations)
 * Use this for cache operations that need Upstash-specific features like:
 * - set with TTL options: redis.set(key, value, { ex: ttlSeconds })
 * - scan: redis.scan(cursor, { match, count })
 * - del with multiple keys: redis.del(...keys)
 * - ping: redis.ping()
 */
export async function getUpstashClient(): Promise<typeof upstashClient> {
  if (initPromise) {
    await initPromise;
  }
  return upstashClient;
}

/**
 * Ensure Redis is ready before using
 * Call this in API routes or server actions
 */
export async function ensureRedisReady(): Promise<UnifiedRedis | null> {
  if (!initPromise) {
    initPromise = initializeRedis();
  }
  await initPromise;
  return unifiedClient;
}
