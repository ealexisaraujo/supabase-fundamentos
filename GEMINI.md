# Project Context: Suplatzigram

## Project Overview
Suplatzigram is an Instagram-inspired web application built as the frontend for the **Platzi Supabase Course**. It leverages **Next.js** for the frontend and **Supabase** for backend services including authentication, database, and storage. The application features a social feed where users can view posts, like content, and manage profiles.

### Tech Stack
*   **Frontend Framework:** Next.js 16.1.1 (App Router, React 19.2.0)
*   **Language:** TypeScript 5.x
*   **Styling:** Tailwind CSS v4
*   **Backend:** Supabase (PostgreSQL, Storage, Real-time, Auth)
*   **State Management:** TanStack Query (client-side caching)
*   **Icons:** Custom SVG icons in `app/components/icons/`

## Key Directories & Files

### `app/` - Main Application Source
*   `page.tsx` - Home page Server Component (fetches cached posts)
*   `rank/page.tsx` - Ranking page Server Component (fetches cached ranked posts)
*   `post/page.tsx` - Create new post page
*   `profile/[username]/` - Dynamic user profile pages
*   `auth/` - Login and register pages
*   `layout.tsx` - Root layout with Providers, ThemeProvider, BottomNav

### `app/providers/` - React Context Providers
*   `AuthProvider.tsx` - Centralized auth state with single `onAuthStateChange` listener
*   `QueryProvider.tsx` - TanStack Query configuration (60s stale time, 5min GC)
*   `index.tsx` - Combined Providers export

### `app/utils/` - Supabase Clients & Utilities
*   `client.ts` - Browser Supabase client (`createBrowserClient`)
*   `supabase/server.ts` - Server-side Supabase client for SSR
*   `cached-posts.ts` - Server-side cached post fetchers (60s/5min cache)
*   `cached-profiles.ts` - Server-side cached profile fetcher (3min cache)
*   `posts.ts`, `ratings.ts`, `comments.ts` - Data fetching utilities

### `app/components/` - Reusable UI Components
*   `HomeFeed.tsx` - Home feed client component with infinite scroll
*   `RankGrid.tsx` - Ranked posts grid with real-time updates
*   `PostCard.tsx`, `PostModal.tsx` - Post display components
*   `ProfileEditForm.tsx` - Profile editing form
*   `Button.tsx`, `ThemeToggle.tsx` - UI primitives

### Root Files
*   `middleware.ts` - Auth session refresh on every request
*   `next.config.ts` - Next.js configuration with image domains

## Caching Architecture

### Two-Layer Strategy

**Server-Side (unstable_cache):**
| Cache | Duration | Tags |
|-------|----------|------|
| Home posts | 60 seconds | `posts`, `home-posts` |
| Ranked posts | 5 minutes | `posts`, `ranked-posts` |
| Profiles | 3 minutes | `profiles`, `profile-{username}` |

**Client-Side (TanStack Query):**
| Data | Stale Time | Strategy |
|------|------------|----------|
| Liked status | 60 seconds | useQuery with caching |
| Auth state | Event-driven | AuthProvider listener |

### Provider Structure
```tsx
// app/layout.tsx
<Providers>          {/* QueryProvider + AuthProvider */}
  <ThemeProvider>
    {children}
  </ThemeProvider>
</Providers>
```

## Building and Running

### Prerequisites
*   Node.js v20+
*   npm

### Environment Variables
Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_USE_MOCKS=true|false  # Optional: toggle mock data
```

### Scripts
*   `npm run dev` - Development server (http://localhost:3000)
*   `npm run build` - Production build
*   `npm run start` - Start production server
*   `npm run lint` - ESLint
*   `npm run test` - Vitest tests

## Development Conventions

### Code Style
*   **Typography:** Uses `Geist` and `Geist_Mono` fonts
*   **Styling:** Utility-first CSS with Tailwind v4
*   **Components:** Functional components with TypeScript interfaces
*   **Data Fetching:**
    - Server Components use `unstable_cache` for initial data
    - Client Components use TanStack Query for liked status
    - Auth state via `useAuth()` hook from AuthProvider

### Key Hooks
*   `useAuth()` - Access auth state (user, isLoading, signOut)
*   `useQuery()` - TanStack Query for cached data fetching

### Data Model
*   `posts_new` - Posts with id, user, image_url, caption, likes, created_at
*   `post_ratings` - Like tracking with post_id, session_id
*   `profiles` - User profiles with id, username, full_name, avatar_url, bio, website
*   `comments` - Post comments
