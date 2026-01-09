# Like Counter Architecture Fix

## Executive Summary

The like counter flash bug is a **frontend issue caused by dual state management conflict**, combined with a non-atomic backend operation that triggers multiple real-time events during a single like/unlike action.

**Status**: Analysis Complete
**Date**: 2026-01-08
**Related Issue**: [LIKE_COUNTER_FLASH_BUG.md](./LIKE_COUNTER_FLASH_BUG.md)

---

## Current Architecture Analysis

### Database Schema (Supabase)

| Table | RLS | Realtime |
|-------|-----|----------|
| `posts_new` | Yes | Yes (UPDATE events) |
| `post_ratings` | Yes | Yes (INSERT/DELETE events) |

**Key Finding**: Both tables have Realtime enabled, but there are NO database triggers to automatically sync `likes` count.

### Current Like/Unlike Flow

```
User clicks Like
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND (HomeFeed.tsx)                                      │
│  1. Optimistic update: posts.isLiked = !isLiked               │◄─┐
│     posts.likes += isLiked ? -1 : +1                          │  │
│                                                               │  │
│  2. Call togglePostLike()                                     │  │
└──────────────────────────────────────────────────────────────┘  │
       │                                                          │
       ▼                                                          │
┌──────────────────────────────────────────────────────────────┐  │
│  BACKEND (ratings.ts)                                         │  │
│  3. Check if rating exists (.single() → 406 if 0 rows)        │  │
│  4. INSERT/DELETE post_ratings                                │──┼─┐
│  5. GET posts_new.likes (current count)                       │  │ │
│  6. PATCH posts_new.likes = newCount                          │──┼─┼─┐
│  7. Call revalidatePostsCache()                               │  │ │ │
└──────────────────────────────────────────────────────────────┘  │ │ │
       │                                                          │ │ │
       ▼                                                          │ │ │
┌──────────────────────────────────────────────────────────────┐  │ │ │
│  SUPABASE REALTIME                                            │  │ │ │
│  • INSERT/DELETE on post_ratings triggers event               │──┘ │ │
│  • UPDATE on posts_new triggers event                         │────┼─┘
│                                                               │    │
│  ⚠️ MULTIPLE EVENTS FIRE DURING ONE OPERATION                 │    │
└──────────────────────────────────────────────────────────────┘    │
       │                                                            │
       ▼                                                            │
┌──────────────────────────────────────────────────────────────┐    │
│  FRONTEND (subscribeToPostLikes)                              │    │
│  8. Receives UPDATE event with OLD likes count                │◄───┘
│  9. setPosts(post.likes = OLD_VALUE)  ← CAUSES FLASH!         │
│ 10. Receives UPDATE event with NEW likes count                │
│ 11. setPosts(post.likes = NEW_VALUE)  ← Correct!              │
└──────────────────────────────────────────────────────────────┘
```

---

## Root Causes Identified

### 1. Dual State Management Conflict

**Location**: `app/components/HomeFeed.tsx`

```typescript
// SOURCE 1: Local state (line 50)
const [posts, setPosts] = useState<Post[]>(initialPosts);

// SOURCE 2: TanStack Query cache (line 61-82)
const { data: likedMap } = useQuery({...});

// MERGE: useMemo combines them (line 87-95)
const postsWithLikedStatus = useMemo(() => {...}, [posts, likedMap]);
```

**Problem**: When optimistic update modifies local `posts`, and real-time subscription also modifies local `posts`, they create a race condition with stale data.

### 2. Non-Atomic Like Operation

**Location**: `app/utils/ratings.ts`

The like operation is NOT atomic - it's 4 separate database calls:

```typescript
// Step 1: Check existing rating
const { data: existingRating } = await supabase.from("post_ratings").select("id").single();

// Step 2: DELETE or INSERT rating
await supabase.from("post_ratings").delete() // or .insert()

// Step 3: GET current count (may be stale!)
const { data: currentPost } = await supabase.from("posts_new").select("likes").single();

// Step 4: PATCH with new count
await supabase.from("posts_new").update({ likes: newLikes });
```

Between Step 3 and Step 4, **Supabase Realtime fires an event** with the OLD likes count because the `post_ratings` change already happened.

### 3. Missing `.maybeSingle()` Usage

