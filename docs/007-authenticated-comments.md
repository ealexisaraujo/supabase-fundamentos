# 007: Authenticated Comments

## Overview

This document describes the implementation of authenticated comments for Suplatzigram. This feature ensures only logged-in users can create comments, displays the commenter's username and avatar, and links comments to user profiles.

## Problem Statement

The original comments feature allowed anonymous commenting, which caused:
- Comments displayed as "Anonymous" with no identity
- No accountability for comment content
- No way to link to the commenter's profile
- Security concerns with public INSERT access

## Solution

Implement authenticated comments by:
1. Adding `profile_id` foreign key to comments table
2. Updating RLS policies to require authentication for INSERT
3. Joining profile data when fetching comments
4. Showing login prompt for anonymous users in UI

## Architecture

### Database Changes

#### New Column: `profile_id`

```sql
ALTER TABLE public.comments
  ADD COLUMN profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_comments_profile_id ON public.comments(profile_id);
```

#### Updated Schema

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  auth.users  │────<│   profiles   │────<│   comments   │
│              │  1:1│              │  1:N│              │
│  id (PK)     │     │  id (PK)     │     │  id (PK)     │
│  email       │     │  user_id(FK) │     │  post_id(FK) │
│              │     │  username    │     │  user_id     │
│              │     │  avatar_url  │     │  profile_id  │◄── NEW
│              │     │              │     │  content     │
└──────────────┘     └──────────────┘     └──────────────┘
```

#### RLS Policy Update

**Old Policy (removed):**
```sql
-- Anyone could insert comments
CREATE POLICY "Allow public insert" ON public.comments
    FOR INSERT TO public WITH CHECK (true);
```

**New Policy:**
```sql
-- Only authenticated users can comment
CREATE POLICY "Only authenticated users can comment" ON public.comments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND profile_id IS NOT NULL
        AND user_id = auth.uid()
    );
```

### TypeScript Changes

#### Updated Types (`app/types/comment.ts`)

```typescript
// New type for profile data in comments
export interface CommentProfile {
  id: string;
  username: string;
  avatar_url: string | null;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string | null;
  profile_id: string | null;  // NEW
  content: string;
  user?: { username: string; avatar: string };  // Legacy JSONB
  profile?: CommentProfile | null;              // NEW - from FK join
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateCommentInput {
  post_id: string;
  content: string;
  user_id: string;      // Required (was optional)
  profile_id: string;   // NEW - Required
}
```

### Service Layer Changes (`app/utils/comments.ts`)

#### New Function: `getCurrentUserProfile()`

```typescript
export async function getCurrentUserProfile(): Promise<CommentProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .eq("id", user.id)
    .single();

  return profile || null;
}
```

#### Updated Query: `getCommentsByPostId()`

Now joins profile data:

```typescript
const { data } = await supabase
  .from("comments")
  .select(`
    *,
    profile:profiles (
      id,
      username,
      avatar_url
    )
  `)
  .eq("post_id", postId)
  .order("created_at", { ascending: true });
```

#### Updated: `createComment()`

Now requires authentication:

```typescript
export async function createComment(input: CreateCommentInput): Promise<Comment | null> {
  // Require authentication
  if (!input.user_id || !input.profile_id) {
    console.error("Authentication required");
    return null;
  }

  const { data } = await supabase
    .from("comments")
    .insert({
      post_id: input.post_id,
      content: input.content,
      user_id: input.user_id,
      profile_id: input.profile_id,
    })
    .select(`
      *,
      profile:profiles (id, username, avatar_url)
    `)
    .single();

  return data;
}
```

### UI Changes (`app/components/CommentsSection.tsx`)

#### For Anonymous Users

Shows login prompt instead of comment form:

```tsx
<div className="p-3 bg-card-bg rounded-lg border text-center">
  <p className="text-sm text-foreground/60">
    <Link href="/auth/login" className="text-primary hover:underline">
      Login
    </Link>{" "}
    to add a comment
  </p>
