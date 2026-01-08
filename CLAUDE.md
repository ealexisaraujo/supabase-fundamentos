# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Suplatzigram is an Instagram-inspired web application built for the Platzi Supabase Course. It demonstrates Supabase integration with a Next.js frontend for features like real-time updates, authentication, database operations, and storage.

## Commands

```bash
# Development
npm run dev          # Start dev server at http://localhost:3000

# Build & Production
npm run build        # Build for production
npm run start        # Start production server

# Testing
npm run test         # Run tests in watch mode
npm run test:run     # Run tests once
npm run test:coverage # Run tests with coverage

# Linting
npm run lint         # Run ESLint
```

## Architecture

### Tech Stack
- **Framework:** Next.js 16 (App Router, React 19)
- **Backend:** Supabase (database, storage, real-time)
- **Styling:** Tailwind CSS v4
- **State Management:** TanStack Query (client-side caching)
- **Testing:** Vitest + React Testing Library

### App Structure (`app/`)
- `page.tsx` - Home feed Server Component (fetches cached posts)
- `post/page.tsx` - Create new post page
- `rank/page.tsx` - Ranking page Server Component (fetches cached ranked posts)
- `profile/[username]/` - User profile pages with server-side caching
- `actions/` - Server Actions for cache revalidation
- `components/` - Reusable UI components (BottomNav, CommentsSection, HomeFeed, RankGrid)
- `providers/` - React Context providers (AuthProvider, QueryProvider)
- `utils/` - Supabase client and data fetching utilities
- `utils/supabase/` - Server-side Supabase client utilities
- `mocks/` - Mock data for testing and fallback
- `types/` - TypeScript type definitions

### Supabase Integration
- **Client (browser):** `app/utils/client.ts` - Single Supabase client instance for client components
- **Client (server):** `app/utils/supabase/server.ts` - SSR-compatible Supabase client
- **Middleware:** `middleware.ts` - Auth session refresh on every request
- **Tables:** `posts_new`, `post_ratings`, `comments`, `profiles`
- **Real-time:** Subscriptions for live like counts (`ratings.ts`)
- **Storage:** Image uploads for posts and avatars

### Caching Architecture (Hybrid Server + Client)

The app uses a two-layer caching strategy:

**1. Server-Side Caching** (unstable_cache):
- `utils/cached-posts.ts` - Home/Ranked posts (60s/5min cache)
- `utils/cached-profiles.ts` - Profile pages (3min cache)
- Invalidated via Server Actions with `revalidateTag()`

**2. Client-Side Caching** (TanStack Query + AuthProvider):
- `providers/QueryProvider.tsx` - Configures TanStack Query (60s stale time)
- `providers/AuthProvider.tsx` - Single `onAuthStateChange` listener
- Prevents duplicate API calls during navigation

| Layer | Data | Duration | Invalidation |
|-------|------|----------|--------------|
| Server | Posts | 60s-5min | `revalidateTag()` |
| Server | Profiles | 3min | `revalidateTag()` |
| Client | Liked status | 60s stale | TanStack Query |
| Client | Auth state | Event-driven | Supabase listener |

### Providers Structure
```tsx
// app/layout.tsx wraps everything with:
<Providers>          {/* QueryProvider + AuthProvider */}
  <ThemeProvider>
    {children}
  </ThemeProvider>
</Providers>
```

### Data Flow Pattern
The app uses a mock/production toggle via `NEXT_PUBLIC_USE_MOCKS` env var. Utility functions in `app/utils/` check this flag and return mock data or query Supabase.

### Session Management
- **Anonymous:** localStorage `session-id` key for tracking likes without auth
- **Authenticated:** Supabase auth with `AuthProvider` context for centralized state

## Environment Variables

Required in `.env` or `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_USE_MOCKS=true|false  # Optional: toggle mock data
```

## Supabase Local Development

Migrations are in `supabase/migrations/`. Seed data in `supabase/seed.sql`.

## Testing

Tests are in `tests/` directory. Setup file (`tests/setup.tsx`) mocks:
- `next/image` component
- Environment variables
- localStorage
- `crypto.randomUUID`

Run a single test file:
```bash
npx vitest run tests/comments.test.ts
```

## Active Technologies
- TypeScript 5.x with React 19 / Next.js 16.1.1, React 19.2.0
- Tailwind CSS v4
- @supabase/supabase-js, @supabase/ssr
- @tanstack/react-query (TanStack Query) for client-side caching
- Supabase (PostgreSQL) for posts, ratings, comments, profiles
- Supabase Storage for images and avatars
- Next.js `unstable_cache` for server-side data caching

## Recent Changes
- 003-client-caching: Implemented TanStack Query and AuthProvider for client-side caching. Reduced duplicate API calls during navigation. Added `app/providers/` with QueryProvider, AuthProvider. Refactored HomeFeed, RankGrid, ProfileClientPage to use `useQuery` and `useAuth` hooks.
- 002-caching-optimization: Implemented hybrid Server Component + Client Component architecture with `unstable_cache` for reducing Supabase hits. Added `@supabase/ssr` package, server-side Supabase client, cached data fetchers, and cache revalidation via Server Actions.
- 001-tailwind-ui-refactor: Added TypeScript 5.x with React 19 / Next.js 16 + Next.js 16.1.1, React 19.2.0, Tailwind CSS v4, @supabase/supabase-js
