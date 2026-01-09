# Ralph Prompt: Redis-Based Counter System for Like Counts

## Problem Statement

**Current Bug:** Like counts are inconsistent across views.

When a user likes a post on `/rank` (446 → 447), then navigates to `/profile/username` or `/`, the count still shows 446.

**Root Cause:** Fire-and-forget cache invalidation creates race conditions:

```
Like → Supabase RPC → revalidatePostsCache().catch() → RETURNS IMMEDIATELY
                                ↓ (async, ~200ms)
                          Cache invalidation completes
                                ↓
                    User already navigated (sees stale 446)
```

**Solution:** Make Redis the source of truth for counters. All views read from Redis = always consistent.

---

## Architecture

### Separation of Concerns

| Data Type | Storage | Why |
|-----------|---------|-----|
| Post content (image, caption, author) | Supabase + cache | Stable, rarely changes |
| Like counts | **Redis** | Volatile, changes frequently |
| Liked status per session | **Redis** | Volatile, needs instant reads |

### Data Flow After Implementation

```
LIKE OPERATION (< 20ms total):
┌────────────────────────────────────────────────────────────┐
│ 1. User clicks like                                        │
│ 2. Redis INCR post:likes:{id}              (1-5ms, atomic) │
│ 3. Redis SADD post:liked:{id} {session}    (1-5ms, atomic) │
│ 4. Return new count to client              (instant)       │
│ 5. Background: Supabase sync               (fire-forget)   │
└────────────────────────────────────────────────────────────┘

LOAD POSTS (any view):
┌────────────────────────────────────────────────────────────┐
│ 1. Fetch posts from cache (content only, no likes)         │
│ 2. Redis MGET all like counts              (batch, 5-10ms) │
│ 3. Redis batch check liked status          (batch, 5-10ms) │
│ 4. Merge and return                                        │
└────────────────────────────────────────────────────────────┘
```

### Redis Key Schema

```redis
# Like count per post (atomic INCR/DECR)
post:likes:{postId} = "447"

# Set of sessions that liked a post
post:liked:{postId} = Set<sessionId>

# Set of posts liked by a session (for batch queries)
session:likes:{sessionId} = Set<postId>
```

---

## Files to Read First

Before implementing, understand the current code:

```
MUST READ:
├── app/utils/redis/client.ts      # Redis client (exists)
├── app/utils/redis/cache.ts       # Cache patterns (exists)
├── app/utils/ratings.ts           # Current like logic (to replace)
├── app/hooks/useLikeHandler.ts    # Current hook (to update)
├── app/utils/cached-posts.ts      # Post caching
├── app/components/HomeFeed.tsx    # Uses posts
├── app/components/RankGrid.tsx    # Uses posts
└── CLAUDE.md                      # Project conventions
```

---

## Implementation Phases

### Phase 1: Redis Counter Service

**Create:** `app/utils/redis/counters.ts`

```typescript
/**
 * Redis Counter Service - Source of truth for like counts
 */

import { redis, isRedisConfigured } from "./client";

// Key generators
export const counterKeys = {
  postLikes: (postId: string) => `post:likes:${postId}`,
  postLiked: (postId: string) => `post:liked:${postId}`,
  sessionLikes: (sessionId: string) => `session:likes:${sessionId}`,
};

export interface LikeResult {
  success: boolean;
  newCount: number;
  isLiked: boolean;
  error?: string;
}

/**
 * Toggle like (atomic). Returns new count instantly.
 */
export async function toggleLike(postId: string, sessionId: string): Promise<LikeResult>

/**
 * Get like count for single post. Falls back to Supabase if Redis down.
 */
export async function getLikeCount(postId: string): Promise<number>

/**
 * Batch get like counts. Uses MGET for efficiency.
 */
export async function getLikeCounts(postIds: string[]): Promise<Map<string, number>>

/**
 * Check if session liked a post.
 */
export async function isLikedBySession(postId: string, sessionId: string): Promise<boolean>

/**
 * Batch get liked status for multiple posts.
 */
export async function getLikedStatuses(postIds: string[], sessionId: string): Promise<Map<string, boolean>>

/**
 * Sync single counter from Supabase (for recovery).
 */
export async function syncCounterFromDB(postId: string): Promise<number>

/**
 * Initialize all counters from Supabase (cold start).
 */
export async function initializeCountersFromDB(): Promise<void>
```

**Requirements:**
- Use atomic Redis ops: `INCR`, `DECR`, `SADD`, `SREM`, `SISMEMBER`
- Fallback to Supabase when `!isRedisConfigured`
- Log with `[RedisCounter]` prefix
- Never throw - return error in result object

**Verify:**
- [ ] All 7 functions exported
- [ ] `toggleLike` uses atomic INCR/DECR
- [ ] `getLikeCounts` uses MGET (batch)
- [ ] Supabase fallback works

---

### Phase 2: Background Sync Service

**Create:** `app/utils/redis/sync.ts`

