# Rank Page Modal - Technical Decisions Context

This document captures the technical decisions made for the rank page (`/rank`) modal functionality to maintain consistency with the home page and ensure proper UX.

## Overview

The rank page displays a grid of posts sorted by likes (>5 likes threshold). When clicking on a post, a modal opens showing the post details. Several features were added to match the home page behavior.

## Technical Decisions

### 1. Comments Section in Modal

**Problem**: When clicking a photo in `/rank`, the modal only showed post details (image, likes, caption) but no comments section.

**Solution**: Added `CommentsSection` component to the modal.

**File**: `app/rank/page.tsx`

```tsx
import CommentsSection from "../components/CommentsSection";

// Inside Modal component, after likes/caption section:
<CommentsSection postId={post.id} />
```

**Design Decision**: Comments start **collapsed by default** (same as home page) - users click "Show comments" to expand. This was chosen over `initiallyExpanded={true}` to match home page UX consistency.

**Related Change**: Added `initiallyExpanded` prop to `CommentsSection` component (`app/components/CommentsSection.tsx`) for flexibility, defaulting to `false`.

---

### 2. Like Button Functionality

**Problem**: The like count in the modal was static text - not clickable like on the home page.

**Solution**: Added full like/unlike toggle functionality with optimistic updates.

**Files Modified**:
- `app/rank/page.tsx` - Added like button, state management, and handlers
- `app/utils/posts.ts` - Refactored to use parameterized `getPostsWithLikeStatus()` function

**Key Implementation Details**:

1. **HeartIcon with filled state**:
```tsx
function HeartIcon({ filled }: { filled: boolean }) {
  // Returns filled red heart when liked, outline when not
}
```

2. **Session management** for tracking user likes:
```tsx
import { getSessionId } from "../utils/session";
import { togglePostLike } from "../utils/ratings";

const [sessionId, setSessionId] = useState<string>("");
```

3. **Optimistic updates** for immediate UI feedback:
```tsx
const handleLike = async (postId: string) => {
  // Prevent double-clicking
  if (isLiking.has(postId)) return;

  // Optimistic update - update UI immediately
  setPosts((prevPosts) => prevPosts.map((post) =>
    post.id === postId
      ? { ...post, isLiked: !post.isLiked, likes: post.isLiked ? post.likes - 1 : post.likes + 1 }
      : post
  ));

  // Also update selectedPost for modal
  setSelectedPost((prev) => /* similar update */);

  // Persist to database
  const result = await togglePostLike(postId, sessionId);

  // Revert if failed
  if (!result.success) { /* revert optimistic update */ }
};
```

4. **Parameterized utility function** - Uses shared `getPostsWithLikeStatus()` with options:
```tsx
// Rank page usage
const data = await getPostsWithLikeStatus(sid, {
  minLikes: 5,
  orderBy: 'likes',
  ascending: false
});
```

---

### 3. Modal Overflow Fix

**Problem**: When comments were expanded, the modal content extended beyond the viewport and went behind the bottom navigation bar.

**Solution**: Applied max-height constraints to modal and image.

**File**: `app/rank/page.tsx`

**Changes**:

1. **Modal container** - Added height constraint and scroll:
```tsx
<div className="relative bg-card-bg rounded-xl overflow-hidden max-w-lg w-full shadow-xl max-h-[80vh] overflow-y-auto">
```

2. **Image container** - Limited image height to leave room for content:
```tsx
<div className="relative w-full aspect-square max-h-[40vh]">
```

**Rationale**:
- `max-h-[80vh]` ensures modal never exceeds 80% of viewport height
- `overflow-y-auto` enables scrolling when content exceeds max height
- `max-h-[40vh]` on image ensures it doesn't dominate the modal, leaving space for likes, caption, and comments

---

## Component Architecture

```
RankPage
├── Header ("Ranking")
├── Grid of posts (clickable buttons)
│   └── Each shows image with like count overlay on hover
├── Modal (when post selected)
│   ├── Close button (absolute positioned)
│   ├── User header (avatar, username, timestamp)
│   ├── Post image (constrained to max-h-[40vh])
│   └── Content section
│       ├── Like button + count
│       ├── Caption
│       └── CommentsSection (collapsed by default)
└── BottomNav (separate component)
```

---

## State Management

