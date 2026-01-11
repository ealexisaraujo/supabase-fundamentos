# Rating Persistence Feature - Implementation Context

## Overview

This document describes the implementation of the rating persistence feature for Suplatzigram. The feature allows users to like posts and persists these ratings to the database, with a limitation of one rating per session to prevent abuse.

## Problem Statement

Previously, when users clicked "like" on the homepage, the rating was only stored in local React state. Refreshing the page would reset all likes, and there was no persistence to the database.

## Solution Architecture

### Dual Identity Rating System

The application supports both anonymous and authenticated users with a dual identity system:

**For Anonymous Users:**
1. **Session Identification**: Each browser session gets a unique session ID stored in `localStorage`
2. **One Rating Per Session**: Database constraints enforce that each session can only like a post once
3. **Browser-Bound**: Likes are lost if browser data is cleared

**For Authenticated Users:**
1. **Profile Identification**: Uses `profile_id` from the profiles table
2. **One Rating Per Profile**: Database constraints enforce one like per profile per post
3. **Persistent**: Likes persist across devices and browsers

**Common Features:**
1. **Toggle Behavior**: Clicking the heart toggles between liked/unliked states
2. **Optimistic Updates**: UI updates immediately while the database operation happens in the background
3. **Real-time Sync**: Supabase's pub/sub system broadcasts like count changes to all connected clients

## Technical Decisions

### Why Supabase Real-time with Pub/Sub?

We chose Supabase's real-time features with a pub/sub approach for several reasons:

1. **Atomic Toggling**: The single-row-per-user-item approach combined with a unique constraint ensures atomic like/unlike operations at the database level

2. **Race Condition Prevention**: Database constraints (not application code) enforce the "one like per session" rule, eliminating race conditions that could occur with concurrent requests

3. **Instant UI Updates**: Real-time subscriptions broadcast changes to all connected clients immediately, ensuring consistent like counts across all users viewing the same post

4. **Scalability**: The pub/sub model is efficient for distributed systems as clients subscribe to changes rather than polling

5. **Multi-tab Sync**: Users with multiple tabs open see consistent state across all tabs

### Single Row Per User-Item Pair

Instead of inserting multiple rating rows, we maintain exactly one row per (post_id, identifier) pair:

**For session-based likes:**
```sql
CONSTRAINT unique_session_post_rating UNIQUE (post_id, session_id)
```

**For profile-based likes:**
```sql
CREATE UNIQUE INDEX idx_post_ratings_profile ON post_ratings(post_id, profile_id) WHERE profile_id IS NOT NULL;
```

This approach:
- Simplifies the data model (no need to count rows)
- Makes "unlike" a simple DELETE operation
- Prevents duplicate ratings at the database level (most reliable method)
- Enables efficient queries with proper indexing
- Allows authenticated users' likes to persist across devices

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
- `getSessionLikes(postIds, sessionId)`: Gets like status for multiple posts (batch operation)
- `subscribeToPostLikes(onUpdate)`: Subscribes to real-time like count updates
- `subscribeToSessionRatings(sessionId, onRatingChange)`: Subscribes to session-specific rating changes

#### 4. `supabase/migrations/20260102000005_enable_realtime.sql`
Enables Supabase real-time for the rating system:
- Adds `posts_new` and `post_ratings` tables to the `supabase_realtime` publication
- Sets `REPLICA IDENTITY FULL` on `post_ratings` to include old values in DELETE events

#### 5. `tests/session.test.ts` & `tests/ratings.test.ts`
Unit tests for the rating system:
- Session ID generation and persistence tests
- Rating toggle functionality tests
- Batch like status fetching tests
- Constraint enforcement documentation tests

### Modified Files

#### `app/utils/posts.ts`
- Removed unused `getPosts()` function (replaced by `getPostsWithLikeStatus`)
- Added `getPostsWithLikeStatus(sessionId)`: Fetches posts with session-specific like status

#### `app/page.tsx`
Updated homepage component:
- Added session ID state management
- Made `handleLike` async with database persistence
- Added optimistic updates with rollback on failure
- Added double-click prevention during processing
- Added real-time subscription for instant like count updates across all clients

#### `app/rank/page.tsx`
Updated ranking page:
- Added Post type import (was missing)
- Added real-time subscription for live ranking updates

## Database Schema

