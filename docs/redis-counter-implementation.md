"# Redis Counter Implementation - Ralph Prompt

## Usage

bash
/ralph-loop "$(cat docs/prompts/redis-counter-implementation.md)" --max-iterations 30 --completion-promise "REDIS_COUNTERS_COMPLETE"


---"

# Task: Implement Redis-Based Counter System

You are implementing a Redis-based counter system for like counts in a Next.js + Supabase application. Redis becomes the source of truth for counters, with Supabase as the durable backup.

---

## Problem We're Solving

**Current Issue:** When a user likes a post on the rank page, the like count updates correctly on that page (446 → 447), but when navigating to the profile page or home page, the count still shows the old value (446).

**Root Cause:** Fire-and-forget cache invalidation pattern creates race conditions:

text
Like → Supabase RPC → revalidatePostsCache().catch() → RETURNS IMMEDIATELY
                                    ↓ (async, ~200ms)
                              Cache invalidation completes
                                    ↓
                        User already navigated (sees stale data)


**Why This Happens:**

1. Three-layer caching (Redis → unstable_cache → Supabase) with async invalidation
2. Cache invalidation is not awaited
3. User navigation can occur before invalidation completes
4. Each view has its own cached copy of post data with like counts

---

## Solution Architecture

### Core Principle

**Separate volatile data (counters) from stable data (post content)**

| Data Type | Storage | Caching Strategy |
| --------- | ------- | ---------------- |
| Post content (image, caption, author) | Supabase | Aggressive caching (5-60 min) |
| Like counts | Redis | Source of truth, no caching needed |
| Liked status per session | Redis | Source of truth, no caching needed |

### Architecture Diagram

text
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
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐    │
│  │   API Routes    │     │ Server Actions  │     │ Server Components│   │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘    │
│           │                       │                        │             │
│           ▼                       ▼                        ▼             │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Redis Counter Service                        │   │
│  │  - toggleLike(postId, sessionId)                                 │   │
│  │  - getLikeCount(postId)                                          │   │
│  │  - getLikeCounts(postIds[])                                      │   │
│  │  - getLikedStatuses(postIds[], sessionId)                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│           │                                                              │
└───────────┼──────────────────────────────────────────────────────────────┘
            │
            ├───────────────────┬───────────────────┐
            ▼                   ▼                   ▼
┌─────────────────────┐  ┌─────────────────────┐
│   Redis (Upstash)   │  │  Supabase (Postgres) │
│   SOURCE OF TRUTH   │  │   DURABLE STORE      │
│   FOR COUNTERS      │  │   FOR EVERYTHING     │
├─────────────────────┤  ├─────────────────────┤
│ post:likes:{id}     │  │ posts_new.likes     │
│ post:liked:{id}     │  │ post_ratings        │
│ session:likes:{sid} │  │                     │
└─────────────────────┘  └─────────────────────┘
        │                         ▲
        └────── async sync ───────┘


---

## Data Flow

### Like Flow (Target: < 20ms response)

text
1. User clicks like
2. Redis INCR post:likes:{postId}     (1-5ms, atomic)
3. Redis SADD post:liked:{postId}     (1-5ms, atomic)
4. Return new count to client         (instant)
5. Background: Supabase UPDATE        (async, 50-200ms)
6. Supabase Realtime broadcasts       (async, 200-500ms)


### Load Posts Flow (Any View)

text
1. Fetch posts from Supabase/cache (content only, no likes)
2. Redis MGET all like counts        (batch, 5-10ms)
3. Redis SMEMBERS liked status       (batch, 5-10ms)
4. Merge and return to client


---

## Redis Key Schema

text
# Like count per post (String with atomic INCR/DECR)
post:likes:{postId} = "447"

# Set of session IDs that liked a post
post:liked:{postId} = Set<sessionId>

# Set of post IDs liked by a session (for batch queries)
session:likes:{sessionId} = Set<postId>


### Example Redis Commands

redis
# Get like count
GET post:likes:50050001-aaaa-bbbb-cccc-ddddeeee0001
> "447"

# Check if session liked
SISMEMBER post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001 session-abc123
> 1

# Get all posts liked by session
SMEMBERS session:likes:session-abc123
> ["post-id-1", "post-id-2", ...]

# Atomic like (in toggleLike function)
INCR post:likes:{postId}
SADD post:liked:{postId} {sessionId}
SADD session:likes:{sessionId} {postId}

# Atomic unlike
DECR post:likes:{postId}
SREM post:liked:{postId} {sessionId}
SREM session:likes:{sessionId} {postId}


---

## Files to Read First

Before implementing, read these existing files to understand the current code:

1. `app/utils/redis/client.ts` - Redis client configuration
2. `app/utils/redis/cache.ts` - Existing cache utilities (use similar patterns)
3. `app/utils/ratings.ts` - Current like handling (to be replaced)
4. `app/hooks/useLikeHandler.ts` - Current hook (to be updated)
5. `app/utils/cached-posts.ts` - Current post caching
6. `app/utils/cached-profiles.ts` - Current profile caching
7. `CLAUDE.md` - Project conventions

---

## Implementation Phases

### Phase 1: Redis Counter Service

**Create file:** `app/utils/redis/counters.ts`

typescript
/**
 * Redis Counter Service
 *
 * Source of truth for like counts. All views read from here.
 * Supabase is updated async for durability.
 */

import { redis, isRedisConfigured } from "./client";
import { supabase } from "../client";

export interface LikeResult {
  success: boolean;
  newCount: number;
  isLiked: boolean;
  error?: string;
}

// Key generators
export const counterKeys = {
  postLikes: (postId: string) => `post:likes:${postId}`,
  postLiked: (postId: string) => `post:liked:${postId}`,
  sessionLikes: (sessionId: string) => `session:likes:${sessionId}`,
};

/**
 * Toggle like for a post (atomic operation)
 * Returns new count and liked status
 */
export async function toggleLike(postId: string, sessionId: string): Promise<LikeResult>

/**
 * Get like count for a single post
 * Falls back to Supabase if Redis unavailable
 */
export async function getLikeCount(postId: string): Promise<number>

/**
 * Get like counts for multiple posts (batch)
 * Uses MGET for efficiency
 */
export async function getLikeCounts(postIds: string[]): Promise<Map<string, number>>

/**
 * Check if session liked a post
 */
export async function isLikedBySession(postId: string, sessionId: string): Promise<boolean>

/**
 * Get liked status for multiple posts (batch)
 */
export async function getLikedStatuses(postIds: string[], sessionId: string): Promise<Map<string, boolean>>

/**
 * Sync a single counter from Supabase to Redis (for recovery)
 */
export async function syncCounterFromDB(postId: string): Promise<number>

/**
 * Initialize all counters from Supabase (cold start)
 */
export async function initializeCountersFromDB(): Promise<void>


**Implementation requirements:**

- Use atomic Redis operations (INCR/DECR, SADD/SREM)
- Include fallback to Supabase when Redis unavailable
- Log operations with `[RedisCounter]` prefix
- Handle errors gracefully, never throw

**Verification checklist:**

- [ ] All 7 functions exported and working
- [ ] `toggleLike` uses atomic INCR/DECR
- [ ] `getLikeCounts` uses MGET for batch efficiency
- [ ] Fallback to Supabase works when Redis is down
- [ ] Console logs show `[RedisCounter]` prefix

---

### Phase 2: Background Sync Service

**Create file:** `app/utils/redis/sync.ts`

This service syncs Redis state to Supabase for durability. It's called AFTER Redis succeeds, in a fire-and-forget pattern.

**Why we need this:**

- Supabase is the durable store (survives Redis restarts)
- Supabase Realtime broadcasts changes to OTHER clients
- The `post_ratings` table tracks who liked what (for analytics, moderation)

**IMPORTANT - How Supabase sync works:**

typescript
/**
 * Background Sync Service
 *
 * Syncs Redis state to Supabase for durability.
 * Called AFTER Redis update succeeds - never blocks the like operation.
 *
 * Updates TWO things in Supabase:
 * 1. post_ratings table - INSERT or DELETE the rating record
 * 2. posts_new.likes column - SET the count (not increment!)
 *
 * Using SET instead of INCREMENT ensures Supabase always matches Redis.
 * This prevents drift between the two systems.
 */

import { supabase } from "../client";

/**
 * Sync a like/unlike to Supabase (fire-and-forget)
 *
 * This function:
 * 1. Inserts or deletes the rating record in post_ratings
 * 2. Updates posts_new.likes with the count from Redis
 * 3. Triggers Supabase Realtime (other clients get notified)
 *
 * CRITICAL: This is fire-and-forget. Never await this in useLikeHandler.
 * Call it like: syncLikeToSupabase(...).catch(console.error)
 */