```tsx
// Main state in RankPage
const [selectedPost, setSelectedPost] = useState<Post | null>(null);
const [posts, setPosts] = useState<Post[]>([]);
const [sessionId, setSessionId] = useState<string>("");
const [isLiking, setIsLiking] = useState<Set<string>>(new Set());
```

**Real-time updates**: The page subscribes to `subscribeToPostLikes()` to update like counts in real-time across all clients. Both `posts` array and `selectedPost` are updated when real-time events arrive.

---

## Consistency with Home Page

| Feature | Home Page | Rank Page Modal |
|---------|-----------|-----------------|
| Like button | Clickable with toggle | Clickable with toggle |
| Like state | Shows filled/outline heart | Shows filled/outline heart |
| Comments | Collapsed by default | Collapsed by default |
| Comment input | Available when expanded | Available when expanded |
| Optimistic updates | Yes | Yes |
| Real-time sync | Yes | Yes |

---

## Files Changed Summary

1. `app/rank/page.tsx` - Modal with comments, like button, overflow fixes
2. `app/components/CommentsSection.tsx` - Added `initiallyExpanded` prop
3. `app/utils/posts.ts` - Refactored to parameterized `getPostsWithLikeStatus()` function

---

## Refactoring Decision: Parameterized Function

### Problem

Initially created a separate `getRankedPostsWithLikeStatus()` function that duplicated 90% of the logic from `getPostsWithLikeStatus()`.

### Why This Was Bad

| Issue | Impact |
|-------|--------|
| Code duplication | Maintenance burden - bugs must be fixed in multiple places |
| Violates DRY | Same logic repeated with minor variations |
| Not scalable | New filters would require new functions |
| Client-side alternative wasteful | Fetching all posts to filter client-side wastes bandwidth |

### Solution: Parameterized Function

Refactored to a single function with optional parameters:

```tsx
export interface GetPostsOptions {
  minLikes?: number;           // Filter by minimum likes
  orderBy?: 'created_at' | 'likes';  // Sort field
  ascending?: boolean;         // Sort direction
}

export async function getPostsWithLikeStatus(
  sessionId: string,
  options: GetPostsOptions = {}
): Promise<Post[]>
```

### Usage Examples

```tsx
// Home page - all posts, newest first (default behavior)
const posts = await getPostsWithLikeStatus(sessionId);

// Rank page - posts with >5 likes, sorted by likes
const rankedPosts = await getPostsWithLikeStatus(sessionId, {
  minLikes: 5,
  orderBy: 'likes',
  ascending: false
});

// Future: User profile - posts by user, oldest first
const userPosts = await getPostsWithLikeStatus(sessionId, {
  orderBy: 'created_at',
  ascending: true
});
```

### Benefits

1. **Single source of truth** - One function to maintain
2. **Database-level filtering** - Efficient queries, less bandwidth
3. **Backward compatible** - Existing callers work unchanged (defaults)
4. **Extensible** - Easy to add new filter options
5. **Type-safe** - TypeScript interface documents available options

---

## Claude Code Hook: Build Verification

A pre-push hook was added to prevent TypeScript errors from reaching Vercel.

**Location**: `.claude/settings.local.json`

**Configuration**:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash(git push*)",
        "hooks": [
          {
            "type": "command",
            "command": "npm run build ... || exit 2",
            "timeout": 120000
          }
        ]
      }
    ]
  }
}
```

**How it works**:
- **Event**: `PreToolUse` - Runs before the Bash tool executes
- **Matcher**: `Bash(git push*)` - Only triggers on git push commands
- **Action**: Runs `npm run build` to verify TypeScript compilation
- **Exit codes**:
  - `0` = Build passed, push proceeds
  - `2` = Build failed, push is **blocked**

**Why this matters**: Catches TypeScript errors like `Type 'string | number' is not assignable to type 'string'` before they fail in Vercel's build step.

---

## Testing Checklist

- [ ] Click post in rank grid opens modal
- [ ] Modal shows user info, image, likes, caption
- [ ] Like button toggles (filled/outline heart)
- [ ] Like count updates immediately (optimistic)
- [ ] Like persists after page refresh
- [ ] "Show comments" expands comment section
- [ ] Comments display with avatar, username, text, timestamp
- [ ] Comment input field is visible and functional
- [ ] Modal doesn't overflow behind navigation bar
- [ ] Modal is scrollable if content exceeds viewport
- [ ] Close button dismisses modal
- [ ] Clicking outside modal dismisses it
