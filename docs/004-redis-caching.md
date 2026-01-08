# 004: Upstash Redis Caching Layer

## Overview

This document describes the implementation of the Upstash Redis caching layer for Suplatzigram. The Redis layer provides a distributed cache that survives deployments and offers sub-millisecond response times, complementing the existing `unstable_cache` implementation.

## Architecture

### Three-Layer Caching Strategy

```
User Request
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Layer 1: Redis (Upstash)                           │
│  - Distributed cache, survives deployments          │
│  - Shared across serverless functions               │
│  - Sub-millisecond response times                   │
│  - TTL: 60s (posts), 300s (ranked), 180s (profiles) │
└───────────────────────────┬─────────────────────────┘
                            │ MISS
                            ▼
┌─────────────────────────────────────────────────────┐
│  Layer 2: unstable_cache (Next.js)                  │
│  - Per-instance cache                               │
│  - Fallback when Redis unavailable                  │
│  - Populates Redis on cache fill                    │
└───────────────────────────┬─────────────────────────┘
                            │ MISS
                            ▼
┌─────────────────────────────────────────────────────┐
│  Layer 3: Supabase (PostgreSQL)                     │
│  - Source of truth                                  │
│  - 100-500ms response times                         │
└─────────────────────────────────────────────────────┘
```

### Data Flow

**Read Operation:**
1. Check Redis for cached data
2. If HIT, return immediately (~2-5ms)
3. If MISS, fall back to `unstable_cache`
4. If still MISS, query Supabase
5. Store result in Redis with TTL and tags

**Write Operation (Cache Invalidation):**
1. Invalidate Redis tags (deletes all related keys)
2. Invalidate Next.js Data Cache tags
3. Purge Router Cache for affected paths

## File Structure

```
app/
├── utils/
│   ├── redis/
│   │   ├── index.ts      # Centralized exports
│   │   ├── client.ts     # Upstash Redis client configuration
│   │   └── cache.ts      # Cache utilities & key generators
│   ├── cached-posts.ts   # Modified to use Redis
│   └── cached-profiles.ts # Modified to use Redis
├── actions/
│   └── revalidate-posts.ts # Modified for Redis invalidation
```

## API Reference

### Cache Utilities (`app/utils/redis/cache.ts`)

```typescript
// Get a value from cache
async function getFromCache<T>(key: string): Promise<T | null>

// Set a value in cache with optional TTL and tags
async function setInCache<T>(
  key: string,
  value: T,
  ttlSeconds?: number,
  tags?: string[]
): Promise<void>

// Invalidate cache entries by pattern (e.g., "posts:*")
async function invalidateCache(pattern: string): Promise<void>

// Invalidate cache entries by tag
async function invalidateCacheByTag(tag: string): Promise<void>
```

### Cache Key Generators

```typescript
const cacheKeys = {
  homePosts: (page: number, limit: number) => `posts:home:${page}:${limit}`,
  rankedPosts: () => `posts:ranked`,
  profile: (username: string) => `profile:${username.toLowerCase()}`,
  userPosts: (userId: string) => `posts:user:${userId}`,
}
```

### Cache Tags

```typescript
const cacheTags = {
  POSTS: 'tag:posts',      // All posts
  PROFILES: 'tag:profiles', // All profiles
  HOME: 'tag:home',        // Home feed
  RANKED: 'tag:ranked',    // Ranked posts
}
```

## Cache TTL Configuration

| Data Type    | Redis TTL | unstable_cache | Rationale |
|-------------|-----------|----------------|-----------|
| Home Posts   | 60s       | 60s            | Balance freshness with performance |
| Ranked Posts | 300s (5min)| 300s          | Rankings change less frequently |
| Profiles     | 180s (3min)| 180s          | Profile data is semi-static |

## Environment Variables

```bash
# Required for Redis (optional - app works without)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

## Graceful Degradation

The Redis layer is completely optional. If environment variables are not configured:

1. Client initialization logs a warning: `[Redis] Not configured`
2. `getFromCache()` returns `null` (cache miss)
3. `setInCache()` does nothing
4. `invalidateCache*()` functions do nothing
5. Application continues using `unstable_cache` + Supabase

This ensures the application works in any environment without Redis.

## Console Logging

Cache operations are logged for observability:

```
[Redis] Client initialized successfully
[Redis] HIT posts:home:0:10 (2ms)
[Redis] MISS posts:ranked (1ms)
[Redis] SET posts:ranked (TTL: 300s, 15ms)
[Redis] INVALIDATE tag "tag:posts" (5 keys deleted, 8ms)
```

## Usage Examples

### Reading Cached Data

```typescript
import { getCachedHomePosts } from '@/app/utils/cached-posts';

// In a Server Component
const posts = await getCachedHomePosts(0, 10);
// Tries Redis first, falls back to unstable_cache, then Supabase
```

### Invalidating Cache After Mutation

```typescript
import { revalidatePostsCache } from '@/app/actions/revalidate-posts';

// After creating/updating/deleting a post
await revalidatePostsCache();
// Invalidates Redis tags + Next.js Data Cache + Router Cache
```

### Direct Cache Operations

```typescript
import { getFromCache, setInCache, cacheKeys, cacheTags, cacheTTL } from '@/app/utils/redis';

// Manual cache operations (if needed)
const data = await getFromCache(cacheKeys.homePosts(0, 10));
await setInCache('custom:key', data, 60, [cacheTags.POSTS]);
```

## Testing

All 40 existing tests pass with Redis integration:

```bash
npm run test:run
```

The test output shows graceful degradation:
```
[Redis] Not configured (missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN)
```

## Manual Testing Checklist

- [ ] Home page loads with Redis cache (check logs for "Redis HIT")
- [ ] Rank page loads with Redis cache
- [ ] Profile pages load with Redis cache
- [ ] Like a post → Cache invalidated → Next load shows fresh data
- [ ] Create a post → Cache invalidated → Post appears immediately
- [ ] Disable Redis env vars → App still works (fallback)

## Troubleshooting

### Redis Not Connecting

1. Verify environment variables are set correctly
2. Check Upstash dashboard for correct URL/token
3. Look for `[Redis] Client initialized successfully` in logs

### Cache Not Being Hit

1. Check if TTL expired (check `cacheTTL` values)
2. Verify cache key generation is consistent
3. Check for invalidation calls between requests

### Stale Data After Mutation

1. Ensure `revalidatePostsCache()` is called after mutations
2. Check that Redis tags are being invalidated
3. Verify Router Cache is being purged

## Performance Expectations

| Scenario | Expected Response Time |
|----------|----------------------|
| Redis HIT | 2-10ms |
| Redis MISS + unstable_cache HIT | 10-50ms |
| Full cache MISS (Supabase) | 100-500ms |

## Implementation Notes

1. **Tag-based invalidation**: Uses Redis Sets to track which keys belong to which tags, enabling efficient grouped invalidation.

2. **Cursor-based SCAN**: Pattern-based invalidation uses Redis SCAN to avoid blocking operations on large keysets.

3. **Non-blocking writes**: Cache sets are performed asynchronously inside the `unstable_cache` callback to avoid blocking the response.

4. **Type safety**: Generic types ensure cached data matches expected types at compile time.

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Project architecture overview
- [Upstash Redis Documentation](https://upstash.com/docs/redis/overall/getstarted)
- [Next.js unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
