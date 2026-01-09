# Redis Counter Architecture Design

## Problem Statement

### Current Issue
When a user likes a post on the rank page, the like count updates correctly on that page (446 → 447), but when navigating to the profile page or home page, the count still shows the old value (446).

### Root Cause
The current architecture uses a **fire-and-forget cache invalidation pattern** that creates race conditions:

```
Like → Supabase RPC → revalidatePostsCache().catch() → RETURNS IMMEDIATELY
                                    ↓ (async, ~200ms)
                              Cache invalidation completes
                                    ↓
                        User already navigated (sees stale data)
```

### Why This Happens
1. Three-layer caching (Redis → unstable_cache → Supabase) with async invalidation
2. Cache invalidation is not awaited
3. User navigation can occur before invalidation completes
4. Each view has its own cached copy of post data with like counts

---

## Proposed Architecture

### Core Principle
**Separate volatile data (counters) from stable data (post content)**

| Data Type | Storage | Caching Strategy |
|-----------|---------|------------------|
| Post content (image, caption, author) | Supabase | Aggressive caching (5-60 min) |
| Like counts | Redis | Source of truth, no caching needed |
| Liked status per session | Redis | Source of truth, no caching needed |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Browser)                               │
├─────────────────────────────────────────────────────────────────────────┤
│  HomeFeed    │    RankGrid    │    ProfileWall    │    PostModal        │
│      ↓              ↓                ↓                   ↓              │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    TanStack Query Cache                          │   │
│  │  - Posts content (stable)                                        │   │
│  │  - Like counts (from Redis, always fresh)                        │   │
│  │  - Liked status (from Redis, always fresh)                       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              ↑                                          │
│                    Supabase Realtime (broadcasts count changes)         │
└─────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           SERVER (Next.js)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐    │
│  │   API Routes    │     │ Server Actions  │     │ Server Components│   │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘    │
│           │                       │                        │             │
│           ▼                       ▼                        ▼             │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Redis Counter Service                        │   │
│  │  - getLikeCount(postId)                                          │   │
│  │  - incrementLike(postId, sessionId)                              │   │
│  │  - decrementLike(postId, sessionId)                              │   │
│  │  - getLikedStatus(postIds, sessionId)                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│           │                                                              │
│           ▼                                                              │
└─────────────────────────────────────────────────────────────────────────┘
                               │
           ┌───────────────────┴───────────────────┐
           ▼                                       ▼
┌─────────────────────┐                 ┌─────────────────────┐
│   Redis (Upstash)   │                 │  Supabase (Postgres) │
│   SOURCE OF TRUTH   │   ──sync──▶     │   DURABLE STORE      │
│   FOR COUNTERS      │                 │   FOR EVERYTHING     │
├─────────────────────┤                 ├─────────────────────┤
│ post:likes:{id}     │                 │ posts_new.likes     │
│ post:liked:{id}:set │                 │ post_ratings        │
│ session:likes:{sid} │                 │                     │
└─────────────────────┘                 └─────────────────────┘
```

---

## Data Flow

### Flow 1: User Likes a Post

```
┌──────┐    ┌──────────┐    ┌───────┐    ┌──────────┐    ┌──────────┐
│Client│    │ API/Hook │    │ Redis │    │ Supabase │    │ Realtime │
└──┬───┘    └────┬─────┘    └───┬───┘    └────┬─────┘    └────┬─────┘
   │             │              │             │               │
   │ Click Like  │              │             │               │
   │────────────▶│              │             │               │
   │             │              │             │               │
   │             │ INCR likes   │             │               │
   │             │─────────────▶│             │               │
   │             │              │             │               │
   │             │ SADD liked   │             │               │
   │             │─────────────▶│             │               │
   │             │              │             │               │
   │             │ new count    │             │               │
   │             │◀─────────────│             │               │
   │             │              │             │               │
   │ 447 likes   │              │             │               │
   │◀────────────│ (instant)    │             │               │
   │             │              │             │               │
   │             │              │ UPDATE      │               │
   │             │              │ (async)     │               │
   │             │──────────────┼────────────▶│               │
   │             │              │             │               │
   │             │              │             │ Broadcast     │
   │             │              │             │──────────────▶│
   │             │              │             │               │
   │             │              │             │    UPDATE     │
   │◀────────────┼──────────────┼─────────────┼───────────────│
   │             │              │             │  (all clients)│
   │             │              │             │               │
