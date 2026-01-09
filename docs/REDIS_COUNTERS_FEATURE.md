# Redis Counters Feature Documentation

## Overview

The Redis counters feature makes Redis the **source of truth** for like counts in Suplatzigram. This solves the like count synchronization bug where counts would be inconsistent across different views (Home, Rank, Profile) due to race conditions in cache invalidation.

## Problem Statement

**Before:** Like counts were cached in multiple layers (Redis cache, `unstable_cache`, TanStack Query) with fire-and-forget invalidation. When a user liked a post on the Rank page, navigating to the Profile page might show a stale count because cache invalidation hadn't completed yet.

**After:** Redis stores the authoritative like count. All views fetch counts directly from Redis, ensuring consistency. Supabase is synced asynchronously for durability.

## Architecture

### Data Flow

```
User clicks Like
       ↓
┌─────────────────────────────────────────────────────────────────┐
│                    useLikeHandler (Client)                       │
│  1. Optimistic UI update                                         │
│  2. toggleLike() → Redis (atomic INCR/DECR + SADD/SREM)         │
│  3. syncLikeToSupabase() → Background sync (fire-and-forget)    │
└─────────────────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Redis (Source of Truth)                       │
│  • post:likes:{postId} = count (String/Integer)                  │
│  • post:liked:{postId} = Set of sessionIds                       │
│  • session:likes:{sessionId} = Set of postIds                    │
└─────────────────────────────────────────────────────────────────┘
       ↓ (async)
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase (Durability)                         │
│  • posts_new.likes column (for recovery)                         │
│  • post_ratings table (for like records)                         │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principle: Separation of Concerns

| Data Type | Source of Truth | Purpose |
|-----------|-----------------|---------|
| **Volatile** (counters) | Redis | Fast reads, atomic updates |
| **Stable** (content) | Supabase | Durability, relational queries |

## Redis Key Schema

| Key Pattern | Type | Description |
|-------------|------|-------------|
| `post:likes:{postId}` | String | Like count (integer stored as string) |
| `post:liked:{postId}` | Set | Session IDs that liked this post |
| `session:likes:{sessionId}` | Set | Post IDs liked by this session |

### Why Three Keys?

1. **`post:likes:{postId}`** - O(1) counter reads for display
2. **`post:liked:{postId}`** - O(1) check if session liked a post
3. **`session:likes:{sessionId}`** - O(1) batch check for multiple posts

## Implementation Files

### Core Counter Service

**`app/utils/redis/counters.ts`**

| Function | Description |
|----------|-------------|
| `toggleLike(postId, sessionId)` | Atomic like/unlike with INCR/DECR and SADD/SREM |
| `getLikeCount(postId)` | Get single post count |
| `getLikeCounts(postIds)` | Batch get counts for multiple posts |
| `isLikedBySession(postId, sessionId)` | Check if session liked a post |
| `getLikedStatuses(postIds, sessionId)` | Batch check liked status |
| `syncCounterFromDB(postId)` | Initialize counter from Supabase |
| `initializeCountersFromDB(postIds)` | Batch initialize from Supabase |

**Key Features:**
- Atomic operations using Redis INCR/DECR
- Fallback to Supabase when Redis unavailable
- Lazy initialization (fetches from DB if key doesn't exist)

### Background Sync Service

**`app/utils/redis/sync.ts`**

| Function | Description |
|----------|-------------|
| `syncLikeToSupabase(postId, sessionId, isLiked, count)` | Sync single like operation |
| `reconcileCounter(postId)` | Compare Redis vs Supabase, fix drift |
| `reconcileAllCounters()` | Reconcile all posts (scheduled job) |

**Key Features:**
- Fire-and-forget (doesn't block UI)
- Uses SET (not INCREMENT) to prevent drift
- Logs errors for monitoring

### Posts with Counts Utility

**`app/utils/posts-with-counts.ts`**

```typescript
interface CountsAndLikedResult {
  countsMap: Map<string, number>;
  likedMap: Map<string, boolean>;
}

function fetchCountsFromRedis(
  postIds: string[],
  sessionId: string
): Promise<CountsAndLikedResult>
```

### Updated Hook

**`app/hooks/useLikeHandler.ts`**

- Uses `toggleLike()` from Redis counters
- Calls `syncLikeToSupabase()` on success
- Updates TanStack Query cache with new structure: `{ countsMap, likedMap }`

### Updated View Components

| Component | Changes |
|-----------|---------|
| `HomeFeed.tsx` | Fetches counts from Redis via `fetchCountsFromRedis()` |
| `RankGrid.tsx` | Fetches counts from Redis via `fetchCountsFromRedis()` |
| `ProfileWall.tsx` | Fetches counts from Redis via `fetchCountsFromRedis()` |

## Usage Examples

### Toggle Like (Client-Side)

```typescript
import { toggleLike } from "@/app/utils/redis/counters";
import { syncLikeToSupabase } from "@/app/utils/redis/sync";