</div>
```

#### For Authenticated Users

Shows comment form with user's avatar:

```tsx
<form onSubmit={handleSubmit} className="flex gap-2">
  <Image
    src={userProfile.avatar_url || "https://i.pravatar.cc/32?u=default"}
    alt={userProfile.username}
    // ...
  />
  <input
    type="text"
    placeholder="Add a comment..."
    value={newComment}
    onChange={(e) => setNewComment(e.target.value)}
  />
  <button type="submit" disabled={!newComment.trim()}>
    <SendIcon />
  </button>
</form>
```

#### Comment Display

Comments now show profile data with links:

```tsx
function CommentItem({ comment }: { comment: Comment }) {
  // Prefer profile data (FK join), fallback to legacy JSONB
  const displayName = comment.profile?.username || comment.user?.username || "Anonymous";
  const avatarUrl = comment.profile?.avatar_url || comment.user?.avatar;

  return (
    <div className="flex items-start gap-2">
      <Link href={`/profile/${displayName}`}>
        <Image src={avatarUrl} alt={displayName} />
      </Link>
      <div>
        <Link href={`/profile/${displayName}`}>
          <span className="font-semibold">{displayName}</span>
        </Link>
        <span>{comment.content}</span>
      </div>
    </div>
  );
}
```

## Migration Files

| File | Purpose |
|------|---------|
| `20260108233540_add_profile_id_to_comments.sql` | Add `profile_id` column and update RLS policy |
| `20260108234000_make_username_nullable.sql` | Make `username` nullable for registration flow |

### Migration: `20260108233540_add_profile_id_to_comments.sql`

```sql
-- Add profile_id column to comments for authenticated comment creation
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comments_profile_id ON public.comments(profile_id);

-- Drop the old permissive INSERT policy
DROP POLICY IF EXISTS "Allow public insert" ON public.comments;

-- Create new INSERT policy that requires authentication
CREATE POLICY "Only authenticated users can comment" ON public.comments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND profile_id IS NOT NULL
        AND user_id = auth.uid()
    );
```

## User Experience

### Before (Anonymous)

```
┌─────────────────────────────────────┐
│ 💬 3 comments                       │
├─────────────────────────────────────┤
│ 👤 Anonymous                        │
│ Great photo!                        │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Add a comment...            [→] │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### After (Authenticated)

```
┌─────────────────────────────────────┐
│ 💬 3 comments                       │
├─────────────────────────────────────┤
│ 🖼️ maria_garcia (clickable)        │
│ Great photo!                        │
│                                     │
│ 🖼️ [Your Avatar]                   │
│ ┌─────────────────────────────────┐ │
│ │ Add a comment...            [→] │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### After (Not Logged In)

```
┌─────────────────────────────────────┐
│ 💬 3 comments                       │
├─────────────────────────────────────┤
│ 🖼️ maria_garcia (clickable)        │
│ Great photo!                        │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │     Login to add a comment      │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Testing

### Unit Tests

All 41 tests pass:

```bash
npm run test:run

# Output:
# ✓ tests/comments.test.ts (20 tests)
# ✓ tests/CommentsSection.test.tsx (13 tests)
# ✓ tests/ratings.test.ts (8 tests)
```

### Manual Testing Checklist

- [x] Anonymous user sees "Login to add a comment"
- [x] Logged-in user sees comment form with their avatar
- [x] Submitting comment creates it with profile_id
- [x] New comment shows username (not "Anonymous")
- [x] Comment username links to `/profile/{username}`
- [x] Comment count increments after submission
- [x] Input clears after successful submission
- [x] Existing comments display correctly with profile data

## Backward Compatibility

The implementation maintains backward compatibility with existing comments:

1. **Legacy `user` JSONB field**: Still supported for reading old comments
2. **Fallback display**: `comment.profile?.username || comment.user?.username || "Anonymous"`
3. **Nullable columns**: Both `user_id` and `profile_id` are nullable for legacy data

## Security Improvements

| Aspect | Before | After |
|--------|--------|-------|
| INSERT access | Public (anyone) | Authenticated only |
| User verification | None | `user_id = auth.uid()` |
| Profile requirement | None | `profile_id IS NOT NULL` |
| Accountability | Anonymous | Linked to user profile |

## Comment Count Caching Fix (2026-01-08)

### Problem

After implementing authenticated comments, a UX issue was observed: when navigating between Home/Rank/Profile pages, the comment count would **flash from 0 to the actual count** (e.g., 0 → 2).