```typescript
/**
 * Background Sync - Updates Supabase after Redis succeeds
 *
 * IMPORTANT: This is fire-and-forget. Never await in useLikeHandler.
 */

import { supabase } from "../client";

/**
 * Sync like/unlike to Supabase (fire-and-forget)
 *
 * Updates:
 * 1. post_ratings table (INSERT or DELETE)
 * 2. posts_new.likes column (SET to newCount, not increment)
 *
 * Using SET ensures Supabase always matches Redis exactly.
 */
export async function syncLikeToSupabase(
  postId: string,
  sessionId: string,
  isLike: boolean,
  newCount: number
): Promise<void> {
  console.log(`[RedisSync] post=${postId}, isLike=${isLike}, count=${newCount}`);

  try {
    // 1. Update post_ratings table
    if (isLike) {
      await supabase
        .from("post_ratings")
        .upsert(
          { post_id: postId, session_id: sessionId, created_at: new Date().toISOString() },
          { onConflict: "post_id,session_id" }
        );
    } else {
      await supabase
        .from("post_ratings")
        .delete()
        .eq("post_id", postId)
        .eq("session_id", sessionId);
    }

    // 2. SET posts_new.likes (not increment - prevents drift)
    await supabase
      .from("posts_new")
      .update({ likes: newCount })
      .eq("id", postId);

    console.log(`[RedisSync] Complete: post=${postId}`);
  } catch (error) {
    // Log but never throw - fire-and-forget
    console.error("[RedisSync] Error:", error);
  }
}

/**
 * Reconcile counter between Redis and Supabase (for recovery)
 */
export async function reconcileCounter(postId: string): Promise<void>
```

**Requirements:**
- Never block main like operation
- Use SET for count (not increment) to prevent drift
- Use upsert for ratings (handles race conditions)
- Log with `[RedisSync]` prefix
- Errors logged but never thrown

**Verify:**
- [ ] Sync is truly async (doesn't block toggleLike)
- [ ] `post_ratings` updated correctly
- [ ] `posts_new.likes` uses SET not increment
- [ ] Errors logged, not thrown

---

### Phase 3: Update useLikeHandler Hook

**Modify:** `app/hooks/useLikeHandler.ts`

**Changes:**
1. Import from `../utils/redis/counters` instead of `ratings.ts`
2. Import `syncLikeToSupabase` from `../utils/redis/sync`
3. Remove ALL `revalidatePostsCache` calls
4. Call sync in background after Redis update

```typescript
// OLD (remove):
import { togglePostLike } from "../utils/ratings";
const result = await togglePostLike(postIdStr, sessionId);
revalidatePostsCache().catch(...);

// NEW:
import { toggleLike } from "../utils/redis/counters";
import { syncLikeToSupabase } from "../utils/redis/sync";

const result = await toggleLike(postIdStr, sessionId);
if (result.success) {
  // Fire-and-forget sync to Supabase
  syncLikeToSupabase(postIdStr, sessionId, result.isLiked, result.newCount)
    .catch(err => console.error('[useLikeHandler] Sync error:', err));
}
```

**Verify:**
- [ ] No imports from `ratings.ts` for toggling
- [ ] No `revalidatePostsCache` calls
- [ ] Like completes in < 20ms
- [ ] Sync happens in background

---

### Phase 4: Update Data Fetching

**Create:** `app/utils/posts-with-counts.ts`

```typescript
/**
 * Merge posts with Redis counts
 */
import { getLikeCounts, getLikedStatuses } from "./redis/counters";
import type { Post } from "../types/post";

export async function mergePostsWithCounts(
  posts: Post[],
  sessionId: string
): Promise<Post[]> {
  const postIds = posts.map(p => String(p.id));

  // Batch fetch from Redis
  const [counts, likedMap] = await Promise.all([
    getLikeCounts(postIds),
    getLikedStatuses(postIds, sessionId),
  ]);

  return posts.map(post => ({
    ...post,
    likes: counts.get(String(post.id)) ?? post.likes,
    isLiked: likedMap.get(String(post.id)) ?? false,
  }));
}
```

**Modify these files to use `mergePostsWithCounts`:**
- `app/components/HomeFeed.tsx`
- `app/components/RankGrid.tsx`
- `app/profile/[username]/ProfileClientPage.tsx` (or ProfileWall)

**Verify:**
- [ ] All views get counts from Redis
- [ ] Post content still cached normally
- [ ] Counts consistent across all views

---

### Phase 5: Migration Script

**Create:** `scripts/migrate-counters-to-redis.ts`

```typescript
/**
 * One-time migration: Populate Redis with existing Supabase data
 *
 * Run: npx tsx scripts/migrate-counters-to-redis.ts
 */
import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";

async function migrate() {
  console.log("[Migration] Starting...");

  // 1. Get all posts with likes from Supabase
  // 2. Set each counter in Redis
  // 3. Get all ratings and build liked sets
  // 4. Verify counts match

  console.log("[Migration] Complete!");
}

migrate().catch(console.error);
```

**Verify:**
- [ ] Script runs without errors
- [ ] All post counts migrated
- [ ] All liked sets populated

---

### Phase 6: Update Exports

**Modify:** `app/utils/redis/index.ts`

```typescript
export * from "./client";
export * from "./cache";
export * from "./counters";  // NEW
export * from "./sync";      // NEW
```

---

## Verification Commands

Run after each phase:

```bash
npx tsc --noEmit     # TypeScript check
npm run build        # Build check
npm run test         # Unit tests
```

---

## Final Manual Test (REQUIRED)

This test MUST pass before completion:

```
1. npm run dev
2. Open http://localhost:3000/rank
3. Find "Oso polar en su habitat natural" post
4. Note current count (e.g., 446)
5. Click like → Should show 447 instantly
6. Navigate to http://localhost:3000/profile/lucia_nature
7. SAME POST MUST SHOW 447 (not 446!)
8. Navigate to http://localhost:3000
9. Same post must show 447

If counts are inconsistent → DO NOT complete. Debug and fix.
```

---

## Error Handling

### Redis Unavailable → Fallback to Supabase

```typescript
async function getLikeCount(postId: string): Promise<number> {
  if (!isRedisConfigured || !redis) {
    const { data } = await supabase
      .from('posts_new')
      .select('likes')
      .eq('id', postId)
      .single();
    return data?.likes ?? 0;
  }
  // Redis logic...
}
```

### Sync Fails → Log but Don't Block

```typescript
syncLikeToSupabase(postId, sessionId, isLiked, newCount)
  .catch(err => console.error('[Sync] Failed:', err));
// Never await, never throw
```

---

## Self-Correction Rules

| Problem | Solution |
|---------|----------|
| TypeScript errors | Read error, fix types/imports |
| Tests fail | Read output, fix failing test |
| Build fails | Check missing exports, circular deps |
| Counts still inconsistent | Ensure ALL views use `getLikeCounts()` |
| Redis operations fail | Check `isRedisConfigured`, test fallback |

---

## Escape Hatch

After 25 iterations without completion:

1. Create `docs/redis-counters-status.md` documenting:
   - What was implemented
   - What's failing and why
   - Specific error messages
   - Suggested next steps

---

## Completion Criteria

ALL must be true:

- [ ] `app/utils/redis/counters.ts` - 7 functions working
- [ ] `app/utils/redis/sync.ts` - sync functions working
- [ ] `app/utils/redis/index.ts` - exports new modules
- [ ] `app/hooks/useLikeHandler.ts` - uses Redis, no cache invalidation
- [ ] `app/utils/posts-with-counts.ts` - merge utility exists
- [ ] `scripts/migrate-counters-to-redis.ts` - migration script exists
- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] **Manual test passes** - counts consistent across rank, profile, home

