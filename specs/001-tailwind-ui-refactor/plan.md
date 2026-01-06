# Implementation Plan: Instagram-Style UI Refinement

**Branch**: `001-tailwind-ui-refactor` | **Date**: 2026-01-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-tailwind-ui-refactor/spec.md`

## Summary

Refine the existing Suplatzigram application UI to match Instagram-style design mockups using the already-configured Tailwind CSS v4. This involves enhancing existing components (post cards, navigation, ranking grid, create post form) with improved styling, maintaining dark mode support, and ensuring consistent visual feedback for user interactions.

## Technical Context

**Language/Version**: TypeScript 5.x with React 19 / Next.js 16
**Primary Dependencies**: Next.js 16.1.1, React 19.2.0, Tailwind CSS v4, @supabase/supabase-js
**Storage**: Supabase (PostgreSQL) for posts, ratings, comments; Supabase Storage for images
**Testing**: Vitest + React Testing Library
**Target Platform**: Web (mobile-first responsive design)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Page load < 2s, navigation < 300ms perceived, 60fps scroll
**Constraints**: Mobile-first design, max-width container, dark mode support required
**Scale/Scope**: 3 main pages (Home, Rank, Create Post), ~10 components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution template is not yet configured for this project. Proceeding with standard best practices:

| Gate | Status | Notes |
|------|--------|-------|
| Existing patterns preserved | PASS | Enhancing existing components, not replacing |
| No unnecessary complexity | PASS | Pure UI refinement, no new data models |
| Testing maintained | PASS | Existing Vitest tests will be updated |
| Mobile-first approach | PASS | Design mockups are mobile-first |

## Project Structure

### Documentation (this feature)

```text
specs/001-tailwind-ui-refactor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal - UI-only feature)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - no API changes)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
app/
├── components/
│   ├── BottomNav.tsx       # Navigation bar (enhance styling)
│   ├── CommentsSection.tsx # Comments display (enhance styling)
│   ├── Skeletons.tsx       # Loading states (enhance styling)
│   ├── PostCard.tsx        # NEW: Extract from page.tsx
│   ├── PostModal.tsx       # NEW: Extract from rank/page.tsx
│   └── icons/              # NEW: Shared icon components
│       ├── HeartIcon.tsx
│       ├── CommentIcon.tsx
│       ├── ShareIcon.tsx
│       ├── HomeIcon.tsx
│       ├── PlusIcon.tsx
│       └── RankIcon.tsx
├── page.tsx                # Home feed (refactor to use PostCard)
├── post/page.tsx           # Create post form (enhance styling)
├── rank/page.tsx           # Ranking grid (refactor to use PostModal)
├── globals.css             # Tailwind imports and CSS variables
├── layout.tsx              # Root layout with BottomNav
├── utils/                  # Unchanged - data utilities
├── mocks/                  # Unchanged - mock data
└── types/                  # Unchanged - type definitions

tests/
├── components/             # Component unit tests
├── pages/                  # Page integration tests
└── setup.tsx               # Test setup
```

**Structure Decision**: Web application with Next.js App Router. Extracting reusable components (PostCard, PostModal, icons) from page files to improve maintainability and reduce code duplication.

## Complexity Tracking

No violations - this is a UI refinement that stays within existing patterns.