**Location**: `app/utils/ratings.ts:49`

```typescript
// Current (causes 406 when no rows)
.single();

// Should be
.maybeSingle();
```

---

## Proposed Solutions

### Option A: Frontend-Only Fix (Quick Win)

**Complexity**: Low | **Risk**: Low | **Impact**: Immediate

Fix the optimistic update and real-time subscription conflict:

```typescript
// In HomeFeed.tsx, modify real-time subscription to SKIP
// updates that are being processed optimistically

useEffect(() => {
  const unsubscribe = subscribeToPostLikes((update) => {
    // Skip if we're currently processing this post (optimistic update active)
    if (isLiking.has(update.postId)) {
      console.log(`[HomeFeed] Skipping real-time update for ${update.postId} (optimistic in progress)`);
      return;
    }

    setPosts((prevPosts) =>
      prevPosts.map((post) =>
        post.id === update.postId
          ? { ...post, likes: update.likes }
          : post
      )
    );
  });

  return () => unsubscribe();
}, [isLiking]); // Add isLiking as dependency
```

Also fix the `.single()` issue in `ratings.ts`:

```typescript
// Line 49: Change .single() to .maybeSingle()
const { data: existingRating } = await supabase
  .from("post_ratings")
  .select("id")
  .eq("post_id", postId)
  .eq("session_id", sessionId)
  .maybeSingle();
```

### Option B: Database Trigger (Architectural Improvement)

**Complexity**: Medium | **Risk**: Low | **Impact**: Long-term stability

Create a PostgreSQL trigger to automatically update likes count:

```sql
-- Create function to update likes count
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts_new
    SET likes = likes + 1, updated_at = now()
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts_new
    SET likes = GREATEST(0, likes - 1), updated_at = now()
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_post_likes ON post_ratings;
CREATE TRIGGER trigger_update_post_likes
AFTER INSERT OR DELETE ON post_ratings
FOR EACH ROW
EXECUTE FUNCTION update_post_likes_count();
```

**Benefits**:
- Atomic operation (single transaction)
- Only ONE real-time event fires (the final UPDATE on posts_new)
- Removes client-side race conditions
- Simplifies `ratings.ts` to just INSERT/DELETE

**Updated ratings.ts**:

```typescript
export async function togglePostLike(postId: string, sessionId: string): Promise<RatingResult> {
  // Check if already liked
  const { data: existingRating } = await supabase
    .from("post_ratings")
    .select("id")
    .eq("post_id", postId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existingRating) {
    // Unlike - trigger handles likes decrement
    const { error } = await supabase
      .from("post_ratings")
      .delete()
      .eq("id", existingRating.id);

    if (error) return { success: false, isLiked: true, newLikeCount: 0, error: error.message };

    revalidatePostsCache();
    return { success: true, isLiked: false, newLikeCount: 0 }; // Count managed by trigger
  } else {
    // Like - trigger handles likes increment
    const { error } = await supabase
      .from("post_ratings")
      .insert({ post_id: postId, session_id: sessionId });

    if (error) return { success: false, isLiked: false, newLikeCount: 0, error: error.message };

    revalidatePostsCache();
    return { success: true, isLiked: true, newLikeCount: 0 }; // Count managed by trigger
  }
}
```

### Option C: Supabase RPC Function (Most Robust)

**Complexity**: Medium | **Risk**: Low | **Impact**: Enterprise-grade

Create a single RPC function that handles the entire like/unlike atomically:

```sql
CREATE OR REPLACE FUNCTION toggle_post_like(
  p_post_id UUID,
  p_session_id TEXT
)
RETURNS JSON AS $$
DECLARE
  v_existing_rating_id UUID;
  v_is_liked BOOLEAN;
  v_new_likes NUMERIC;
BEGIN
  -- Check if rating exists
  SELECT id INTO v_existing_rating_id
  FROM post_ratings
  WHERE post_id = p_post_id AND session_id = p_session_id;

  IF v_existing_rating_id IS NOT NULL THEN
    -- Unlike: Delete rating and decrement
    DELETE FROM post_ratings WHERE id = v_existing_rating_id;

    UPDATE posts_new
    SET likes = GREATEST(0, likes - 1), updated_at = now()
    WHERE id = p_post_id
    RETURNING likes INTO v_new_likes;

    v_is_liked := FALSE;
  ELSE
    -- Like: Insert rating and increment
    INSERT INTO post_ratings (post_id, session_id)
    VALUES (p_post_id, p_session_id);

    UPDATE posts_new
    SET likes = likes + 1, updated_at = now()
    WHERE id = p_post_id
    RETURNING likes INTO v_new_likes;

    v_is_liked := TRUE;
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'isLiked', v_is_liked,
    'newLikeCount', v_new_likes
  );
EXCEPTION WHEN unique_violation THEN
  -- Handle race condition (concurrent like from same session)
  RETURN json_build_object(
    'success', FALSE,
    'isLiked', TRUE,
    'newLikeCount', 0,
    'error', 'Already liked this post'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Updated ratings.ts**:

```typescript
export async function togglePostLike(postId: string, sessionId: string): Promise<RatingResult> {
  const { data, error } = await supabase.rpc('toggle_post_like', {
    p_post_id: postId,
    p_session_id: sessionId,
  });

  if (error) {
    return { success: false, isLiked: false, newLikeCount: 0, error: error.message };
  }

  revalidatePostsCache();
  return data as RatingResult;
}
```

**Benefits**:
- Single network call
- Fully atomic (transaction)
- Single real-time event
- Race condition handled at database level
- Most performant

### Option D: Background Queue with pgmq (Future Enhancement)

For high-traffic scenarios, use Supabase's `pgmq` extension for background processing:

```sql
-- Enable pgmq extension (already available but not installed)
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create queue for like operations
SELECT pgmq.create('like_queue');

-- In your app, instead of direct like, queue the operation
SELECT pgmq.send('like_queue',
  json_build_object(
    'post_id', '8e213b82-8cbd-4fb3-baa8-a1398ccae463',
    'session_id', 'mk66nvmy...',
    'action', 'like'
  )
);

-- Background worker processes queue
-- (Would need a Supabase Edge Function or pg_cron job)
```

This is overkill for current traffic but useful for:
- Rate limiting
- Batch processing
- Retry logic
- Analytics

---

## Recommended Implementation Path

### Phase 1: Immediate Fix (Option A)

1. Fix `.single()` → `.maybeSingle()` in `ratings.ts`
2. Add `isLiking` guard to real-time subscription

**Effort**: ~1 hour

### Phase 2: Architectural Improvement (Option B or C)

1. Create database trigger OR RPC function
2. Simplify `ratings.ts`
3. Remove redundant GET/PATCH calls

**Effort**: ~2-3 hours

### Phase 3: Optimization (Optional)

1. Enable `pgmq` for queue-based processing
2. Add analytics/telemetry
3. Consider connection pooling optimization

---

## Files to Modify

| File | Changes |
|------|---------|
| `app/utils/ratings.ts` | `.maybeSingle()`, simplify if using trigger/RPC |
| `app/components/HomeFeed.tsx` | Guard real-time updates during optimistic |
| Supabase Dashboard | Create trigger or RPC function |

---

## Testing Checklist

- [x] Like counter increments correctly (no flash)
- [x] Unlike counter decrements correctly (no flash)
- [x] Multi-tab sync works via Realtime
- [x] 406 error no longer appears (RPC function handles this internally)
- [x] Optimistic update shows immediate feedback
- [x] Server state matches final UI state
- [ ] Rapid clicking doesn't cause issues (to verify)

### Test Results (2026-01-08)

| Test | Before Fix | After Fix |
|------|------------|-----------|
| Unlike (2→1) | 2→3→1 (wrong direction flash) | 2→1 (correct) |
| Like (1→2) | 1→0→2 (wrong direction flash) | 1→2 (correct) |
| RPC Response | N/A (4 separate calls) | `{"success":true,"isLiked":true,"newLikeCount":2}` |
| Network Calls | 4 per like/unlike | 1 per like/unlike |

---

## Related Documentation

- [LIKE_COUNTER_FLASH_BUG.md](./LIKE_COUNTER_FLASH_BUG.md) - Original bug report
- [CACHING_OPTIMIZATION.md](./CACHING_OPTIMIZATION.md) - Server-side caching strategy
- [CLIENT_CACHING_ARCHITECTURE.md](./CLIENT_CACHING_ARCHITECTURE.md) - TanStack Query setup