```sql
CREATE TABLE public.post_ratings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES public.posts_new(id) ON DELETE CASCADE,
    session_id text,  -- For anonymous users (nullable)
    profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,  -- For authenticated users
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT unique_session_post_rating UNIQUE (post_id, session_id),
    CONSTRAINT check_identity CHECK (session_id IS NOT NULL OR profile_id IS NOT NULL)
);

-- Unique index for profile-based likes (partial index)
CREATE UNIQUE INDEX idx_post_ratings_profile ON post_ratings(post_id, profile_id) WHERE profile_id IS NOT NULL;
```

**Identity Strategy:**
- Anonymous users: `session_id` is set, `profile_id` is NULL
- Authenticated users: `profile_id` is set, `session_id` is NULL
- The CHECK constraint ensures at least one identifier is always present

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
5. Frontend subscribes to real-time updates via `subscribeToPostLikes()`

### Real-time Update Flow

When any user likes a post:
1. The database update triggers a Postgres change event
2. Supabase broadcasts the change to all subscribed clients
3. Each client receives the new like count via the subscription callback
4. The UI updates instantly without needing to refresh or poll

```
User A likes post → Database UPDATE → Supabase Realtime → All clients receive update
                                                           ↓
                                                    User B sees new count
                                                    User C sees new count
                                                    User A sees confirmed count
```

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

### Testing Real-time Updates

1. Open the app in two different browser windows (side by side)
2. Like a post in one window
3. Observe the like count update instantly in the other window
4. This demonstrates the pub/sub real-time synchronization

## Considerations

### Session Storage Limitations

- Sessions are stored in `localStorage`, which is per-origin and per-browser
- Clearing browser data will reset the session
- Different browsers/devices will have different sessions

### Database Performance

- Indexes on `session_id` and `post_id` ensure efficient queries
- Batch fetching of like status minimizes database round trips

### Real-time Considerations

- **WebSocket Connections**: Each client maintains a WebSocket connection to Supabase for real-time updates
- **Connection Management**: The subscription is cleaned up on component unmount to prevent memory leaks
- **Offline Handling**: If connection is lost, optimistic updates still work and will sync when reconnected
- **Bandwidth**: Only changed data is transmitted, not full table refreshes

### Dual Identity Approach

The system uses two identity mechanisms depending on authentication status:

1. **Anonymous Users (session_id)**: Browser-bound identity stored in localStorage
2. **Authenticated Users (profile_id)**: Persistent identity from the profiles table

```
Anonymous:    session_id  → Browser-bound (lost if localStorage cleared)
Authenticated: profile_id → Persistent (works across devices/browsers)
Real-time:                → Broadcasts changes (syncs all clients)
```

**Why not just use session_id for everyone?**
- Problem: Authenticated users would lose their likes when clearing browser data
- Solution: Use profile_id for authenticated users so likes persist across devices

## Code Cleanup

### Removed Code

The following unused code was removed during cleanup:

1. **`getPosts()` in `app/utils/posts.ts`**: Replaced by `getPostsWithLikeStatus()` which includes session-specific like status
2. **`isPostLikedBySession()` in `app/utils/ratings.ts`**: Unused single-item check, replaced by batch `getSessionLikes()` for efficiency
3. **Dead RPC call**: Removed reference to non-existent `decrement_likes` RPC function

### Why These Were Removed

- **Single responsibility**: Each function should have one clear purpose
- **Efficiency**: Batch operations (`getSessionLikes`) are preferred over single-item queries
- **Dead code elimination**: Code that isn't used shouldn't exist

## Testing

### Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run
```

### Test Coverage

- **Session tests** (`tests/session.test.ts`):
  - Session ID generation
  - Session ID persistence in localStorage
  - Session clearing functionality

- **Rating tests** (`tests/ratings.test.ts`):
  - Like toggle behavior
  - Batch like status fetching
  - Error handling for missing session
  - Unique constraint enforcement (conceptual)

### Implemented: Dual Identity System (January 2026)

User authentication has been implemented with a dual identity approach:

1. ✅ Added `profile_id` column to `post_ratings` table
2. ✅ Session-based likes remain for anonymous users
3. ✅ Profile-based likes for authenticated users persist across devices
4. ✅ AuthProvider exposes `profileId` for use in like operations
5. ✅ Migration available to convert session likes to profile likes on login