export async function syncLikeToSupabase(
  postId: string,
  sessionId: string,
  isLike: boolean,
  newCount: number
): Promise<void> {
  console.log(`[RedisSync] Starting sync: post=${postId}, isLike=${isLike}, count=${newCount}`);

  try {
    // Step 1: Update post_ratings table (the rating record)
    if (isLike) {
      // INSERT rating - use upsert to handle race conditions
      const { error: ratingError } = await supabase
        .from("post_ratings")
        .upsert(
          {
            post_id: postId,
            session_id: sessionId,
            created_at: new Date().toISOString(),
          },
          { onConflict: "post_id,session_id" }
        );

      if (ratingError) {
        console.error("[RedisSync] Failed to insert rating:", ratingError);
      }
    } else {
      // DELETE rating
      const { error: ratingError } = await supabase
        .from("post_ratings")
        .delete()
        .eq("post_id", postId)
        .eq("session_id", sessionId);

      if (ratingError) {
        console.error("[RedisSync] Failed to delete rating:", ratingError);
      }
    }

    // Step 2: Update posts_new.likes (SET the count, don't increment)
    // Using SET ensures Supabase matches Redis exactly
    const { error: countError } = await supabase
      .from("posts_new")
      .update({ likes: newCount })
      .eq("id", postId);

    if (countError) {
      console.error("[RedisSync] Failed to update count:", countError);
    }

    console.log(`[RedisSync] Sync complete: post=${postId}, count=${newCount}`);

    // Note: Supabase Realtime will automatically broadcast this UPDATE
    // to all subscribed clients via the existing subscription in usePostLikesSubscription

  } catch (error) {
    // Log but never throw - this is fire-and-forget
    console.error("[RedisSync] Unexpected error during sync:", error);
  }
}

/**
 * Reconcile a single counter between Redis and Supabase
 *
 * Use this for:
 * - Periodic reconciliation jobs
 * - Recovery after Redis restart
 * - Debugging count mismatches
 */
export async function reconcileCounter(postId: string): Promise<void> {
  console.log(`[RedisSync] Reconciling counter for post ${postId}`);

  try {
    // Get count from Supabase (source of truth for reconciliation)
    const { data, error } = await supabase
      .from("posts_new")
      .select("likes")
      .eq("id", postId)
      .single();

    if (error) {
      console.error("[RedisSync] Failed to get count from Supabase:", error);
      return;
    }

    // Import Redis functions (avoid circular dependency)
    const { redis, isRedisConfigured } = await import("./client");

    if (!isRedisConfigured || !redis) {
      console.warn("[RedisSync] Redis not configured, skipping reconciliation");
      return;
    }

    // Set Redis to match Supabase
    const key = `post:likes:${postId}`;
    await redis.set(key, data.likes);

    console.log(`[RedisSync] Reconciled post ${postId}: count=${data.likes}`);
  } catch (error) {
    console.error("[RedisSync] Reconciliation failed:", error);
  }
}


**Key design decisions:**

| Decision | Reason |
| -------- | ------ |
| Use SET not INCREMENT | Prevents drift between Redis and Supabase |
| Use upsert for likes | Handles race conditions if user clicks fast |
| Log all operations | Debugging and monitoring |
| Never throw errors | Fire-and-forget must not crash |
| Separate rating + count updates | They're different tables with different purposes |

**Implementation requirements:**

