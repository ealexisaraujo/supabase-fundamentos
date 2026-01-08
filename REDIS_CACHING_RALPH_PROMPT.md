# Ralph Prompt: Redis Caching Layer Implementation

## Task Overview

Implement an Upstash Redis caching layer for Suplatzigram to complement the existing `unstable_cache` with a distributed, persistent cache that survives deployments and provides sub-millisecond response times.

## Current Architecture Context

The application currently uses a two-layer caching strategy:

### Layer 1: Server-Side (unstable_cache)
- `utils/cached-posts.ts` - Home/Ranked posts (60s/5min cache)
- `utils/cached-profiles.ts` - Profile pages (3min cache)
- **Limitation**: Cache is per-instance, lost on deployment, not shared across serverless functions

### Layer 2: Client-Side (TanStack Query)
- `providers/QueryProvider.tsx` - 60s stale time
- `providers/AuthProvider.tsx` - Auth state management
- **Works well**: No changes needed here

### Current Data Flow
```
User Request → unstable_cache → Supabase → Response
                    ↓ (miss)
              Query Database
```

### Target Data Flow
```
User Request → unstable_cache → Redis → Supabase → Response
                    ↓ (miss)      ↓ (miss)
              Check Redis    Query Database
                    ↓              ↓
              Return cached   Cache in Redis + Return
```

## Requirements

### Phase 1: Redis Client Setup
1. Install `@upstash/redis` package
2. Create `app/utils/redis/client.ts` with Upstash client configuration
3. Use environment variables: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
4. Export typed client with error handling wrapper

### Phase 2: Cache Utility Functions
Create `app/utils/redis/cache.ts` with:

```typescript
// Core functions needed:
export async function getFromCache<T>(key: string): Promise<T | null>
export async function setInCache<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
export async function invalidateCache(pattern: string): Promise<void>
export async function invalidateCacheByTag(tag: string): Promise<void>

// Cache key generators:
export const cacheKeys = {
  homePosts: (page: number, limit: number) => `posts:home:${page}:${limit}`,
  rankedPosts: () => `posts:ranked`,
  profile: (username: string) => `profile:${username}`,
  userPosts: (userId: string) => `posts:user:${userId}`,
} as const;

// Cache tags for grouped invalidation:
export const cacheTags = {
  POSTS: 'tag:posts',
  PROFILES: 'tag:profiles',
  HOME: 'tag:home',
  RANKED: 'tag:ranked',
} as const;
```

### Phase 3: Integrate with Existing Cache Functions

Modify `app/utils/cached-posts.ts`:

**Before:**
```typescript
export async function getCachedHomePosts(page: number, limit: number) {
  const cachedFetch = unstable_cache(
    async () => fetchHomePosts(page, limit),
    ['home-posts', `page-${page}`, `limit-${limit}`],
    { revalidate: 60, tags: ['posts', 'home-posts'] }
  );
  return cachedFetch();
}
```

**After:**
```typescript
export async function getCachedHomePosts(page: number, limit: number) {
  const cacheKey = cacheKeys.homePosts(page, limit);
  
  // Try Redis first
  const redisData = await getFromCache<Post[]>(cacheKey);
  if (redisData) {
    console.log(`[Cache] Redis HIT for ${cacheKey}`);
    return redisData;
  }
  
  // Fall back to unstable_cache + Supabase
  const cachedFetch = unstable_cache(
    async () => {
      const posts = await fetchHomePosts(page, limit);
      // Store in Redis for next time
      await setInCache(cacheKey, posts, 60);
      return posts;
    },
    ['home-posts', `page-${page}`, `limit-${limit}`],
    { revalidate: 60, tags: ['posts', 'home-posts'] }
  );
  
  console.log(`[Cache] Redis MISS for ${cacheKey}, fetching from Supabase`);
  return cachedFetch();
}
```

### Phase 4: Update Cache Invalidation

Modify `app/actions/revalidate-posts.ts`:

```typescript
"use server";

import { revalidateTag, revalidatePath } from "next/cache";
import { invalidateCacheByTag, cacheTags } from "@/app/utils/redis/cache";

export async function revalidatePostsCache() {
  // Invalidate Redis cache
  await invalidateCacheByTag(cacheTags.POSTS);
  
  // Invalidate Next.js Data Cache
  revalidateTag("posts", "default");
  revalidateTag("home-posts", "default");
  revalidateTag("ranked-posts", "default");
  
  // Purge Router Cache
  revalidatePath("/");
  revalidatePath("/rank");
}
```

### Phase 5: Profile Caching

