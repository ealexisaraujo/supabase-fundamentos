# Client-Side Caching Architecture

## Overview

This document describes the implementation of client-side caching using TanStack Query (React Query) and a centralized AuthProvider to optimize data fetching and reduce redundant API calls during navigation.

## Problem Statement

### Before This Implementation

The application had a hybrid caching architecture:

1. **Server-Side (Working)**: `unstable_cache` caches initial data for 60s-5min
2. **Client-Side (Problem)**: No caching - every component mount triggered:
   - Fresh Supabase API calls for liked status
   - Auth checks (`getUser()`) on every navigation
   - Duplicate requests when navigating between pages

### Symptoms Observed

- Multiple duplicate requests to `posts_new`, `post_ratings`, `auth/v1/user`
- Brief loading states during navigation even for cached data
- Unnecessary Supabase API usage

## Solution Architecture

### Industry Standard: TanStack Query + AuthContext

```
┌─────────────────────────────────────────────────────┐
│ Server Component (unstable_cache)                   │
│ └─ Caches initial posts/profile data (60s-5min)    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Providers (app/providers.tsx)                       │
│ ├─ QueryClientProvider (TanStack Query cache)      │
│ └─ AuthProvider (Single auth listener)             │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Client Components                                   │
│ ├─ useQuery() → Cached, deduplicated requests      │
│ └─ useAuth() → Shared auth state, no fetch         │
└─────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. TanStack Query Configuration

**File**: `app/providers/QueryProvider.tsx`

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,      // Data fresh for 60 seconds
      gcTime: 5 * 60 * 1000,     // Keep in cache for 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

### 2. Auth Provider

**File**: `app/providers/AuthProvider.tsx`

- Single `onAuthStateChange` listener at app root
- Shares auth state via React Context
- No more `getUser()` calls in every component

### 3. Query Keys Structure

```typescript
// Consistent query keys for cache management
export const queryKeys = {
  posts: {
    all: ['posts'] as const,
    liked: (sessionId: string) => ['posts', 'liked', sessionId] as const,
    home: (sessionId: string) => ['posts', 'home', sessionId] as const,
    ranked: (sessionId: string) => ['posts', 'ranked', sessionId] as const,
  },
};
```

## Cache Behavior

| Data Type | Stale Time | GC Time | Refetch Strategy |
|-----------|------------|---------|------------------|
| Liked Status | 60s | 5min | On mount if stale |
| Posts | 60s | 5min | Background refetch |
| Auth State | N/A | N/A | Event-driven (listener) |

## Benefits

1. **Request Deduplication**: Same query = 1 request, even if called multiple times
2. **Instant Navigation**: Cached data shown immediately
3. **Background Updates**: Stale data updated without blocking UI
4. **Reduced API Calls**: Significantly fewer Supabase requests
5. **Better UX**: No loading flashes during navigation

## Migration Notes

### Components Updated

- `HomeFeed.tsx` - Uses `useQuery` for liked status, `useAuth` for user
- `RankGrid.tsx` - Uses `useQuery` for liked status
- `ProfileClientPage.tsx` - Uses `useAuth` for owner check

### Preserved Functionality

- Server-side `unstable_cache` still works for initial data
- Real-time subscriptions for likes still work
- Optimistic updates for like/unlike still work

## Testing Checklist

- [x] Navigate Home → Profile → Home - verify no duplicate requests
- [x] Navigate Rank → Profile → Rank - verify cached data shown instantly
- [x] Login/Logout - verify auth state updates across all components
- [x] Like a post - verify optimistic update and cache invalidation
- [x] Hard refresh - verify server cache + client cache work together

### Testing Results (2026-01-07)

**Navigation Caching Test**:
1. First navigation to Home: `[HomeFeed] Fetching liked status (cached query)` - fetched from Supabase
2. Navigate to Rank, then back to Home: No fetch message - TanStack Query served cached data instantly
3. Auth state persists across navigations - no "Login" button flash

**Console Output Pattern**:
```
// First visit to Home
[HomeFeed] Received 5 initial posts from server cache
[HomeFeed] Fetching liked status (cached query)
[HomeFeed] Liked status merged with initial posts

// Second visit to Home (after navigating away and back)
[HomeFeed] Received 5 initial posts from server cache
// No "Fetching liked status" message - cache hit!
```

## Rollback Plan

If issues arise, revert to previous implementation by:
1. Removing QueryProvider and AuthProvider from layout
2. Restoring original useEffect-based fetching in components
3. The server-side caching will continue to work independently

## References

- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [Supabase Auth Helpers](https://supabase.com/docs/guides/auth)
- [Next.js App Router Data Fetching](https://nextjs.org/docs/app/building-your-application/data-fetching)

---

**Status**: ✅ Implementation Complete

## Changelog

| Date | Change | Status |
|------|--------|--------|
| 2026-01-07 | Initial documentation created | Checkpoint 1 |
| 2026-01-07 | Implementation started | In Progress |
| 2026-01-07 | TanStack Query + AuthProvider implemented | Complete |
| 2026-01-07 | All components refactored (HomeFeed, RankGrid, ProfileClientPage) | Complete |
| 2026-01-07 | Testing verified - caching working as expected | ✅ Verified |

## Files Created/Modified

### New Files
- `app/providers/AuthProvider.tsx` - Centralized auth state management
- `app/providers/QueryProvider.tsx` - TanStack Query configuration
- `app/providers/index.tsx` - Combined providers export

### Modified Files
- `app/layout.tsx` - Added Providers wrapper
- `app/components/HomeFeed.tsx` - Refactored to use useQuery + useAuth
- `app/components/RankGrid.tsx` - Refactored to use useQuery
- `app/profile/[username]/ProfileClientPage.tsx` - Refactored to use useAuth
