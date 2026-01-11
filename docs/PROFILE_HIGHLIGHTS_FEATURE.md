# Profile Highlights Feature Documentation

## Overview

The Profile Highlights feature allows users to pin up to 3 of their own posts as "highlights" on their profile page. These highlighted posts appear in a dedicated section above the regular posts grid, giving users control over which content is featured prominently on their profile.

## Architecture

### Database Schema

The `profile_highlights` table is defined in `supabase/migrations/20260111202611_create_profile_highlights.sql`:

```sql
CREATE TABLE public.profile_highlights (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    post_id uuid NOT NULL REFERENCES public.posts_new(id) ON DELETE CASCADE,
    position smallint NOT NULL CHECK (position >= 1 AND position <= 3),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profile_highlights_profile_position_unique UNIQUE (profile_id, position),
    CONSTRAINT profile_highlights_profile_post_unique UNIQUE (profile_id, post_id)
);
```

#### Column Descriptions

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Unique identifier for the highlight (auto-generated) |
| `profile_id` | uuid | Reference to the profile (required, cascading delete) |
| `post_id` | uuid | Reference to the highlighted post (required, cascading delete) |
| `position` | smallint | Display position (1, 2, or 3) |
| `created_at` | timestamp | When the highlight was created |
| `updated_at` | timestamp | When the highlight was last updated |

#### Constraints

| Constraint | Purpose |
|------------|---------|
| `profile_highlights_profile_position_unique` | Ensures no duplicate positions per profile |
| `profile_highlights_profile_post_unique` | Ensures each post can only be highlighted once per profile |
| `position CHECK` | Validates position is between 1 and 3 |

#### Row Level Security (RLS) Policies

| Policy | Operation | Description |
|--------|-----------|-------------|
| Allow public read | SELECT | Anyone can view highlights |
| Allow owner insert | INSERT | Only profile owner can add highlights |
| Allow owner update | UPDATE | Only profile owner can modify highlights |
| Allow owner delete | DELETE | Only profile owner can remove highlights |

### RPC Functions

Located in `supabase/migrations/20260111203805_add_highlight_rpc_functions.sql` and `supabase/migrations/20260111210000_fix_unpin_reorder.sql`:

#### `pin_post_to_highlights(profile_id, post_id, position)`

Adds a post to highlights at a specific position.

**Validations:**
- Position must be between 1 and 3
- Post must exist and belong to the profile owner
- Post cannot already be highlighted
- Maximum 3 highlights per profile

**Returns:**
```json
{ "success": true, "highlightId": "uuid", "position": 1 }
// or
{ "success": false, "error": "Error message" }
```

#### `unpin_post_from_highlights(profile_id, post_id)`

Removes a post from highlights and reorders remaining highlights.

**Behavior:**
- Deletes the highlight
- Shifts all highlights with higher positions down by 1 (no gaps)
- Example: Remove position 2 from [1, 2, 3] → Results in [1, 2]

**Returns:**
```json
{ "success": true, "removedPosition": 2 }
// or
{ "success": false, "error": "Highlight not found" }
```

#### `reorder_highlight(profile_id, post_id, new_position)`

Moves a highlight to a new position by swapping with the existing highlight.

**Behavior:**
- If target position is occupied, swaps positions
- Uses temporary position (0) to avoid constraint violations during swap

**Returns:**
```json
{ "success": true, "newPosition": 2, "swappedWith": "other-post-uuid" }
```

### Folder Structure

```
app/
├── hooks/
│   └── useHighlights.ts              → Hook for managing highlights state
├── components/
│   └── ProfileHighlights.tsx         → Highlights display section
├── types/
│   └── highlight.ts                  → TypeScript interfaces
├── utils/
│   └── highlights.ts                 → Utility functions and RPC calls
└── profile/
    └── [username]/
        ├── ProfileClientPage.tsx     → Integration point
        └── ProfileWall.tsx           → Pin button integration
```

### TypeScript Interfaces

Located in `app/types/highlight.ts`:

```typescript
export type HighlightPosition = 1 | 2 | 3;

export interface ProfileHighlight {
  id: string;
  profile_id: string;
  post_id: string;
  position: HighlightPosition;
  created_at: string;
  updated_at: string;
  post?: HighlightPost;
}

export interface PinHighlightResult {
  success: boolean;
  highlightId?: string;
  position?: number;
  error?: string;
}

export interface UnpinHighlightResult {
  success: boolean;
  removedPosition?: number;
  error?: string;
}

export interface ReorderHighlightResult {
  success: boolean;
  newPosition?: number;
  swappedWith?: string;
  error?: string;
}
```

### Service Layer

Located in `app/utils/highlights.ts`:

#### Available Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `getProfileHighlights` | `profileId: string` | `Promise<ProfileHighlight[]>` | Fetch all highlights for a profile |
| `pinPostToHighlights` | `profileId, postId, position, username` | `Promise<PinHighlightResult>` | Pin a post to highlights |
| `unpinPostFromHighlights` | `profileId, postId, username` | `Promise<UnpinHighlightResult>` | Unpin a post from highlights |
| `reorderHighlight` | `profileId, postId, newPosition, username` | `Promise<ReorderHighlightResult>` | Reorder a highlight |
| `subscribeToProfileHighlights` | `profileId, onUpdate` | `() => void` | Real-time subscription |

