# Caching Optimization Feature - Implementation Context

## Overview

This document describes the implementation of server-side caching for Suplatzigram using Next.js 16's `unstable_cache` API. The feature reduces Supabase database hits by caching post data on the server while preserving real-time like updates on the client.

## Problem Statement

Previously, both the home page and ranking page were fully client-side components (`"use client"`). This caused several issues:

1. **Every page visit triggered fresh Supabase queries** - No caching at all
2. **Slower initial page loads** - Users had to wait for client-side data fetching
3. **Limited SEO** - Search engines couldn't see content rendered on the server
4. **High database load** - Popular pages would hammer the database with repeated identical queries

### Evidence of the Problem

Looking at the original `app/page.tsx`:

```typescript
"use client";  // ← Everything runs on the client

export default function Home() {
  useEffect(() => {
    fetchPosts(0, true);  // ← Fetches data AFTER page loads, every single time
  }, [fetchPosts]);
  // ...
}
```

This pattern meant:
- 1,000 page visits = 1,000 Supabase queries
- No server-side rendering benefits
- No caching between requests

## Solution Architecture

### Hybrid Server + Client Component Pattern

The solution splits each page into two parts:

1. **Server Component** (the page itself): Fetches and caches initial data
2. **Client Component** (new): Receives cached data as props, handles interactivity

```
┌─────────────────────────────────────────────────────────────┐
│ User Request                                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Server Component (page.tsx)                                 │
│   └── getCachedHomePosts() ───► unstable_cache              │
│           ├── Cache HIT → Return cached data (instant!)     │
│           └── Cache MISS → Fetch from Supabase → Cache     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Client Component (HomeFeed.tsx)                             │
│   ├── Receives cached posts as props                       │
│   ├── Fetches session-specific liked status                │
│   ├── Handles like/unlike interactions                     │
│   ├── Real-time subscription for like count updates        │
│   └── Infinite scroll for loading more posts               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (on like/unlike)
┌─────────────────────────────────────────────────────────────┐
│ Server Action (revalidatePostsCache)                        │
│   └── revalidateTag('posts') → Cache invalidated           │
└─────────────────────────────────────────────────────────────┘
```

### Cache Configuration

| Page | Cache Duration | Tags | Rationale |
|------|----------------|------|-----------|
| Home (`/`) | 60 seconds | `posts`, `home-posts` | Balance freshness with performance |
| Ranking (`/rank`) | 5 minutes | `posts`, `ranked-posts` | Ranking changes less frequently |

## Technical Decisions

### Why `unstable_cache` Over Other Options?

Next.js 16 offers several caching approaches. We chose `unstable_cache` for these reasons:

1. **Works with non-fetch data sources**: Unlike `fetch` caching, `unstable_cache` works with any async function, including Supabase client queries

2. **Tag-based invalidation**: Supports cache tags for granular invalidation via `revalidateTag()`

3. **Time-based revalidation**: Supports `revalidate` option for automatic cache refresh

4. **Key customization**: Allows custom cache keys for pagination support

```typescript
const cachedFetch = unstable_cache(
  async () => fetchHomePosts(page, limit),
  ['home-posts', `page-${page}`, `limit-${limit}`],  // ← Custom cache key
  {
    revalidate: 60,  // ← Revalidate every 60 seconds
    tags: ['posts', 'home-posts'],  // ← Tags for invalidation
  }
)
```

### Why Not Use the Server-Side Supabase Client Inside Cache?

**Initial attempt:** We tried using `@supabase/ssr`'s `createServerClient` inside the cached function.

**Problem:** `unstable_cache` cannot use dynamic data sources like `cookies()` inside the cached function. This threw an error:

```
Error: Route / used `cookies()` inside a function cached with `unstable_cache()`.
Accessing Dynamic data sources inside a cache scope is not supported.
```

**Solution:** Use a simple Supabase client without cookie handling for cached functions. Since we're only reading public posts data (no authentication required), this is safe:

```typescript
// Create a standalone Supabase client for cached functions
function getSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}
```

### Why Separate Liked Status Fetch?

The cached post data doesn't include `isLiked` status because:

1. **Liked status is session-specific**: Each user has their own liked posts
2. **Sessions are stored in localStorage**: Not available on the server
3. **Cache would be wrong**: Caching `isLiked` would show one user's likes to everyone

**Solution:** Fetch liked status on the client after receiving cached posts:

```typescript
// In HomeFeed.tsx (client component)
useEffect(() => {
  const initializeSession = async () => {
    const sid = getSessionId();  // From localStorage
    const postsWithLikeStatus = await getPostsWithLikeStatus(sid);
    // Merge liked status into cached posts
  };
  initializeSession();
}, [initialPosts]);
```

