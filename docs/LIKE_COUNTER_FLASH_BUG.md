# Like Counter Flash Bug

## Issue Summary

When users like or unlike a post, the like counter briefly displays **incorrect intermediate values** before settling to the correct final count. The counter appears to update in the **opposite direction** momentarily, creating a confusing visual glitch.

**Status**: Fixed ✅ (Verified in Production)
**Severity**: Medium
**Date Identified**: 2026-01-08
**Date Fixed**: 2026-01-09
**Root Cause**: Frontend - optimistic update read `post.isLiked` from stale state instead of `likedMap`
**Fix**: Use `likedMap` (TanStack Query cache) as source of truth for optimistic updates
**Files Changed**: `HomeFeed.tsx`, `RankGrid.tsx`
**Environment**: Production (https://supabase-fundamentos-dun.vercel.app/)

---

## Observed Behavior

### Test Conditions
- **User**: alexisaraujo@icloud.com (authenticated)
- **Browser**: Chrome 143 on macOS
- **Post tested**: First post by alexisaraujo (ID: `8e213b82-8cbd-4fb3-baa8-a1398ccae463`)

### Test 1: Unlike (Remove Like)

| Step | Expected | Actual |
|------|----------|--------|
| Initial state | 2 likes, "Quitar like" button | Correct |
| Click "Quitar like" | Counter: 2 → 1 | Counter: 2 → **3** → 1 |
| Button state | Immediately "Dar like" | Briefly stayed "Quitar like" |
| Final state | 1 like, "Dar like" button | Correct |

### Test 2: Like (Add Like)

| Step | Expected | Actual |
|------|----------|--------|
| Initial state | 1 like, "Dar like" button | Correct |
| Click "Dar like" | Counter: 1 → 2 | Counter: 1 → **0** → 2 |
| Button state | Immediately "Quitar like" | Briefly stayed "Dar like" |
| Final state | 2 likes, "Quitar like" button | Correct |

---

## Visual Timeline

```
UNLIKE ACTION:
[2 likes] → Click → [3 likes] → ~500ms → [1 like]
                     ↑ WRONG!             ↑ Correct final

LIKE ACTION:
[1 like] → Click → [0 likes] → ~500ms → [2 likes]
                    ↑ WRONG!             ↑ Correct final
```

---

## Root Cause Analysis

### 1. Optimistic Update Direction is Inverted

The optimistic UI update applies the delta in the **wrong direction**:
- When **unliking**: counter briefly **increases** (+1) instead of decreasing
- When **liking**: counter briefly **decreases** (-1) instead of increasing

### 2. Race Condition in State Updates

Network request flow observed:

```
Click → Optimistic update (wrong direction)
      → API mutation (DELETE/POST rating)
      → Fetch current likes count from database
      → PATCH posts_new with new count
      → Cache invalidation (POST /)
      → Refetch posts
      → Correct final state displayed
```

### 3. Stale Cache Data Override

The refetch of posts after cache invalidation may briefly restore stale cached data before the fresh data arrives, causing the intermediate wrong value.

### 4. Additional Issue: 406 Error on Rating Check

During the like operation, a request to check existing rating returned HTTP 406:

```json
{
  "code": "PGRST116",
  "details": "The result contains 0 rows",
  "hint": null,
  "message": "Cannot coerce the result to a single JSON object"
}
```

This occurs because the query expects `.single()` but finds no rows when checking if a rating already exists.

---

## Network Request Evidence

### Unlike Flow (reqid 140-150)
1. `GET /post_ratings` - Check if rating exists
2. `DELETE /post_ratings` - Delete the rating
3. `GET /posts_new?select=likes` - Get current likes count (returned `{"likes":2}`)
4. `PATCH /posts_new` - Update the likes count
5. `POST /` - Cache invalidation
6. `GET /posts_new` - Refetch all posts
7. `GET /post_ratings` - Refetch liked status

### Like Flow (reqid 159-166)
1. `GET /post_ratings` - Check if rating exists (**FAILED - 406**)
2. `POST /post_ratings` - Create new rating
3. `GET /posts_new?select=likes` - Get current likes count
4. `PATCH /posts_new` - Update the likes count
5. `POST /` - Cache invalidation
6. `GET /posts_new` - Refetch all posts
7. `GET /post_ratings` - Refetch liked status

---

## Files to Investigate

Based on the codebase architecture documented in CLAUDE.md:

| File | Purpose |
|------|---------|
| `app/components/PostCard.tsx` | Like button UI and counter display |
| `app/utils/ratings.ts` | Like/unlike mutation logic |
| `app/providers/QueryProvider.tsx` | TanStack Query configuration |
| `app/components/HomeFeed.tsx` | Post list with liked state management |

---

## Impact Assessment

- **User Experience**: Confusing counter behavior makes the app feel buggy and unreliable
- **Data Integrity**: No impact - final state is always correct
- **Frequency**: 100% reproducible on every like/unlike action
- **Affected Users**: All users (authenticated and anonymous)

---

## Recommended Fix

### Option 1: Fix Optimistic Update Logic
Ensure the optimistic update in TanStack Query's `useMutation` applies the correct delta:

```typescript
// In the mutation's onMutate callback:
onMutate: async (variables) => {
  // Cancel outgoing refetches
  await queryClient.cancelQueries({ queryKey: ['posts'] });

  // Snapshot previous value
  const previousPosts = queryClient.getQueryData(['posts']);

  // Optimistically update with CORRECT delta
  queryClient.setQueryData(['posts'], (old) => {
    return old.map(post => {
      if (post.id === variables.postId) {
        return {
          ...post,
          likes: post.likes + (variables.isLiking ? 1 : -1), // +1 for like, -1 for unlike
          isLiked: variables.isLiking
        };
      }
      return post;
    });
  });

  return { previousPosts };
}
```

### Option 2: Disable Optimistic Updates
If the complexity is too high, disable optimistic updates and show a loading state:

```typescript
// Show spinner/disabled state while mutation is in flight
const { mutate, isPending } = useMutation({...});

<button disabled={isPending}>
  {isPending ? 'Loading...' : (isLiked ? 'Quitar like' : 'Dar like')}
</button>
```

### Option 3: Fix the 406 Error
Use `.maybeSingle()` instead of `.single()` when checking for existing ratings:

```typescript
// Before (causes 406 when no rows)
const { data } = await supabase
  .from('post_ratings')
  .select('id')
  .eq('post_id', postId)
  .eq('session_id', sessionId)
  .single();

// After (returns null when no rows)
const { data } = await supabase
  .from('post_ratings')
  .select('id')
  .eq('post_id', postId)
  .eq('session_id', sessionId)
  .maybeSingle();
```

---

## Reproduction Steps

1. Navigate to https://supabase-fundamentos-dun.vercel.app/
2. Login with valid credentials
3. Observe the like count on the first post (e.g., 2 likes)
4. Click the like/unlike button
5. Watch the counter - it will briefly show the wrong value before correcting

---

## Related Documentation

- [CACHING_OPTIMIZATION.md](./CACHING_OPTIMIZATION.md) - Server-side caching strategy
- [CLIENT_CACHING_ARCHITECTURE.md](./CLIENT_CACHING_ARCHITECTURE.md) - TanStack Query setup
- [QA_CACHING_VALIDATION.md](./QA_CACHING_VALIDATION.md) - Cache validation procedures
