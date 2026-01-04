# Rating Persistence Feature - Implementation Context

## Overview

This document describes the implementation of the rating persistence feature for Suplatzigram. The feature allows users to like posts and persists these ratings to the database, with a limitation of one rating per session to prevent abuse.

## Problem Statement

Previously, when users clicked "like" on the homepage, the rating was only stored in local React state. Refreshing the page would reset all likes, and there was no persistence to the database.

## Solution Architecture

### Session-Based Rating System

Since the application doesn't have user authentication, we implemented a session-based approach:

1. **Session Identification**: Each browser session gets a unique session ID stored in `localStorage`
2. **One Rating Per Session**: Database constraints enforce that each session can only like a post once
3. **Toggle Behavior**: Clicking the heart toggles between liked/unliked states
4. **Optimistic Updates**: UI updates immediately while the database operation happens in the background

## Files Created/Modified

### New Files

#### 1. `supabase/migrations/20260102000004_create_post_ratings.sql`
Database migration that creates the `post_ratings` table:
- `id`: UUID primary key
- `post_id`: Foreign key reference to `posts_new.id`
- `session_id`: Text field for the browser session identifier
- Unique constraint on `(post_id, session_id)` to prevent duplicate likes
- Indexes for efficient querying
- RLS policies for public access (matching existing pattern)

#### 2. `app/utils/session.ts`
Session management utility:
- `getSessionId()`: Gets or creates a unique session ID in localStorage
- `clearSessionId()`: Clears the session (useful for testing)
- Session ID format: `{timestamp}-{uuid}` for uniqueness and debugging

#### 3. `app/utils/ratings.ts`
Rating persistence logic:
- `togglePostLike(postId, sessionId)`: Toggles like status and updates the database
- `getSessionLikes(postIds, sessionId)`: Gets like status for multiple posts
- `isPostLikedBySession(postId, sessionId)`: Checks if a single post is liked

### Modified Files

#### 4. `app/utils/posts.ts`
Added new function:
- `getPostsWithLikeStatus(sessionId)`: Fetches posts with session-specific like status

#### 5. `app/page.tsx`
Updated homepage component:
- Added session ID state management
- Made `handleLike` async with database persistence
- Added optimistic updates with rollback on failure
- Added double-click prevention during processing

## Database Schema

```sql
CREATE TABLE public.post_ratings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES public.posts_new(id) ON DELETE CASCADE,
    session_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT unique_session_post_rating UNIQUE (post_id, session_id)
);
```

## Data Flow

### When a User Likes a Post

1. User clicks the heart icon
2. Frontend immediately updates UI (optimistic update)
3. Frontend calls `togglePostLike(postId, sessionId)`
4. Backend checks if session already liked the post:
   - If **not liked**: Inserts into `post_ratings`, increments `posts_new.likes`
   - If **already liked**: Deletes from `post_ratings`, decrements `posts_new.likes`
5. If database operation fails, UI reverts to previous state

### When Page Loads

1. Frontend calls `getSessionId()` to get/create session
2. Frontend calls `getPostsWithLikeStatus(sessionId)`
3. Backend fetches posts and queries `post_ratings` for this session
4. Posts are returned with `isLiked` property set correctly

## Abuse Prevention

The system prevents rating abuse through multiple mechanisms:

1. **Unique Constraint**: Database enforces one rating per session per post
2. **Session Binding**: Ratings are tied to a browser session ID
3. **Optimistic Locking**: Race conditions are handled by checking for constraint violations
4. **Double-Click Prevention**: Frontend tracks in-progress operations

## How to Apply the Migration

To apply the new migration to your Supabase instance:

```bash
# For local development
supabase db reset

# Or apply just this migration
supabase migration up
```

## Testing the Feature

1. Start the development server: `npm run dev`
2. Open the homepage
3. Click on a heart icon to like a post
4. Refresh the page - the like should persist
5. Click again to unlike
6. Open a new browser/incognito window - it will have a different session and can like independently

## Considerations

### Session Storage Limitations

- Sessions are stored in `localStorage`, which is per-origin and per-browser
- Clearing browser data will reset the session
- Different browsers/devices will have different sessions

### Database Performance

- Indexes on `session_id` and `post_id` ensure efficient queries
- Batch fetching of like status minimizes database round trips

### Future Improvements

If user authentication is added later:
1. Migrate from session-based to user-based ratings
2. Add a `user_id` column to `post_ratings`
3. Link existing session ratings to user accounts if desired