Modify `app/utils/cached-profiles.ts` (or create if doesn't exist):

```typescript
export async function getCachedProfile(username: string) {
  const cacheKey = cacheKeys.profile(username);
  
  // Try Redis first
  const redisData = await getFromCache<Profile>(cacheKey);
  if (redisData) return redisData;
  
  // Fetch and cache
  const profile = await fetchProfile(username);
  if (profile) {
    await setInCache(cacheKey, profile, 180); // 3 min TTL
  }
  return profile;
}
```

### Phase 6: Environment Configuration

Add to `.env.local`:
```
UPSTASH_REDIS_REST_URL=<your-upstash-url>
UPSTASH_REDIS_REST_TOKEN=<your-upstash-token>
```

Add to `.env.example`:
```
# Upstash Redis (optional - falls back to unstable_cache only)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### Phase 7: Graceful Degradation

The Redis layer MUST be optional. If Redis is unavailable:
- Log warning, don't throw errors
- Fall back to existing `unstable_cache` behavior
- Application continues working

```typescript
export async function getFromCache<T>(key: string): Promise<T | null> {
  if (!redis) {
    console.warn('[Redis] Client not configured, skipping cache');
    return null;
  }
  
  try {
    return await redis.get<T>(key);
  } catch (error) {
    console.error('[Redis] Error getting from cache:', error);
    return null; // Graceful degradation
  }
}
```

### Phase 8: Testing & Verification

1. All existing tests must pass: `npm run test:run`
2. Manual testing checklist:
   - [ ] Home page loads with Redis cache (check logs for "Redis HIT")
   - [ ] Rank page loads with Redis cache
   - [ ] Profile pages load with Redis cache
   - [ ] Like a post → Cache invalidated → Next load shows fresh data
   - [ ] Create a post → Cache invalidated → Post appears immediately
   - [ ] Disable Redis env vars → App still works (fallback)

3. Add console logging for cache operations:
   ```
   [Redis] HIT posts:home:0:10 (2ms)
   [Redis] MISS posts:ranked, fetching from Supabase
   [Redis] SET posts:ranked (TTL: 300s)
   [Redis] INVALIDATE tag:posts (5 keys deleted)
   ```

### Phase 9: Documentation

Update `CLAUDE.md` with:
- New environment variables
- Redis caching architecture diagram
- Cache TTL configuration table
- Troubleshooting guide

Update or create `docs/004-redis-caching.md` with full implementation details.

## File Structure

```
app/
├── utils/
│   ├── redis/
│   │   ├── client.ts      # Upstash Redis client
│   │   └── cache.ts       # Cache utilities & key generators
│   ├── cached-posts.ts    # Modified to use Redis
│   └── cached-profiles.ts # Modified to use Redis
├── actions/
│   └── revalidate-posts.ts # Modified for Redis invalidation
docs/
└── 004-redis-caching.md   # Implementation documentation
```

## Success Criteria

1. **Performance**: Redis cache hits return in <10ms (vs 100-500ms Supabase)
2. **Reliability**: App works with or without Redis configured
3. **Observability**: Clear logging for cache hits/misses/invalidations
4. **Consistency**: Cache invalidation works correctly after mutations
5. **Tests**: All 40+ existing tests still pass
6. **Documentation**: CLAUDE.md and docs updated

## Cache TTL Configuration

| Data Type | Redis TTL | unstable_cache | Rationale |
|-----------|-----------|----------------|-----------|
| Home Posts | 60s | 60s | Balance freshness with performance |
| Ranked Posts | 300s (5min) | 300s | Rankings change less frequently |
| Profiles | 180s (3min) | 180s | Profile data is semi-static |

## Constraints

- DO NOT modify TanStack Query client-side caching
- DO NOT change the Supabase schema or queries
- DO NOT break existing real-time subscriptions for likes
- DO NOT require Redis for the app to function (graceful degradation)
- PRESERVE all existing functionality

## Completion Promise

When all phases are complete and verified:
- All tests pass
- Manual testing checklist complete
- Documentation updated
- No console errors in development
- Redis cache working (verified via logs)

Output: <promise>REDIS_CACHING_COMPLETE</promise>

---

## Ralph Loop Command

```bash
/ralph-loop "Implement Upstash Redis caching layer for Suplatzigram following the requirements in REDIS_CACHING_RALPH_PROMPT.md. 

Work iteratively:
1. Read REDIS_CACHING_RALPH_PROMPT.md for full requirements
2. Read CLAUDE.md for project context
3. Read existing cache files in app/utils/
4. Implement Phase 1 (Redis client setup)
5. Run tests to verify nothing broken
6. Implement Phase 2 (cache utilities)
7. Run tests
8. Continue through all phases
9. After each phase, verify with tests and manual checks
10. Update documentation

If tests fail:
- Read the error output
- Fix the issue
- Re-run tests
- Continue only when tests pass

If blocked:
- Document what's blocking in docs/004-redis-caching.md
- Try alternative approaches
- After 15 iterations without progress, document status and suggest next steps

Output <promise>REDIS_CACHING_COMPLETE</promise> when:
- All 9 phases implemented
- All tests pass (npm run test:run)
- Documentation updated
- Manual testing checklist in prompt verified" --completion-promise "REDIS_CACHING_COMPLETE" --max-iterations 50
```

## Escape Hatch

If after 30 iterations the implementation is stuck:
1. Document what was accomplished in `docs/004-redis-caching.md`
2. List specific blockers
3. Commit working partial implementation
4. Output: <promise>REDIS_CACHING_PARTIAL</promise>
