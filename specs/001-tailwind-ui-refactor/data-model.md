# Data Model: Instagram-Style UI Refinement

**Feature**: 001-tailwind-ui-refactor
**Date**: 2026-01-06

## Overview

This is a UI-only feature. No changes to the existing data model are required. This document describes the **component model** for the UI refactoring.

---

## Component Entities

### 1. Icon Components

**Entity**: `IconProps`
**Purpose**: Shared interface for all icon components

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| filled | boolean | No | Whether icon is filled (active state) |
| className | string | No | Additional Tailwind classes for size/color |

**Icon Components**:
- `HeartIcon` - Like action
- `CommentIcon` - Comment action
- `ShareIcon` - Share action (future)
- `HomeIcon` - Navigation home
- `PlusIcon` - Navigation create
- `RankIcon` - Navigation ranking
- `CloseIcon` - Modal close

---

### 2. PostCard Component

**Entity**: `PostCardProps`
**Purpose**: Display a single post in the feed

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| post | Post | Yes | Post data object |
| onLike | (id: string \| number) => void | Yes | Like handler callback |
| showComments | boolean | No | Whether to show comments section (default: true) |

**Post Type** (existing):
```typescript
interface Post {
  id: number | string;
  user_id: string | null;
  image_url: string;
  caption: string;
  likes: number;
  created_at: string;
  user?: {
    username: string;
    avatar: string;
  };
  isLiked?: boolean;
}
```

---

### 3. PostModal Component

**Entity**: `PostModalProps`
**Purpose**: Full-screen modal for post detail view

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| post | Post | Yes | Post data object |
| onClose | () => void | Yes | Close modal callback |
| onLike | (id: string) => void | Yes | Like handler callback |

**Behavior**:
- Closes on X button click
- Closes on backdrop click
- Closes on Escape key press
- Prevents body scroll when open

---

### 4. BottomNav Component (Enhanced)

**Entity**: `BottomNavProps`
**Purpose**: Fixed bottom navigation bar

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| (none) | - | - | Uses `usePathname()` internally |

**Navigation Items**:
| Item | Path | Icon (inactive) | Icon (active) |
|------|------|-----------------|---------------|
| Home | / | HomeIcon outlined | HomeIcon filled |
| Create | /post | PlusIcon (always accent) | - |
| Rank | /rank | RankIcon outlined | RankIcon filled |

---

### 5. Skeleton Components (Enhanced)

**Existing Entities**: `PostCardSkeleton`, `RankItemSkeleton`

**Enhancements**:
- Add `animate-pulse` to all skeleton elements
- Match exact dimensions of final components
- Use `bg-border/50` for skeleton backgrounds

---

## State Transitions

### Like Button State

```
┌─────────────┐     click      ┌─────────────┐
│  Unliked    │ ─────────────► │   Liked     │
│  (outline)  │                │  (filled)   │
└─────────────┘ ◄───────────── └─────────────┘
                    click
```

### Modal State

```
┌─────────────┐    tap image   ┌─────────────┐
│   Closed    │ ─────────────► │    Open     │
│             │                │             │
└─────────────┘ ◄───────────── └─────────────┘
                 X/backdrop/ESC
```

---

## Validation Rules

### PostCard
- `post.image_url` must be valid URL or show placeholder
- `post.caption` can be empty (display username only)
- `post.likes` must be >= 0

### PostModal
- Must render above all other content (z-50)
- Must prevent scroll on body when open
- Must focus trap inside modal

### BottomNav
- Must be visible on all pages
- Active state must match current route
- Create button must have distinct styling

---

## No Database Changes

This feature does not modify:
- `posts_new` table
- `post_ratings` table
- `comments` table
- Supabase Storage configuration