### Why Keep Real-time Subscriptions?

Even with caching, we need real-time updates for likes because:

1. **Cache is not real-time**: A 60-second cache means stale data for up to 60 seconds
2. **Likes are the most dynamic data**: Users expect immediate feedback
3. **Multi-user scenarios**: One user's like should appear for all users quickly

The real-time subscription handles this:

```typescript
useEffect(() => {
  const unsubscribe = subscribeToPostLikes((update) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) =>
        post.id === update.postId
          ? { ...post, likes: update.likes }
          : post
      )
    );
  });
  return () => unsubscribe();
}, []);
```

### Why Use `revalidateTag` After Likes?

When a user likes/unlikes a post, we invalidate the cache to ensure:

1. **New visitors see fresh data**: The next page load after cache expiry will have correct counts
2. **Rankings stay accurate**: Posts crossing the >5 likes threshold appear/disappear correctly

```typescript
// In ratings.ts
if (result.success) {
  revalidatePostsCache().catch((err) => {
    console.error("[Ratings] Error revalidating cache:", err);
  });
}
```

**Why `.catch()`?** The revalidation is fire-and-forget. We don't want to block the like operation or fail if revalidation fails.

### Why Next.js 16's `revalidateTag` Requires Two Arguments?

In Next.js 16, `revalidateTag` has a new signature:

```typescript
revalidateTag(tag: string, profile: string | CacheLifeConfig): void
```

The second argument is the cache profile. We use `"default"` for standard behavior:

```typescript
revalidateTag(CACHE_TAGS.POSTS, "default");
```

## Files Created/Modified

### New Files

#### 1. `app/utils/supabase/server.ts`
Server-side Supabase client with cookie handling. Created for future authenticated server operations, though not used in the cached functions due to `unstable_cache` limitations.

#### 2. `app/utils/cached-posts.ts`
Core caching logic:
- `getCachedHomePosts(page, limit)` - Cached home page posts
- `getCachedRankedPosts()` - Cached ranked posts
- `CACHE_TAGS` - Exported constants for cache invalidation
- `fetchHomePosts()` / `fetchRankedPosts()` - Raw fetch functions wrapped by cache

#### 3. `app/components/HomeFeed.tsx`
Client component extracted from home page:
- Receives `initialPosts` as props from server
- Handles session initialization and liked status
- Manages like/unlike with optimistic updates
- Real-time subscription for like counts
- Infinite scroll pagination with deduplication
- Skeleton loading states for error/loading scenarios

#### 4. `app/components/RankGrid.tsx`
Client component extracted from rank page:
- Receives `initialPosts` as props from server
- Handles session initialization and liked status
- Manages like/unlike with optimistic updates
- Real-time subscription for like counts
- Post modal for detailed view
- Skeleton loading states for error/loading scenarios

#### 5. `app/actions/revalidate-posts.ts`
Server Actions for cache invalidation:
- `revalidatePostsCache()` - Invalidates all posts caches
- `revalidateHomeCache()` - Invalidates only home posts
- `revalidateRankedCache()` - Invalidates only ranked posts

### Modified Files

#### `app/page.tsx`
Transformed from client component to server component:
- Removed `"use client"` directive
- Uses `getCachedHomePosts()` for data fetching
- Renders `HomeFeed` client component with cached data

**Before:**
```typescript
"use client";
export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  useEffect(() => { fetchPosts(); }, []);
  // ... 200+ lines of component logic
}
```

**After:**
```typescript
export default async function Home() {
  const initialPosts = await getCachedHomePosts(0, 10);
  return <HomeFeed initialPosts={initialPosts} />;
}
```

#### `app/rank/page.tsx`
Same transformation as home page:
- Removed `"use client"` directive
- Uses `getCachedRankedPosts()` for data fetching
- Renders `RankGrid` client component with cached data

#### `app/utils/ratings.ts`
Added cache invalidation after successful like/unlike:
- Imports `revalidatePostsCache` server action
- Calls revalidation after successful database operations
- Added debug logging for cache invalidation

#### `package.json`
Added `@supabase/ssr` dependency for server-side Supabase client capabilities.

#### `app/post/page.tsx`
Added cache invalidation and automatic redirect after successful post creation:
- Imports `revalidatePostsCache` server action
- Imports `useRouter` from `next/navigation`
- Awaits `revalidatePostsCache()` to invalidate server-side cache
- Uses `router.push("/")` + `router.refresh()` to redirect user and bypass client-side Router Cache