```

**Timeline:**
| Step | Time | Action |
|------|------|--------|
| 1 | 0ms | User clicks like |
| 2 | 1-5ms | Redis INCR + SADD (atomic) |
| 3 | 5ms | Client receives new count (447) |
| 4 | 50-200ms | Background: Supabase UPDATE |
| 5 | 200-500ms | Supabase Realtime broadcasts to all clients |

### Flow 2: Loading Posts (Any View)

```
┌──────┐    ┌──────────┐    ┌───────┐    ┌──────────┐
│Client│    │ Server   │    │ Redis │    │ Supabase │
└──┬───┘    └────┬─────┘    └───┬───┘    └────┬─────┘
   │             │              │             │
   │ Load Posts  │              │             │
   │────────────▶│              │             │
   │             │              │             │
   │             │ Get post content           │
   │             │ (cached or fresh)          │
   │             │────────────────────────────▶
   │             │                            │
   │             │ posts (no likes count)     │
   │             │◀────────────────────────────
   │             │              │             │
   │             │ MGET likes   │             │
   │             │─────────────▶│             │
   │             │              │             │
   │             │ counts       │             │
   │             │◀─────────────│             │
   │             │              │             │
   │             │ SMEMBERS     │             │
   │             │ liked status │             │
   │             │─────────────▶│             │
   │             │              │             │
   │             │ liked set    │             │
   │             │◀─────────────│             │
   │             │              │             │
   │ posts +     │              │             │
   │ counts +    │              │             │
   │ liked status│              │             │
   │◀────────────│              │             │
   │             │              │             │
```

---

## Redis Data Structures

### Key Schema

```
# Like count per post (String with atomic INCR/DECR)
post:likes:{postId} = "447"

# Set of session IDs that liked a post (for checking if user liked)
post:liked:{postId} = Set<sessionId>

# Set of post IDs liked by a session (for batch queries)
session:likes:{sessionId} = Set<postId>

# Optional: Sorted set for ranking (score = likes count)
posts:ranked = SortedSet<postId, likesCount>
```

### Example Data

```redis
# Post with ID "50050001-aaaa-bbbb-cccc-ddddeeee0001"
GET post:likes:50050001-aaaa-bbbb-cccc-ddddeeee0001
> "447"

SMEMBERS post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001
> ["session-abc123", "session-def456", ...]

SMEMBERS session:likes:session-abc123
> ["50050001-aaaa-bbbb-cccc-ddddeeee0001", "50050002-...", ...]

# Ranking (optional, for O(1) ranked queries)
ZREVRANGE posts:ranked 0 9 WITHSCORES
> [("post-id-1", 447), ("post-id-2", 390), ...]
```

---

## Implementation Plan

### Phase 1: Redis Counter Service

Create a new service module for Redis counter operations.

**File: `app/utils/redis/counters.ts`**

```typescript
// Core functions to implement:

interface LikeResult {
  success: boolean;
  newCount: number;
  isLiked: boolean;
  error?: string;
}

// Atomic like toggle
async function toggleLike(postId: string, sessionId: string): Promise<LikeResult>

// Get like count for single post
async function getLikeCount(postId: string): Promise<number>

// Get like counts for multiple posts (batch)
async function getLikeCounts(postIds: string[]): Promise<Map<string, number>>

// Check if session liked a post
async function isLikedBySession(postId: string, sessionId: string): Promise<boolean>

// Get liked status for multiple posts (batch)
async function getLikedStatuses(postIds: string[], sessionId: string): Promise<Map<string, boolean>>

// Sync counter from Supabase (recovery/init)
async function syncCounterFromDB(postId: string): Promise<number>

// Sync all counters from Supabase (startup/recovery)
async function syncAllCountersFromDB(): Promise<void>
```

### Phase 2: Background Sync Service

Async sync from Redis to Supabase for durability.

**File: `app/utils/redis/sync.ts`**

```typescript
// Queue a like/unlike for background sync to Supabase
async function queueLikeSync(postId: string, sessionId: string, isLike: boolean): Promise<void>

