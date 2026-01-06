# Quickstart: Instagram-Style UI Refinement

**Feature**: 001-tailwind-ui-refactor
**Date**: 2026-01-06

## Prerequisites

- Node.js 18+ installed
- Git repository cloned
- On branch `001-tailwind-ui-refactor`

## Setup

```bash
# Install dependencies (already done if project was set up)
npm install

# Start development server
npm run dev
```

The app will be available at http://localhost:3000

## Development Workflow

### 1. Creating Icon Components

Create new files in `app/components/icons/`:

```tsx
// app/components/icons/HeartIcon.tsx
export function HeartIcon({ filled = false, className = "w-7 h-7" }: {
  filled?: boolean;
  className?: string;
}) {
  if (filled) {
    return (
      <svg className={`${className} text-red-500`} viewBox="0 0 24 24" fill="currentColor">
        {/* filled path */}
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {/* outline path */}
    </svg>
  );
}
```

### 2. Creating PostCard Component

Extract from `app/page.tsx`:

```tsx
// app/components/PostCard.tsx
import type { Post } from '../mocks/posts';
import { HeartIcon } from './icons/HeartIcon';
import CommentsSection from './CommentsSection';

interface PostCardProps {
  post: Post;
  onLike: (id: number | string) => void;
  showComments?: boolean;
}

export function PostCard({ post, onLike, showComments = true }: PostCardProps) {
  // Component implementation
}
```

### 3. Running Tests

```bash
# Run all tests
npm run test

# Run specific test file
npx vitest run tests/components/PostCard.test.tsx

# Run with coverage
npm run test:coverage
```

### 4. Building for Production

```bash
# Build the application
npm run build

# Start production server
npm run start
```

## File Changes Summary

### New Files
- `app/components/icons/HeartIcon.tsx`
- `app/components/icons/CommentIcon.tsx`
- `app/components/icons/ShareIcon.tsx`
- `app/components/icons/HomeIcon.tsx`
- `app/components/icons/PlusIcon.tsx`
- `app/components/icons/RankIcon.tsx`
- `app/components/icons/CloseIcon.tsx`
- `app/components/icons/index.ts` (barrel export)
- `app/components/PostCard.tsx`
- `app/components/PostModal.tsx`

### Modified Files
- `app/page.tsx` - Use PostCard component
- `app/rank/page.tsx` - Use PostModal component
- `app/components/BottomNav.tsx` - Use icon components
- `app/components/Skeletons.tsx` - Enhance animations
- `app/globals.css` - Any additional custom styles

### Test Files
- `tests/components/PostCard.test.tsx`
- `tests/components/PostModal.test.tsx`
- `tests/components/icons.test.tsx`

## Design Tokens Reference

Use these CSS variables (already defined in `globals.css`):

```css
/* Colors */
var(--background)    /* Page background */
var(--foreground)    /* Text color */
var(--primary)       /* Brand primary */
var(--accent)        /* Action accent (green) */
var(--card-bg)       /* Card/surface background */
var(--border)        /* Border color */

/* In Tailwind classes */
bg-background
text-foreground
text-primary
bg-accent
bg-card-bg
border-border
```

## Common Tailwind Patterns

```tsx
// Card container
<div className="bg-card-bg border border-border rounded-xl overflow-hidden shadow-sm">

// Sticky header
<header className="sticky top-0 z-50 bg-card-bg border-b border-border">

// Avatar with ring
<div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-primary">

// Gradient button
<button className="bg-gradient-to-r from-primary to-accent text-white rounded-full">

// Hover overlay
<div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">

// Loading skeleton
<div className="bg-border/50 animate-pulse rounded">
```

## Verification Checklist

After implementation, verify:

- [ ] Home page shows posts with correct styling
- [ ] Ranking page shows 3-column grid
- [ ] Create post page has dashed upload area
- [ ] Bottom navigation highlights active page
- [ ] Like button toggles filled/outline state
- [ ] Modal opens and closes correctly
- [ ] Dark mode works (check with system preference)
- [ ] All tests pass
- [ ] Build completes without errors
