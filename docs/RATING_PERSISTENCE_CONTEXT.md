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
5. **Real-time Sync**: Supabase's pub/sub system broadcasts like count changes to all connected clients

## Technical Decisions

### Why Supabase Real-time with Pub/Sub?

We chose Supabase's real-time features with a pub/sub approach for several reasons:

1. **Atomic Toggling**: The single-row-per-user-item approach combined with a unique constraint ensures atomic like/unlike operations at the database level

2. **Race Condition Prevention**: Database constraints (not application code) enforce the "one like per session" rule, eliminating race conditions that could occur with concurrent requests

3. **Instant UI Updates**: Real-time subscriptions broadcast changes to all connected clients immediately, ensuring consistent like counts across all users viewing the same post

4. **Scalability**: The pub/sub model is efficient for distributed systems as clients subscribe to changes rather than polling

5. **Multi-tab Sync**: Users with multiple tabs open see consistent state across all tabs

### Single Row Per User-Item Pair

Instead of inserting multiple rating rows, we maintain exactly one row per (post_id, session_id) pair:

```sql
CONSTRAINT unique_session_post_rating UNIQUE (post_id, session_id)
```

This approach:
- Simplifies the data model (no need to count rows)
- Makes "unlike" a simple DELETE operation
- Prevents duplicate ratings at the database level (most reliable method)
- Enables efficient queries with proper indexing

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

### Why Session-Based Approach is Still Necessary

Even with real-time updates, the session-based approach is essential because:

1. **Identity**: Sessions identify *who* liked what - without this, we can't enforce "one like per user"
2. **Real-time**: Real-time broadcasts *what* changed to everyone - it's about synchronization, not identity
3. **Complementary**: Sessions + Real-time work together - sessions for enforcement, real-time for sync

```
Session ID → Identifies the user (enforces one like per user)
Real-time  → Broadcasts changes (syncs all clients)
```

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

### Future Improvements

If user authentication is added later:
1. Migrate from session-based to user-based ratings
2. Add a `user_id` column to `post_ratings`
3. Link existing session ratings to user accounts if desired
4. Use Supabase Auth session tokens instead of custom session IDs