// Process sync queue (called by background job or edge function)
async function processSyncQueue(): Promise<void>

// Reconcile Redis and Supabase (periodic job)
async function reconcileCounters(): Promise<void>
```

### Phase 3: Update Data Fetching

Modify cached post fetchers to exclude like counts, then merge with Redis counts.

**Changes to `app/utils/cached-posts.ts`:**
- Remove `likes` from cached post data
- Add function to merge posts with Redis counts

**Changes to `app/utils/cached-profiles.ts`:**
- Remove `likes` from cached profile posts
- Add function to merge with Redis counts

### Phase 4: Update Components

Modify components to fetch like counts from Redis.

**Components to update:**
- `HomeFeed.tsx`
- `RankGrid.tsx`
- `ProfileWall.tsx`
- `PostCard.tsx`
- `PostModal.tsx`

### Phase 5: Update Like Handler

Replace Supabase RPC with Redis atomic operations.

**Changes to `app/hooks/useLikeHandler.ts`:**
- Call Redis `toggleLike()` instead of Supabase RPC
- Remove cache invalidation (no longer needed for counts!)
- Keep Supabase sync as background operation

---

## Migration Strategy

### Step 1: Initialize Redis Counters

```typescript
// One-time migration script
async function migrateCountersToRedis() {
  // 1. Get all posts with likes from Supabase
  const { data: posts } = await supabase
    .from('posts_new')
    .select('id, likes');

  // 2. Set each counter in Redis
  for (const post of posts) {
    await redis.set(`post:likes:${post.id}`, post.likes);
  }

  // 3. Get all ratings and build liked sets
  const { data: ratings } = await supabase
    .from('post_ratings')
    .select('post_id, session_id');

  for (const rating of ratings) {
    await redis.sadd(`post:liked:${rating.post_id}`, rating.session_id);
    await redis.sadd(`session:likes:${rating.session_id}`, rating.post_id);
  }
}
```

### Step 2: Dual-Write Period

During migration, write to both Redis and Supabase:

```typescript
async function toggleLikeDualWrite(postId: string, sessionId: string) {
  // 1. Update Redis (primary, instant response)
  const redisResult = await redisToggleLike(postId, sessionId);

  // 2. Update Supabase (secondary, async)
  supabaseToggleLike(postId, sessionId).catch(console.error);

  return redisResult;
}
```

### Step 3: Full Redis Mode

Once confident, make Redis the sole source of truth for counters:
- Remove Supabase RPC for likes
- Keep background sync for durability
- Add monitoring for Redis-Supabase drift

---

## Error Handling & Recovery

### Scenario 1: Redis Unavailable

```typescript
async function getLikeCountWithFallback(postId: string): Promise<number> {
  try {
    // Try Redis first
    const count = await redis.get(`post:likes:${postId}`);
    if (count !== null) return parseInt(count);
  } catch (error) {
    console.error('[Redis] Failed to get count:', error);
  }

  // Fallback to Supabase
  const { data } = await supabase
    .from('posts_new')
    .select('likes')
    .eq('id', postId)
    .single();

  return data?.likes ?? 0;
}
```

### Scenario 2: Redis Cold Start

On application startup or after Redis flush:

```typescript
async function warmupRedisCounters() {
  console.log('[Redis] Warming up counters from Supabase...');

  const { data: posts } = await supabase
    .from('posts_new')
    .select('id, likes');

  const pipeline = redis.pipeline();
  for (const post of posts) {
    pipeline.set(`post:likes:${post.id}`, post.likes);
  }
  await pipeline.exec();

  console.log(`[Redis] Warmed up ${posts.length} counters`);
}
```

### Scenario 3: Redis-Supabase Drift

Periodic reconciliation job:

```typescript
async function reconcileCounters() {
  // Get all counters from Redis
  const redisKeys = await redis.keys('post:likes:*');

  for (const key of redisKeys) {
    const postId = key.replace('post:likes:', '');
    const redisCount = await redis.get(key);

    // Compare with Supabase
    const { data } = await supabase
      .from('posts_new')
      .select('likes')
      .eq('id', postId)
      .single();

    if (data && parseInt(redisCount) !== data.likes) {
      console.warn(`[Reconcile] Drift detected for ${postId}: Redis=${redisCount}, DB=${data.likes}`);
      // Decide on resolution strategy (Redis wins, DB wins, or manual)
    }
  }
}
```

---

## Performance Comparison

### Current Architecture

| Operation | Latency | Bottleneck |
|-----------|---------|------------|
| Like click | 200-500ms | Supabase RPC |
| Cache invalidation | 50-200ms | Fire-and-forget |
| Navigation to new view | 100-300ms | Cache miss → Supabase |
| **Total perceived latency** | **300-800ms** | Race conditions possible |

### Proposed Architecture

| Operation | Latency | Improvement |
|-----------|---------|-------------|
| Like click | 5-10ms | Redis INCR (40x faster) |
| Background sync | 0ms (async) | Non-blocking |
| Navigation to new view | 5-10ms | Redis GET (30x faster) |
| **Total perceived latency** | **10-20ms** | Consistent everywhere |

---

## Monitoring & Observability

### Metrics to Track

```typescript
// Counter operations
const metrics = {
  'redis.likes.incr.count': Counter,
  'redis.likes.incr.latency': Histogram,
  'redis.likes.decr.count': Counter,
  'redis.likes.decr.latency': Histogram,
  'redis.likes.get.count': Counter,
  'redis.likes.get.latency': Histogram,

  // Sync operations
  'sync.queue.size': Gauge,
  'sync.processed.count': Counter,
  'sync.failed.count': Counter,

  // Drift detection
  'reconcile.drift.count': Counter,
  'reconcile.drift.amount': Histogram,
};
```

### Health Checks

```typescript
async function healthCheck() {
  const checks = {
    redis: await redis.ping().then(() => 'ok').catch(() => 'error'),
    supabase: await supabase.from('posts_new').select('count').then(() => 'ok').catch(() => 'error'),
    syncQueue: await getSyncQueueSize() < 1000 ? 'ok' : 'warning',
  };

  return checks;
}
```

---

## File Structure

```
app/
├── utils/
│   └── redis/
│       ├── client.ts          # Existing Redis client
│       ├── cache.ts           # Existing cache utilities
│       ├── counters.ts        # NEW: Counter operations
│       ├── sync.ts            # NEW: Background sync
│       └── index.ts           # Updated exports
├── hooks/
│   ├── useLikeHandler.ts      # UPDATED: Use Redis
│   └── usePostCounts.ts       # NEW: Hook for live counts
├── components/
│   ├── PostCard.tsx           # UPDATED: Use Redis counts
│   └── ...
└── actions/
    └── sync-counters.ts       # NEW: Server action for sync