---

## Ralph Loop Command

```bash
/ralph-loop "Implement Redis-based counter system for like counts in Suplatzigram.

PROBLEM: Like counts inconsistent across views (rank shows 447, profile shows 446).
SOLUTION: Redis becomes source of truth for counters. All views read from Redis.

READ FIRST:
- REDIS_COUNTERS_RALPH_PROMPT.md (this file)
- CLAUDE.md (project context)
- app/utils/redis/client.ts (existing Redis client)
- app/utils/ratings.ts (current like logic to replace)
- app/hooks/useLikeHandler.ts (hook to update)

PHASES:
1. Create app/utils/redis/counters.ts (7 functions: toggleLike, getLikeCount, getLikeCounts, isLikedBySession, getLikedStatuses, syncCounterFromDB, initializeCountersFromDB)
2. Create app/utils/redis/sync.ts (syncLikeToSupabase, reconcileCounter)
3. Update app/hooks/useLikeHandler.ts (use Redis, remove cache invalidation)
4. Create app/utils/posts-with-counts.ts (mergePostsWithCounts)
5. Update HomeFeed, RankGrid, ProfileWall to use mergePostsWithCounts
6. Create scripts/migrate-counters-to-redis.ts
7. Update app/utils/redis/index.ts exports

VERIFICATION after each phase:
- npx tsc --noEmit
- npm run build
- npm run test

FINAL TEST (must pass):
1. Like post on /rank (446 → 447)
2. Navigate to /profile/username
3. SAME POST MUST SHOW 447
4. Navigate to / (home)
5. SAME POST MUST SHOW 447

If counts inconsistent, DO NOT complete - debug and fix.

RULES:
- Redis = source of truth for counts
- Supabase sync is fire-and-forget (never await)
- All views must use getLikeCounts() from Redis
- Fallback to Supabase when Redis unavailable
- Log with [RedisCounter] and [RedisSync] prefixes

Output <promise>REDIS_COUNTERS_COMPLETE</promise> when ALL criteria verified." --completion-promise "REDIS_COUNTERS_COMPLETE" --max-iterations 40
```