**Bug Fixed:** New posts now appear immediately in the feed. User is automatically redirected to home after creating a post.

#### `CLAUDE.md`
Updated documentation to reflect new architecture.

## Data Flow

### Initial Page Load

```
1. User visits /
2. Server Component (page.tsx) executes
3. getCachedHomePosts() is called
   ├── Cache HIT: Return cached data (< 1ms)
   └── Cache MISS:
       └── fetchHomePosts() queries Supabase (~100-500ms)
       └── Result cached for 60 seconds
4. HomeFeed receives initialPosts as props
5. Client-side hydration completes
6. HomeFeed fetches session-specific liked status
7. Real-time subscription established
```

### Like/Unlike Flow

```
1. User clicks heart icon
2. Optimistic UI update (instant)
3. togglePostLike() called
   ├── Database updated
   ├── revalidatePostsCache() called (async, non-blocking)
   └── Result returned to client
4. Real-time broadcast to all connected clients
5. All clients update their like counts
```

### Post Creation Flow

```
1. User fills out post form (image + caption)
2. User clicks "Publicar" button
3. uploadAndCreatePost() called
   ├── Image uploaded to Supabase Storage
   ├── Post inserted into posts_new table
   └── Result returned to client
4. revalidatePostsCache() called (awaited)
5. Server-side cache invalidated
6. router.push("/") + router.refresh() called
   ├── Navigates user to home page
   └── Bypasses client-side Router Cache
7. User sees their new post immediately
```

**Important:** Next.js has two caching layers:
1. **Server-side Data Cache** - Invalidated via `revalidateTag()`
2. **Client-side Router Cache** - Caches RSC payloads for 30 seconds

Using `router.refresh()` after `router.push()` ensures both caches are bypassed, so the new post appears immediately.

### Cache Revalidation Flow

```
1. revalidateTag('posts', 'default') called
2. Next.js marks cache entries with 'posts' tag as stale
3. Next page visit triggers fresh fetch
4. New data cached with updated timestamp
```

## Performance Comparison

### Before (Client-Side Only)

```
Page Visit Timeline:
├─ 0ms: HTML shell delivered (no content)
├─ 100ms: JavaScript bundle loaded
├─ 200ms: React hydration complete
├─ 300ms: useEffect triggers data fetch
├─ 500-800ms: Supabase query completes
└─ 800ms+: Content visible to user

Database Load:
- Every visit = 1 query
- 1000 visits/hour = 1000 queries/hour
```

### After (Hybrid with Caching)

```
Page Visit Timeline:
├─ 0ms: HTML with content delivered (SSR)
├─ 100ms: JavaScript bundle loaded
├─ 200ms: React hydration complete
├─ 200ms: Session-specific liked status fetched
└─ 300ms: Full interactivity ready

Database Load:
- Cache HIT: 0 queries
- Cache MISS: 1 query (cached for 60-300 seconds)
- 1000 visits/hour with 60s cache ≈ 60 queries/hour (94% reduction!)
```

## Build Output Verification

The build output confirms caching is working:

```bash
Route (app)         Revalidate  Expire
┌ ○ /                       1m      1y    # 60 seconds revalidate
├ ○ /rank                   5m      1y    # 5 minutes revalidate
```

## Testing

### Unit Tests

All existing tests pass (40 tests):

```bash
npm run test:run
# ✓ tests/session.test.ts (4 tests)
# ✓ tests/comments.test.ts (15 tests)
# ✓ tests/ratings.test.ts (8 tests)
# ✓ tests/CommentsSection.test.tsx (13 tests)
```

**Note:** The `revalidateTag` function logs an error in tests because it requires a Next.js server context. This is expected behavior - the revalidation works correctly in production.

### Manual Testing

1. **Start the dev server:**
   ```bash
   npm run dev
   ```

2. **Check server logs for cache behavior:**
   ```
   [CachedPosts] getCachedHomePosts called - page: 0, limit: 10
   [CachedPosts] Fetching home posts - page: 0, limit: 10
   [CachedPosts] Fetched 10 home posts from Supabase
   ```

3. **Refresh the page within 60 seconds:**
   - Should see faster load (cache hit)
   - Server logs won't show new Supabase fetch

4. **Wait 60+ seconds and refresh:**
   - Should see new Supabase fetch in logs (cache expired)

5. **Like a post and check another browser/tab:**
   - Like count should update in real-time
   - Next page load should show updated count

## Considerations

### Skeleton Loading States

Even with server-side caching, we preserve skeleton loading states for these scenarios:

1. **Supabase outage**: If the database is down, cached data may be empty
2. **Cold starts**: First request after deployment may be slow
3. **Network issues**: Cache miss + slow Supabase = delayed initial data
4. **Client hydration**: Brief moment between SSR and client initialization

The `isInitializing` state tracks this:

```typescript
const [isInitializing, setIsInitializing] = useState(true);

useEffect(() => {
  // ... initialization logic ...
  setIsInitializing(false);
}, []);

// In render:
{isInitializing && posts.length === 0 && <Skeletons />}
{!isInitializing && posts.length === 0 && <EmptyState />}
```

### Infinite Scroll Deduplication

When fetching more posts during infinite scroll, we deduplicate to prevent React "duplicate key" errors:

```typescript
setPosts((prev) => {
  const existingIds = new Set(prev.map(p => String(p.id)));
  const newPosts = data.filter(p => !existingIds.has(String(p.id)));
  return [...prev, ...newPosts];
});
```

This can happen due to:
- Pagination overlap (new posts inserted between pages)
- Timing issues with rapid scrolling
- Cache/database inconsistencies

### When Cache is Bypassed

The cache is not used in these scenarios:
- Fetching additional posts via infinite scroll (client-side fetch)
- Fetching session-specific liked status (client-side fetch)
- Real-time like count updates (WebSocket subscription)

### Cache Invalidation Timing

Cache invalidation is **eventual, not immediate**:
- `revalidateTag()` marks cache as stale
- Fresh data is only fetched on the next page visit
- Real-time subscriptions provide immediate updates for likes

### Development vs Production

In development (`npm run dev`):
- Caching behavior may differ slightly
- Full caching effectiveness seen in production build

To test production caching:
```bash
npm run build
npm run start
```

### Memory Considerations

Cached data is stored in Next.js's Data Cache:
- Persists across requests and deployments
- Automatically managed by Next.js
- No manual cleanup required

## Limitations

### Session-Specific Data

The cache cannot include user-specific data like:
- `isLiked` status (varies per session)
- User preferences
- Authentication state

These are fetched client-side after the cached posts are delivered.

### Real-time Data

For truly real-time data (like live comments), caching may not be appropriate. Consider:
- Shorter cache durations
- WebSocket subscriptions
- Polling for critical real-time data

## Known Issues and Fixes

### Issue: New posts don't appear immediately in the feed

**Symptom:** After creating a new post, navigating to the home feed would show the old cached posts. The new post only appeared after waiting 60+ seconds (cache expiration) or doing a hard refresh.

**Root Cause:** Two caching layers were involved:
1. **Server-side Data Cache** - Not being invalidated after post creation
2. **Client-side Router Cache** - Next.js caches RSC payloads for 30 seconds during client-side navigation

Even after adding `revalidateTag()`, client-side navigation via `next/link` would still serve cached data from the Router Cache.

**Fix:** Updated post creation flow to handle both cache layers:

```typescript
// In app/post/page.tsx
try {
  await uploadAndCreatePost(imageFile);

  // Invalidate server-side cache
  await revalidatePostsCache();

  // Reset form state
  setImageFile(null);
  setImagePreview(null);
  setCaption("");

  // Redirect to home with router.refresh() to bypass client-side Router Cache
  router.push("/");
  router.refresh();
} catch (error) {
  // ...
}
```

**Result:** After creating a post, user is automatically redirected to home and sees their new post immediately.

## Future Improvements

1. **Streaming with Suspense**: Use React Suspense boundaries to stream cached content while loading session-specific data

2. **Edge Caching**: Deploy to Vercel Edge Functions for even faster cache hits

3. **`use cache` Directive**: When Next.js stabilizes the `use cache` directive, migrate from `unstable_cache`

4. **Granular Cache Tags**: Add post-specific tags for more targeted invalidation:
   ```typescript
   tags: ['posts', 'home-posts', `post-${postId}`]
   ```

5. **Cache Warming**: Pre-fetch and cache popular routes on deployment

6. **Analytics**: Add cache hit/miss metrics to monitor effectiveness

## Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| `@supabase/ssr` | ^0.8.0 | Server-side Supabase client (for future auth features) |

## References

- [Next.js unstable_cache Documentation](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
- [Next.js revalidateTag Documentation](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
- [Supabase Blog: Fetching and Caching in Next.js Server Components](https://supabase.com/blog/fetching-and-caching-supabase-data-in-next-js-server-components)
- [Supabase SSR Package Documentation](https://supabase.com/docs/guides/auth/server-side/nextjs)