### Hook

Located in `app/hooks/useHighlights.ts`:

```typescript
const {
  highlights,           // Current highlights array
  highlightedPostIds,   // Set<string> of highlighted post IDs
  highlightCount,       // Current count (0-3)
  canAddMore,           // Boolean: highlightCount < 3
  isProcessing,         // Boolean: operation in progress
  error,                // String | null: auto-clears after 5s
  pinPost,              // (postId, position) => Promise<boolean>
  unpinPost,            // (postId) => Promise<boolean>
  reorderPost,          // (postId, newPosition) => Promise<boolean>
  getPostPosition,      // (postId) => HighlightPosition | undefined
  getAvailablePositions // () => HighlightPosition[]
} = useHighlights({
  profileId,
  username,
  initialHighlights,
  isOwner
});
```

### UI Components

#### ProfileHighlights

Located in `app/components/ProfileHighlights.tsx`:

```tsx
<ProfileHighlights
  highlights={highlights}
  isOwner={isOwner}
  onUnpin={handleUnpin}
  onPostClick={handlePostClick}
/>
```

**Features:**
- Grid display of up to 3 highlighted posts
- Position badges (1, 2, 3)
- Unpin button on hover (owner only)
- Click to view post modal

## Data Flow

### Pin Post Flow (FIFO/Append)

```
User clicks Pin button on a post in ProfileWall
        ↓
handlePinClick() in ProfileWall
        ↓
getAvailablePositions() → Returns [count + 1]
        ↓
If empty → canAddMore is false, show error
If available → Call pinPost(postId, position)
        ↓
pinPostToHighlights() → RPC call to database
        ↓
   Success → Refetch highlights from server
             → Update local state
             → Invalidate Redis cache
             → Revalidate Next.js cache
        ↓
   Failure → Show error message (auto-clears in 5s)
```

### Unpin Post Flow (with Reorder)

```
User clicks Unpin button on a highlighted post
        ↓
unpinPost(postId) in useHighlights
        ↓
Optimistic update → Remove from local state
        ↓
unpinPostFromHighlights() → RPC call
        ↓
Database function:
  1. DELETE highlight at position X
  2. UPDATE remaining: position = position - 1
     WHERE position > X
        ↓
Success → Refetch highlights (get reordered positions)
Failure → Rollback optimistic update
```

### Position Assignment Strategy

The feature uses an **append-only** strategy:

```
Initial state: []
Add post A → Position 1 (count 0 + 1)

State: [A:1]
Add post B → Position 2 (count 1 + 1)

State: [A:1, B:2]
Remove A → B shifts from 2 to 1

State: [B:1]
Add post C → Position 2 (count 1 + 1)

Final: [B:1, C:2]
```

This ensures:
- No position gaps (always contiguous: 1, 2, 3)
- Predictable ordering
- Simplified UX (no position selection modal)

## Design Decisions

### 1. Append-Only Position Assignment

**Decision:** New highlights are always added at `count + 1`, never filling gaps.

**Rationale:**
- Simplified UX: No modal needed to select position
- Predictable behavior: User always knows where new highlight will appear
- Consistent ordering: Positions are always contiguous (1, 2 or 1, 2, 3)

### 2. Automatic Reorder on Unpin

**Decision:** When a highlight is removed, all highlights with higher positions shift down.

**Implementation:** Database-level via `unpin_post_from_highlights` RPC function.

**Example:**
```
Before: [A:1, B:2, C:3]
Remove B (position 2)
After: [A:1, C:2]  ← C shifted from 3 to 2
```

**Rationale:**
- No gaps in position sequence
- Maintains visual consistency in the 3-slot grid
- Positions always represent actual display order

### 3. No Position Selection Modal

**Decision:** Removed the `PositionSelector` component that let users choose positions 1, 2, or 3.

**Rationale:**
- User feedback: "over experience" / too complex
- Simpler FIFO behavior is more intuitive
- Reduces cognitive load
- Users can reorder via drag-and-drop (future enhancement)

### 4. RPC Functions for Atomic Operations

**Decision:** Use PostgreSQL RPC functions instead of direct table operations.

**Rationale:**
- Atomic transactions (reorder + delete in one call)
- Server-side validation (ownership, limits)
- Consistent business logic regardless of client
- Security through `SECURITY DEFINER`

### 5. Ownership Validation at Database Level

**Decision:** RPC functions verify post ownership before allowing pin operations.

**Implementation:**
```sql
SELECT profile_id INTO v_post_owner
FROM posts_new WHERE id = p_post_id;

IF v_post_owner != p_profile_id THEN
    RETURN json_build_object('success', FALSE, 'error', 'You can only pin your own posts');
END IF;
```

