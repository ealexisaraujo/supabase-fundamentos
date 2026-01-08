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
- **Caching:** Upstash Redis (distributed) + Next.js unstable_cache (per-instance)
- **Styling:** Tailwind CSS v4
- **State Management:** TanStack Query (client-side caching)
- **Testing:** Vitest + React Testing Library

### App Structure (`app/`)
- `page.tsx` - Home feed Server Component (fetches cached posts with profile joins)
- `post/page.tsx` - Protected post creation (Server Component with auth check)
- `post/PostForm.tsx` - Post creation form (Client Component)
- `rank/page.tsx` - Ranking page Server Component (fetches cached ranked posts)
- `auth/login/` - Login page
- `auth/register/` - Registration page
- `profile/[username]/` - User profile pages with posts wall
- `profile/[username]/ProfileWall.tsx` - Grid display of user's posts
- `profile/create/` - Profile setup for new users
- `actions/` - Server Actions for cache revalidation
- `components/` - Reusable UI components (BottomNav, CommentsSection, HomeFeed, RankGrid, PostCard)
- `providers/` - React Context providers (AuthProvider, QueryProvider)
- `utils/` - Supabase client and data fetching utilities
- `utils/redis/` - Upstash Redis client and cache utilities
- `utils/supabase/` - Server-side Supabase client utilities
- `mocks/` - Mock data for testing and fallback
- `types/` - TypeScript type definitions

### Supabase Integration
- **Client (browser):** `app/utils/client.ts` - Single Supabase client instance for client components
- **Client (server):** `app/utils/supabase/server.ts` - SSR-compatible Supabase client
- **Middleware:** `middleware.ts` - Auth session refresh on every request
- **Tables:** `posts_new` (with profile_id FK), `post_ratings`, `comments`, `profiles`
- **Real-time:** Subscriptions for live like counts (`ratings.ts`)
- **Storage:** Image uploads for posts and avatars

### Authenticated Post Creation
Posts can be created by authenticated users and are associated with their profile:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  auth.users  │────<│   profiles   │────<│  posts_new   │
│              │  1:1│              │  1:N│              │
│  id (PK)     │     │  id (PK)     │     │  id (PK)     │
│  email       │     │  user_id(FK) │     │  profile_id  │
│              │     │  username    │     │  user_id(FK) │
│              │     │  avatar_url  │     │  image_url   │
│              │     │  bio         │     │  caption     │
└──────────────┘     └──────────────┘     │  likes       │
                                          │  created_at  │
                                          └──────────────┘
```

**User Flow:**
- Anonymous users: Can view posts/profiles, can like (via session_id), cannot create posts
- Authenticated users: Full access, posts are associated with their profile
- Profile wall: User's posts appear on their profile page (`/profile/[username]`)

**Protected Routes:**
- `/post` - Requires authentication, redirects to login if anonymous

### Caching Architecture (Three-Layer Strategy)

The app uses a three-layer caching strategy:

```
Request → Redis (distributed) → unstable_cache (per-instance) → Supabase (database)
```

**1. Redis (Upstash) - Distributed Cache:**
- `utils/redis/client.ts` - Upstash Redis client configuration
- `utils/redis/cache.ts` - Cache utilities (get, set, invalidate by tag)
- Survives deployments, shared across serverless functions
- Sub-millisecond response times

**2. Server-Side Caching** (unstable_cache):
- `utils/cached-posts.ts` - Home/Ranked posts (60s/5min cache)
- `utils/cached-profiles.ts` - Profile pages (3min cache)
- Per-instance fallback when Redis unavailable
- Invalidated via Server Actions with `revalidateTag()`

**3. Client-Side Caching** (TanStack Query + AuthProvider):
- `providers/QueryProvider.tsx` - Configures TanStack Query (60s stale time)
- `providers/AuthProvider.tsx` - Single `onAuthStateChange` listener
- Prevents duplicate API calls during navigation

| Layer | Data | Duration | Invalidation |
|-------|------|----------|--------------|
| Redis | Posts | 60s-5min | `invalidateCacheByTag()` |
| Redis | Profiles | 3min | `invalidateCacheByTag()` |
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

# Upstash Redis (optional - falls back to unstable_cache if not configured)
UPSTASH_REDIS_REST_URL=<your-upstash-url>
UPSTASH_REDIS_REST_TOKEN=<your-upstash-token>
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
- @upstash/redis for distributed Redis caching
- @tanstack/react-query (TanStack Query) for client-side caching
- Supabase (PostgreSQL) for posts, ratings, comments, profiles
- Supabase Storage for images and avatars
- Next.js `unstable_cache` for server-side data caching

## Recent Changes
- 005-authenticated-posts: Implemented authenticated post creation with user profile association. Posts are now linked to profiles via `profile_id` FK. Protected `/post` route requires auth. Profile wall displays user's posts. Home feed shows post authors with profile links. BottomNav is auth-aware. Added `PostForm.tsx`, `ProfileWall.tsx`. Updated PostCard to show author info from joined profile data.
- 004-redis-caching: Implemented Upstash Redis caching layer as distributed cache. Added `utils/redis/` with client and cache utilities. Integrated Redis with cached-posts.ts and cached-profiles.ts. Updated cache invalidation in server actions. Graceful degradation when Redis not configured.
- 003-client-caching: Implemented TanStack Query and AuthProvider for client-side caching. Reduced duplicate API calls during navigation. Added `app/providers/` with QueryProvider, AuthProvider. Refactored HomeFeed, RankGrid, ProfileClientPage to use `useQuery` and `useAuth` hooks.
- 002-caching-optimization: Implemented hybrid Server Component + Client Component architecture with `unstable_cache` for reducing Supabase hits. Added `@supabase/ssr` package, server-side Supabase client, cached data fetchers, and cache revalidation via Server Actions.
- 001-tailwind-ui-refactor: Added TypeScript 5.x with React 19 / Next.js 16 + Next.js 16.1.1, React 19.2.0, Tailwind CSS v4, @supabase/supabase-js