```

---

## Trade-offs

### Pros
- Sub-10ms like operations (vs 200-500ms)
- Consistent counts across all views (no race conditions)
- Highly scalable (Redis handles 100k+ ops/sec)
- Simpler mental model (one source of truth for counts)

### Cons
- Added infrastructure complexity (Redis dependency)
- Eventual consistency with Supabase (acceptable for likes)
- Need for reconciliation logic
- Redis cost (Upstash charges per operation)

### Acceptable Trade-offs
- **Durability**: Supabase backup ensures no data loss
- **Consistency**: Eventual consistency is fine for social features
- **Cost**: Redis operations are cheap; faster UX is worth it

---

## Next Steps

1. [ ] Review and approve this architecture
2. [ ] Create `app/utils/redis/counters.ts`
3. [ ] Create `app/utils/redis/sync.ts`
4. [ ] Write migration script
5. [ ] Update `useLikeHandler.ts` to use Redis
6. [ ] Update data fetching to merge Redis counts
7. [ ] Test thoroughly in development
8. [ ] Deploy with feature flag
9. [ ] Monitor and iterate

---

## Questions to Resolve

1. **Sync frequency**: Should we sync to Supabase on every like, or batch?
2. **Reconciliation schedule**: How often should we check for drift?
3. **Conflict resolution**: If Redis and Supabase differ, which wins?
4. **Upstash limits**: Check Upstash plan limits for our expected volume

---

*Document created: January 2026*
*Last updated: January 2026*
*Author: Architecture Review*