- Never block the main like operation
- Log with `[RedisSync]` prefix
- Handle errors (log but don't fail)
- Update both `posts_new.likes` AND `post_ratings` table
- Use SET for count (not increment) to prevent drift
- Use upsert for ratings to handle race conditions

**Verification checklist:**

- [ ] Sync is truly async (doesn't block toggleLike)
- [ ] `post_ratings` table updated (INSERT or DELETE)
- [ ] `posts_new.likes` updated with SET (not increment)
- [ ] Supabase Realtime broadcasts after sync
- [ ] Errors are logged but don't crash
- [ ] Console shows `[RedisSync]` logs

---

### Phase 3: Update useLikeHandler Hook

**Modify file:** `app/hooks/useLikeHandler.ts`

**Changes:**

1. Import `toggleLike` from `../utils/redis/counters`
2. Import `syncLikeToSupabase` from `../utils/redis/sync`
3. Replace call to `togglePostLike()` with Redis `toggleLike()`
4. Remove ALL cache invalidation code (no more `revalidatePostsCache`)
5. Call `syncLikeToSupabase()` in background after Redis update

**Key change in handleLike:**

typescript
// OLD (remove this):
const result = await togglePostLike(postIdStr, sessionId);
// ... cache invalidation ...

// NEW:
const result = await toggleLike(postIdStr, sessionId);
if (result.success) {
  // Background sync to Supabase (fire-and-forget)
  syncLikeToSupabase(postIdStr, sessionId, result.isLiked, result.newCount)
    .catch(err => console.error('[useLikeHandler] Sync error:', err));
}


**Verification checklist:**

- [ ] No imports from `ratings.ts` for toggling
- [ ] No `revalidatePostsCache` calls
- [ ] Like operation completes in < 20ms
- [ ] Supabase synced in background

---

### Phase 4: Update Data Fetching

**Create file:** `app/utils/posts-with-counts.ts`

typescript
/**
 * Utility to merge posts with Redis counts
 */

import { getLikeCounts, getLikedStatuses } from "./redis/counters";
import type { Post } from "../mocks/posts";

/**
 * Merge posts with like counts and liked status from Redis
 */
export async function mergePostsWithCounts(
  posts: Array<Omit<Post, 'likes' | 'isLiked'>>,
  sessionId: string
): Promise<Post[]>


**Modify files:**

1. `app/utils/cached-posts.ts`:
   - Export posts WITHOUT likes field
   - Create new function `getPostsWithRedisLikes()` that calls `mergePostsWithCounts()`

2. `app/utils/cached-profiles.ts`:
   - Same pattern for profile posts

3. `app/components/HomeFeed.tsx`:
   - Use new data fetching with Redis counts

4. `app/components/RankGrid.tsx`:
   - Use new data fetching with Redis counts

5. `app/profile/[username]/ProfileWall.tsx`:
   - Use new data fetching with Redis counts

**Verification checklist:**

- [ ] All views get counts from Redis
- [ ] Post content still cached normally
- [ ] Counts are consistent across all views
- [ ] No more stale count issues

---

### Phase 5: Migration Script

**Create file:** `scripts/migrate-counters-to-redis.ts`

typescript
/**
 * One-time migration script to populate Redis with existing data
 *
 * Run with: npx tsx scripts/migrate-counters-to-redis.ts
 */

async function migrateCountersToRedis() {
  console.log('[Migration] Starting counter migration to Redis...');

  // 1. Get all posts with likes from Supabase
  // 2. Set each counter in Redis
  // 3. Get all ratings and build liked sets
  // 4. Verify counts match

  console.log('[Migration] Complete!');
}

migrateCountersToRedis();


**Verification checklist:**

- [ ] Script runs without errors
- [ ] All post counts migrated
- [ ] All liked sets populated
- [ ] Counts in Redis match Supabase

---

## Update Redis Index

**Modify file:** `app/utils/redis/index.ts`

Add exports for new modules:

typescript
// Existing exports
export * from "./client";
export * from "./cache";

// NEW exports
export * from "./counters";
export * from "./sync";


---

## Testing Commands

Run after each phase:

bash
# TypeScript check
npx tsc --noEmit

# Build check
npm run build

# Unit tests
npm run test


---

## Final Verification

**Manual test (REQUIRED before completion):**

1. Start dev server: `npm run dev`
2. Open <http://localhost:3000/rank>
3. Find the polar bear post ("Oso polar en su habitat natural")
4. Note the current like count (e.g., 446)
5. Click like - should show 447 instantly
6. Navigate to <http://localhost:3000/profile/lucia_nature>
7. **CRITICAL:** Same post must show 447 (not 446!)
8. Navigate to <http://localhost:3000>
9. Find the same post - must show 447

**If counts are inconsistent, do NOT output completion promise. Debug and fix.**

---

## Error Handling

### If Redis is unavailable

All counter functions must fallback to Supabase:

typescript
async function getLikeCount(postId: string): Promise<number> {
  if (!isRedisConfigured || !redis) {
    // Fallback to Supabase
    const { data } = await supabase
      .from('posts_new')
      .select('likes')
      .eq('id', postId)
      .single();
    return data?.likes ?? 0;
  }
  // ... Redis logic
}


### If sync fails

Log error but don't fail the like operation:

typescript
syncLikeToSupabase(postId, sessionId, isLiked, newCount)
  .catch(err => console.error('[Sync] Failed:', err));
// Don't await, don't throw


---

## Self-Correction Rules

1. **If TypeScript errors:** Read error message, fix types/imports
2. **If tests fail:** Read test output, fix the failing test
3. **If build fails:** Check for missing exports or circular deps
4. **If counts still inconsistent:** Ensure ALL views use `getLikeCounts()` from Redis
5. **If Redis operations fail:** Check `isRedisConfigured` and fallback logic

---

## Escape Hatch

After 25 iterations, if not complete:

1. Create `docs/redis-implementation-status.md` with:
   - What was successfully implemented
   - What's failing and why
   - Specific error messages
   - Suggested next steps

---

## Completion Criteria

ALL of these must be true:

- [ ] `app/utils/redis/counters.ts` exists with all 7 functions
- [ ] `app/utils/redis/sync.ts` exists with sync functions
- [ ] `app/utils/redis/index.ts` exports new modules
- [ ] `app/hooks/useLikeHandler.ts` uses Redis, no cache invalidation
- [ ] `app/utils/posts-with-counts.ts` exists
- [ ] `scripts/migrate-counters-to-redis.ts` exists
- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] Manual verification: Like count consistent across rank, profile, home

---

## Completion Signal

When ALL criteria are verified and working:

Output <promise>REDIS_COUNTERS_COMPLETE</promise>  when done."