**Rationale:**
- Defense in depth (UI + RLS + RPC validation)
- Prevents API manipulation attacks
- Clear error messages

### 6. Real-time Subscriptions (Owner Only)

**Decision:** Real-time updates only for profile owners.

**Rationale:**
- Reduces unnecessary subscriptions
- Owner needs instant feedback when adding/removing highlights
- Other users see eventual consistency (acceptable for this feature)

### 7. Optimistic Updates with Server Refetch

**Decision:** Update local state optimistically, then refetch from server.

**Rationale:**
- Instant UI feedback
- Server is source of truth for positions
- Handles edge cases (concurrent modifications)
- Rollback on failure

### 8. Maximum 3 Highlights

**Decision:** Hard limit of 3 highlights per profile.

**Rationale:**
- Curated selection (quality over quantity)
- Consistent grid layout
- Matches Instagram's "pinned posts" pattern
- Database constraint enforces limit

### 9. Cache Invalidation on Pin/Unpin

**Decision:** Invalidate both Redis and Next.js caches after highlight operations.

**Implementation:**
```typescript
await invalidateCacheByTag(cacheTags.PROFILES);
revalidateTag(PROFILE_CACHE_TAGS.profileTag(username));
```

**Rationale:**
- Profile page caches include highlights
- Other users should see updated highlights
- Consistent with existing cache patterns

## Security Considerations

### 1. Row Level Security

```sql
-- Only owner can modify highlights
CREATE POLICY "highlight_insert_policy" ON profile_highlights
    FOR INSERT TO authenticated
    WITH CHECK (profile_id = auth.uid());
```

### 2. Ownership Validation

RPC functions verify:
- Post belongs to the profile owner
- Only profile owner can modify highlights

### 3. Input Validation

- Position validated (1-3) at database level
- UUIDs validated by PostgreSQL types
- Duplicate prevention via UNIQUE constraints

### 4. SECURITY DEFINER

RPC functions use `SECURITY DEFINER` to run with elevated permissions while including explicit ownership checks.

## Caching

### Cache Invalidation Strategy

| Event | Actions |
|-------|---------|
| Pin highlight | Invalidate Redis profiles cache, revalidateTag |
| Unpin highlight | Invalidate Redis profiles cache, revalidateTag |
| Reorder highlight | Invalidate Redis profiles cache, revalidateTag |

### Redis Key Patterns

Highlights are cached as part of profile data:
- `profiles:{profileId}` includes `highlights[]` array

## Testing

### Test File

Located in `tests/highlights.test.ts`:

#### Test Suites

| Suite | Tests | Description |
|-------|-------|-------------|
| Highlight Types | 3 | Type structure validation |
| Highlight Result Types | 5 | Result object validation |
| Highlight Business Rules | 4 | Max limit, duplicates, positions |
| Available Positions Logic (Append) | 6 | FIFO append behavior |
| Highlight Reorder on Unpin | 2 | Position shifting logic |
| Highlight Position Swapping | 1 | Position swap behavior |
| Highlight Ordering | 1 | Sort by position |
| Error Messages | 5 | Error message validation |

### Running Tests

```bash
# Run all tests
npm run test:run

# Run highlights tests specifically
npx vitest run tests/highlights.test.ts

# Run with coverage
npm run test:coverage
```

## Migration

### Applying Migrations

```bash
# Reset database with new migrations
supabase db reset

# Or apply migrations incrementally
supabase migration up
```

### Migration Files

| File | Purpose |
|------|---------|
| `20260111202611_create_profile_highlights.sql` | Create table and RLS policies |
| `20260111203805_add_highlight_rpc_functions.sql` | Add RPC functions |
| `20260111210000_fix_unpin_reorder.sql` | Add position reordering on unpin |

## Usage Examples

### Pinning a Post

```typescript
import { useHighlights } from "@/app/hooks/useHighlights";

function ProfileWall({ posts, isOwner }) {
  const { canAddMore, getAvailablePositions, pinPost } = useHighlights({
    profileId,
    username,
    isOwner
  });

  const handlePin = async (postId: string) => {
    if (!canAddMore) return;

    const positions = getAvailablePositions();
    if (positions.length === 0) return;

    const success = await pinPost(postId, positions[0]);
    if (success) {
      // Highlight added
    }
  };
}
```

### Unpinning a Post

```typescript
const { unpinPost } = useHighlights({ ... });

const handleUnpin = async (postId: string) => {
  const success = await unpinPost(postId);
  // Positions automatically reorder
};
```

### Checking if Post is Highlighted

```typescript
const { highlightedPostIds } = useHighlights({ ... });

const isHighlighted = highlightedPostIds.has(postId);
```

## Future Enhancements

1. **Drag-and-Drop Reorder**: Allow users to reorder highlights by dragging
2. **Highlight Analytics**: Track views/engagement on highlighted posts
3. **Auto-Highlight Suggestions**: Suggest posts to highlight based on engagement
4. **Highlight Expiration**: Optional auto-unpin after a set time
5. **Highlight Templates**: Pre-defined layouts (e.g., featured, best of, recent)