### Root Cause Analysis

The issue was caused by a data flow gap:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SERVER CACHE (cached-posts.ts)                               │
│    - Fetched: id, image_url, caption, likes, profile            │
│    - MISSING: comment count ❌                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. CLIENT (CommentsSection.tsx)                                 │
│    - Initialized: commentCount = 0 (default prop)               │
│    - useEffect fetched real count → updated to 2                │
│    - Brief flash: 0 → 2 ⚡                                       │
└─────────────────────────────────────────────────────────────────┘
```

Unlike `likes` (which worked correctly because TanStack Query cached the liked status), comment counts had **no caching** - they were fetched fresh on every component mount.

### Solution

Include `comments_count` in the server cache query to eliminate client-side fetch:

#### 1. Updated Post Interface (`app/mocks/posts.ts`)

```typescript
export interface Post {
  // ... existing fields
  comments_count?: number;  // NEW - from server cache
}
```

#### 2. Updated Server Queries (`app/utils/cached-posts.ts`)

Added `comments(count)` to Supabase queries:

```typescript
const { data } = await supabase
  .from('posts_new')
  .select(`
    id, image_url, caption, likes, user, user_id, profile_id, created_at,
    profile:profiles (username, avatar_url, full_name),
    comments(count)  // NEW - aggregate count
  `)
  .order('created_at', { ascending: false })

// Extract count from Supabase response: { comments: [{ count: N }] }
const posts = data.map(post => {
  const commentsData = post.comments as { count: number }[] | undefined;
  const comments_count = commentsData?.[0]?.count ?? 0;
  return { ...post, comments_count, comments: undefined };
});
```

#### 3. Updated Client Queries (`app/utils/posts.ts`)

Same pattern for infinite scroll fetch:

```typescript
const { data } = await supabase
  .from("posts_new")
  .select(`*, comments(count)`)
  // ... rest of query

// Extract and merge comment count
return data.map(post => ({
  ...post,
  comments_count: post.comments?.[0]?.count ?? 0,
  comments: undefined,
}));
```

#### 4. Pass to CommentsSection (`app/components/PostCard.tsx`)

```tsx
<CommentsSection
  postId={String(post.id)}
  initialCommentCount={post.comments_count ?? 0}  // Pass server-cached count
/>
```

### New Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ SERVER CACHE (with comments_count)                              │
│    - Returns: { ..., comments_count: 2 }                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ CLIENT (CommentsSection)                                        │
│    - Receives: initialCommentCount={2}                          │
│    - Renders "2 comments" immediately ✓                         │
│    - No flash!                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Files Changed

| File | Change |
|------|--------|
| `app/mocks/posts.ts` | Added `comments_count?: number` to Post interface |
| `app/utils/cached-posts.ts` | Added `comments(count)` to both `fetchHomePosts` and `fetchRankedPosts` queries |
| `app/utils/posts.ts` | Added `comments(count)` to `getPostsWithLikeStatus` (infinite scroll) |
| `app/components/PostCard.tsx` | Pass `initialCommentCount={post.comments_count ?? 0}` |

### Benefits

1. **No more flash**: Comment count displays immediately from server cache
2. **Reduced API calls**: Eliminates N separate `getCommentCount()` calls (1 per post)
3. **Consistent with likes**: Follows same pattern as `likes` field
4. **Redis cached**: Count is included in Redis cache for sub-millisecond access

### Fallback Behavior

If `comments_count` is not present (e.g., stale cache), `CommentsSection` still fetches the count on mount as a fallback:

```typescript
// CommentsSection.tsx - fallback for posts without cached count
useEffect(() => {
  if (hasLoadedCountRef.current) return;
  hasLoadedCountRef.current = true;
  getCommentCount(postId).then(setCommentCount);
}, [postId]);
```

## Related Documentation

- [COMMENTS_FEATURE.md](./COMMENTS_FEATURE.md) - Original comments implementation
- [004-redis-caching.md](./004-redis-caching.md) - Redis caching architecture
- [CLIENT_CACHING_ARCHITECTURE.md](./CLIENT_CACHING_ARCHITECTURE.md) - TanStack Query caching
- [CLAUDE.md](../CLAUDE.md) - Project architecture overview
- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
