# Authenticated Posts - Quick Reference

## The Ralph Command (Copy & Paste Ready)

```bash
/ralph-loop "Implement authenticated post creation with profile association for Suplatzigram.

GOAL: Only logged-in users can create posts. Posts link to their profile (1 profile → N posts). User's posts appear on their profile wall.

READ FIRST:
- AUTHENTICATED_POSTS_RALPH_PROMPT.md (full requirements)
- CLAUDE.md (project context)
- supabase/migrations/ (current schema)

PHASES:
1. DB Migration: Add user_id, profile_id to posts_new table
2. Types: Update Post/Profile TypeScript interfaces
3. Route Guard: Protect /post - redirect anonymous to /login
4. Post Creation: Associate posts with authenticated user
5. PostForm: Show creator avatar/username in form
6. Feed Query: Join profile data when fetching posts  
7. HomeFeed UI: Display author on each post card
8. Profile Query: Fetch user's posts for their wall
9. ProfileWall: Grid component showing user's posts
10. Auth Pages: Login/signup with redirect support
11. Navigation: Update BottomNav for auth state
12. Cache: Invalidate profile caches on post creation

RULES:
- Anonymous posts still work (backward compatible)
- Use existing AuthProvider
- Run tests after each phase
- Update docs when done

Output <promise>AUTHENTICATED_POSTS_COMPLETE</promise> when verified." --completion-promise "AUTHENTICATED_POSTS_COMPLETE" --max-iterations 60
```

## Database Schema Change

```sql
-- Add to posts_new table
ALTER TABLE posts_new 
  ADD COLUMN user_id UUID REFERENCES auth.users(id),
  ADD COLUMN profile_id UUID REFERENCES profiles(id);

-- Indexes for performance
CREATE INDEX idx_posts_new_profile_id ON posts_new(profile_id);
```

## Key Data Relationships

```
auth.users (1) ──── (1) profiles (1) ──── (N) posts_new
     │                    │                    │
   id (PK)            user_id (FK)        profile_id (FK)
   email              username            user_id (FK)
                      avatar_url          image_url
                      bio                 caption
```

## User Flow Summary

```
┌─────────────────────────────────────────────────────┐
│ Anonymous User                                       │
├─────────────────────────────────────────────────────┤
│ ✓ View feed    ✓ View profiles    ✓ Like posts     │
│ ✗ Create posts → Redirect to /login                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Authenticated User                                   │
├─────────────────────────────────────────────────────┤
│ ✓ View feed    ✓ View profiles    ✓ Like posts     │
│ ✓ Create posts (with their username/avatar)        │
│ ✓ See their posts on /profile/[username]           │
└─────────────────────────────────────────────────────┘
```

## New/Modified Files

### New Files
- `supabase/migrations/YYYYMMDD_add_user_to_posts.sql`
- `app/post/PostForm.tsx`
- `app/profile/[username]/ProfileWall.tsx`
- `app/login/page.tsx` (if not exists)
- `app/signup/page.tsx` (if not exists)

### Modified Files
- `app/types/post.ts` - Add user_id, profile_id, profile object
- `app/types/profile.ts` - Add posts array
- `app/post/page.tsx` - Server component with auth check
- `app/utils/posts.ts` - Create post with user association
- `app/utils/cached-posts.ts` - Join profile on fetch
- `app/utils/cached-profiles.ts` - Include user's posts
- `app/components/HomeFeed.tsx` - Show author on posts
- `app/components/BottomNav.tsx` - Auth-aware navigation
- `app/actions/revalidate-posts.ts` - Profile cache invalidation

## Expected UI Changes

### Home Feed - Post Card Header
```
┌────────────────────────────────┐
│ 🟢 @username                   │  ← NEW: Author info
├────────────────────────────────┤
│                                │
│         [Post Image]           │
│                                │
├────────────────────────────────┤
│ ❤️ 42  💬 5                     │
│ Nice caption here...           │
└────────────────────────────────┘
```

### Profile Wall
```
┌─────────────────────────────────────┐
│    🟢                               │
│  @username                          │
│  Full Name | 12 posts              │
├─────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐            │
│ │     │ │     │ │     │  ← Grid    │
│ └─────┘ └─────┘ └─────┘    of      │
│ ┌─────┐ ┌─────┐ ┌─────┐    user's  │
│ │     │ │     │ │     │    posts   │
│ └─────┘ └─────┘ └─────┘            │
└─────────────────────────────────────┘
```

## Testing Checklist

```
Anonymous User:
□ Home feed loads
□ Click "+" → Redirects to /login
□ Can still like posts
□ Legacy anonymous posts display correctly

Authenticated User:
□ Login works
□ /post page shows username/avatar
□ Create post → Appears in feed with author
□ Navigate to profile → See own posts in grid
□ Logout → Reverts to anonymous behavior
```

## Rollback Plan

The migration adds nullable columns, so rollback is safe:

```sql
-- To rollback (if needed)
ALTER TABLE posts_new 
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS profile_id;
```

Existing anonymous posts continue to work since columns are nullable.