const result = await toggleLike(postId, sessionId);

if (result.success) {
  console.log(`New count: ${result.newCount}, isLiked: ${result.isLiked}`);

  // Background sync to Supabase
  syncLikeToSupabase(postId, sessionId, result.isLiked, result.newCount);
}
```

### Fetch Counts for Display

```typescript
import { fetchCountsFromRedis } from "@/app/utils/posts-with-counts";

const postIds = ["uuid-1", "uuid-2", "uuid-3"];
const { countsMap, likedMap } = await fetchCountsFromRedis(postIds, sessionId);

// countsMap.get("uuid-1") => 446
// likedMap.get("uuid-1") => true
```

### Using in TanStack Query

```typescript
const { data: redisData } = useQuery({
  queryKey: queryKeys.posts.ranked(sessionId),
  queryFn: async () => {
    const postIds = posts.map(p => String(p.id));
    return fetchCountsFromRedis(postIds, sessionId);
  },
  staleTime: 30 * 1000,
  refetchOnMount: true,
});

const countsMap = redisData?.countsMap;
const likedMap = redisData?.likedMap;
```

## Migration

### One-Time Migration Script

**`scripts/migrate-counters-to-redis.ts`**

Run this once when setting up Redis counters:

```bash
npx tsx scripts/migrate-counters-to-redis.ts
```

The script:
1. Fetches all posts from `posts_new` table
2. Sets like counts in Redis (`post:likes:{id}`)
3. Fetches all ratings from `post_ratings` table
4. Builds liked sets (`post:liked:{id}`, `session:likes:{id}`)
5. Verifies migration by comparing sample counts

### Environment Variables

```env
UPSTASH_REDIS_REST_URL=<your-upstash-url>
UPSTASH_REDIS_REST_TOKEN=<your-upstash-token>
```

## Fallback Behavior

When Redis is unavailable:

1. **Counter reads:** Fall back to Supabase `posts_new.likes` column
2. **Liked status:** Fall back to Supabase `post_ratings` table
3. **Toggle like:** Use Supabase transactions directly

Console logs indicate fallback:
```
[RedisCounter] Redis not available, falling back to Supabase
[RedisCounter] Using Supabase fallback for toggle
```

## Testing

### Automated Tests

```bash
npm run test        # Watch mode
npm run test:run    # Single run
```

### Manual Verification

1. Start dev server: `npm run dev`
2. Open `/rank` page
3. Note like count on a post (e.g., 446)
4. Click like (should show 447)
5. Navigate to `/profile/{username}`
6. **CRITICAL:** Same post must show 447 (not 446!)

### Redis CLI Verification

See `docs/redis-cli-commands.md` for commands:

```bash
# Check counter value
GET post:likes:50050001-aaaa-bbbb-cccc-ddddeeee0001

# Check liked set size (should match counter)
SCARD post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001

# Check if session liked post
SISMEMBER post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001 session123
```

## Design Decisions

### Why Redis as Source of Truth?

1. **Atomic operations:** INCR/DECR are atomic, preventing race conditions
2. **Speed:** Sub-millisecond reads for high-traffic counters
3. **Consistency:** Single source eliminates cache invalidation issues

### Why Keep Supabase Sync?

1. **Durability:** Redis is ephemeral; Supabase provides persistence
2. **Recovery:** If Redis loses data, we can rebuild from Supabase
3. **Analytics:** Supabase enables complex queries on like data

### Why Fire-and-Forget Sync?

1. **Performance:** Doesn't block the UI
2. **Resilience:** Supabase failures don't affect user experience
3. **Eventual consistency:** Acceptable for durability layer

### Why Three Redis Keys per Post?

1. **Counter key:** O(1) for displaying count
2. **Liked set:** O(1) for checking if user liked
3. **Session set:** Enables efficient batch queries

## Security Considerations

1. **Session validation:** Session IDs are validated before operations
2. **Rate limiting:** Consider adding rate limits on toggleLike
3. **Counter manipulation:** Redis keys are not exposed to clients

## Future Enhancements

1. **Scheduled reconciliation:** Cron job to sync Redis ↔ Supabase
2. **Counter expiration:** Add TTL to session:likes for cleanup
3. **Real-time sync:** Use Supabase Realtime for multi-device sync
4. **Analytics pipeline:** Stream like events to analytics service
