# Liked Status Persistence Fix

## Problem

After liking a post and refreshing the page, the liked status (isLiked) would disappear - the button would show "Dar like" instead of "Quitar like", even though:
- The like count persisted correctly (70 likes stayed at 70)
- Redis had the correct data (SISMEMBER returned 1)
- Supabase post_ratings table had the rating record

## Root Causes

### 1. Server Action Map Serialization Bug

**Issue:** JavaScript `Map` objects don't serialize properly in Next.js Server Action responses. When returned from a server action, Maps become empty objects `{}`.

```typescript
// BEFORE (broken) - Maps become {} when serialized
export async function fetchCountsFromRedisAction(postIds, sessionId) {
  const countsMap = await getLikeCounts(postIds);
  const likedMap = await getLikedStatuses(postIds, sessionId);

  return {
    countsMap,  // Becomes {} on client
    likedMap,   // Becomes {} on client
  };
}
```

**Why this happens:** Server Actions use JSON serialization under the hood. JSON.stringify() on a Map returns `{}` because Maps are not JSON-serializable by default.

### 2. TanStack Query Key Missing Dependency

**Issue:** The query key for fetching liked status didn't include `posts.length`, so when new posts loaded via infinite scroll, the query wasn't invalidated/refetched.

```typescript
// BEFORE (bug) - doesn't refetch when posts.length changes
queryKey: queryKeys.posts.liked(sessionId),
```

## Solution

### Fix 1: Serialize Maps as Arrays

Changed the server action to return arrays instead of Maps, then reconstruct Maps on the client side.

**`app/actions/redis-counters.ts`:**
```typescript
export interface CountsAndLikedResultSerialized {
  countsArray: [string, number][];
  likedArray: [string, boolean][];
}

export async function fetchCountsFromRedisAction(
  postIds: string[],
  sessionId: string
): Promise<CountsAndLikedResultSerialized> {
  const [countsMap, likedMap] = await Promise.all([
    getLikeCounts(postIds),
    getLikedStatuses(postIds, sessionId),
  ]);

  // Convert Maps to arrays for proper JSON serialization
  return {
    countsArray: Array.from(countsMap.entries()),
    likedArray: Array.from(likedMap.entries()),
  };
}
```

**`app/utils/posts-with-counts.ts`:**
```typescript
export async function fetchCountsFromRedis(
  postIds: string[],
  sessionId: string
): Promise<CountsAndLikedResult> {
  // Server action returns arrays because Maps don't serialize properly
  const { countsArray, likedArray } = await fetchCountsFromRedisAction(postIds, sessionId);

  // Reconstruct Maps from arrays
  return {
    countsMap: new Map(countsArray),
    likedMap: new Map(likedArray),
  };
}
```

### Fix 2: Include posts.length in Query Key

Added `posts.length` to the TanStack Query key so it refetches when new posts load via infinite scroll.

**`app/components/HomeFeed.tsx`:**
```typescript
const { data: redisData, isLoading: isLikedStatusLoading } = useQuery({
  // Include posts.length so it refetches when new posts load via infinite scroll
  queryKey: [...queryKeys.posts.liked(sessionId), posts.length],
  queryFn: async () => {
    const postIds = posts.map(p => String(p.id));
    return fetchCountsFromRedis(postIds, sessionId);
  },
  enabled: !!sessionId && posts.length > 0,
});
```

## Data Flow (After Fix)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Browser)                                  │
│                                                                             │
│  HomeFeed.tsx                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ useQuery({                                                           │   │
│  │   queryKey: [...queryKeys.posts.liked(sessionId), posts.length],    │   │
│  │   queryFn: () => fetchCountsFromRedis(postIds, sessionId)           │   │
│  │ })                                                                   │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│  posts-with-counts.ts           │                                           │
│  ┌──────────────────────────────▼──────────────────────────────────────┐   │
│  │ fetchCountsFromRedis()                                               │   │
│  │   → calls server action                                              │   │
│  │   → receives arrays: countsArray, likedArray                         │   │
│  │   → reconstructs: new Map(countsArray), new Map(likedArray)          │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │ Server Action Call
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                           SERVER                                            │
│                                                                             │
│  redis-counters.ts (Server Action)                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ fetchCountsFromRedisAction()                                         │   │
│  │   → getLikeCounts(postIds)        → Map<string, number>              │   │
│  │   → getLikedStatuses(postIds, sessionId) → Map<string, boolean>      │   │
│  │   → Array.from(countsMap.entries()) → [string, number][]             │   │
│  │   → Array.from(likedMap.entries()) → [string, boolean][]             │   │
│  │   → returns { countsArray, likedArray }                              │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│  counters.ts                    │                                           │
│  ┌──────────────────────────────▼──────────────────────────────────────┐   │
│  │ getLikedStatuses()                                                   │   │
│  │   → SISMEMBER post:likes:{postId} {sessionId}                        │   │
│  │   → returns Map<postId, boolean>                                     │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                           REDIS                                             │
│                                                                             │
│  Keys:                                                                      │
│  • post:likes:{postId}           → Integer (like count)                     │
│  • post:likes:{postId}:sessions  → Set of sessionIds who liked              │
│  • session:likes:{sessionId}     → Set of postIds this session liked        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Files Modified

| File | Change |
|------|--------|
| `app/actions/redis-counters.ts` | Return arrays instead of Maps for serialization |
| `app/utils/posts-with-counts.ts` | Reconstruct Maps from arrays |
| `app/components/HomeFeed.tsx` | Add `posts.length` to query key |

## Testing

1. Navigate to the home feed
2. Like a post (button shows "Quitar like")
3. Refresh the page
4. Verify the button still shows "Quitar like" (not "Dar like")
5. Scroll down to trigger infinite scroll
6. Verify new posts also show correct liked status

## Key Learnings

1. **Server Actions serialize responses as JSON** - Maps, Sets, and other non-JSON-serializable types won't work correctly. Always convert to arrays or plain objects.

2. **TanStack Query keys must include all dependencies** - If your query depends on data that changes (like `posts.length` for infinite scroll), include it in the key.

3. **Debug with network tab** - Check what data is actually being returned from server actions, not just what the server logs show.

## Related Documentation

- [Redis Counter Architecture](./redis-counter-architecture.md)
- [Redis Counters Feature](./REDIS_COUNTERS_FEATURE.md)
- [Like Counter Flash Bug](./LIKE_COUNTER_FLASH_BUG.md)
