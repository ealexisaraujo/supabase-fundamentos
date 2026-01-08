# Profile Feature Documentation

## Overview

The profile feature allows users to create and manage their personal profiles in the Suplatzigram application. Users can set their username, full name, bio, website, and upload a profile avatar. The feature integrates with Supabase Auth for user identification and Supabase Storage for avatar uploads.

## Architecture

### Database Schema

The `profiles` table is defined in `supabase/migrations/20260108000000_create_profiles_table.sql`:

```sql
CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username text UNIQUE NOT NULL,
    full_name text,
    avatar_url text,
    website text,
    bio text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
```

#### Column Descriptions

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key, references `auth.users(id)` |
| `username` | text | Unique username for the profile (required) |
| `full_name` | text | User's display name |
| `avatar_url` | text | URL to the user's avatar image |
| `website` | text | User's personal website URL |
| `bio` | text | Short biography or description |
| `created_at` | timestamp | When the profile was created |
| `updated_at` | timestamp | When the profile was last updated |

#### Row Level Security (RLS) Policies

| Policy | Operation | Description |
|--------|-----------|-------------|
| Allow public read | SELECT | Anyone can view profiles |
| Allow users to create own profile | INSERT | Authenticated users can create their own profile |
| Allow users to update own profile | UPDATE | Users can only update their own profile |

### Folder Structure

```
app/
├── profile/
│   ├── page.tsx                    → /profile (entry point with auth check)
│   ├── create/
│   │   └── page.tsx               → /profile/create (new profile form)
│   └── [username]/
│       ├── page.tsx               → /profile/:username (server component with caching)
│       └── ProfileClientPage.tsx  → Client component for interactivity
├── actions/
│   ├── check-username.ts          → Server Action for username validation
│   └── revalidate-profiles.ts     → Server Action for profile cache invalidation
├── hooks/
│   └── useUsernameValidation.ts   → Client hook for debounced validation
└── utils/
    ├── username-validation.ts     → Username format rules and utilities
    └── cached-profiles.ts         → Cached profile fetching utilities
```

#### Route Explanations

| Route | File | Purpose |
|-------|------|---------|
| `/profile` | `page.tsx` | Auth gateway - redirects to user's profile or create page |
| `/profile/create` | `create/page.tsx` | Profile creation form for new users |
| `/profile/:username` | `[username]/page.tsx` | Dynamic route to view any user's profile |

#### Why Dynamic Routes `[username]`?

The `[username]` folder uses Next.js dynamic routing. The brackets indicate a route parameter:
- `/profile/alexisaraujo` → `params.username = "alexisaraujo"`
- `/profile/john` → `params.username = "john"`

This allows a single page component to handle all user profiles.

### Components

#### ProfileClientPage

Located in `app/profile/[username]/ProfileClientPage.tsx`:

```tsx
<ProfileClientPage initialProfile={profile} />
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `initialProfile` | Profile | Yes | Profile data fetched from server |

**Features:**

- View mode with profile information display
- Edit mode toggle for profile owners
- Avatar display with fallback icon
- Avatar hover overlay with "Editar foto" for owners
- Website link with external redirect

#### ProfileEditForm

Located in `app/components/ProfileEditForm.tsx`:

```tsx
<ProfileEditForm
  initialProfile={profile}
  onSuccess={(updated) => handleUpdate(updated)}
  isCreating={false}
/>
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `initialProfile` | Profile | No | Existing profile data for editing |
| `onSuccess` | function | No | Callback after successful save |
| `isCreating` | boolean | No | Whether creating a new profile |

**Features:**

- Avatar upload with preview and hover overlay
- Real-time username validation with visual feedback
- Form validation with error messages
- Loading states
- Debounced server-side username availability check

#### Button Component

Located in `app/components/Button.tsx`:

A reusable button component created to ensure design consistency across the application.

**Variants:**

| Variant | Use Case | Style |
|---------|----------|-------|
| `primary` | Main actions (Submit, Edit) | Teal/pink gradient |
| `secondary` | Secondary actions | Border outline |
| `ghost` | Subtle actions | Transparent |
| `accent` | Navigation (Back buttons) | Green gradient |

**Sizes:**

| Size | Padding | Use Case |
|------|---------|----------|
| `sm` | `px-4 py-2` | Compact buttons |
| `md` | `px-6 py-2.5` | Default |
| `lg` | `px-6 py-3` | Form submit buttons |

**Usage:**

```tsx
import { Button } from "@/app/components/Button";

// As a button
<Button variant="primary" size="lg" onClick={handleClick}>
  Submit
</Button>

// As a link
<Button variant="accent" size="sm" href="/" leftIcon={<BackIcon />}>
  Volver
</Button>
```

### Supabase Integration

#### Client-Side Client

Located in `app/utils/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

Uses `@supabase/ssr` for proper cookie handling in browser context.

#### Server-Side Client

Located in `app/utils/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) { /* ... */ }
    }
  })
}
```

Used in Server Components for authenticated data fetching.

#### Middleware

Located in `middleware.ts`:

The middleware ensures Supabase auth sessions are refreshed on every request and cookies are properly synchronized between client and server.

```typescript
export async function middleware(request: NextRequest) {
  // Creates Supabase client with cookie handling
  const supabase = createServerClient(url, key, { cookies: { ... } })

  // Refreshes auth session and updates cookies
  await supabase.auth.getUser()

  return response
}
```

**Why it's needed:**
- Server components need fresh auth tokens from cookies
- Supabase auth tokens expire and need automatic refresh
- RLS policies depend on valid auth sessions (`auth.uid()`)

### Storage Integration

Avatars are stored in the `images_platzi` bucket:

```typescript
const filePath = `avatars/${userId}-${Date.now()}.${fileExt}`;

await supabase.storage
  .from("images_platzi")
  .upload(filePath, avatarFile, {
    cacheControl: "3600",
    upsert: true,
  });
```

### Caching Architecture

The profile feature uses Next.js 16's `unstable_cache` API to reduce Supabase database hits while maintaining fresh data.

#### Cache Configuration

| Page | Cache Duration | Tags | Rationale |
|------|----------------|------|-----------|
| `/profile/[username]` | 180 seconds (3 min) | `profiles`, `profile-{username}` | Profiles change less frequently than posts |

#### Hybrid Server + Client Component Pattern

```
┌─────────────────────────────────────────────────────────────┐
│ User Request: /profile/alexis                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Server Component (page.tsx)                                 │
│   └── getCachedProfile('alexis') ───► unstable_cache        │
│           ├── Cache HIT → Return cached profile (instant!)  │
│           └── Cache MISS → Fetch from Supabase → Cache      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Client Component (ProfileClientPage.tsx)                    │
│   ├── Receives cached profile as props                      │
│   ├── Checks isOwner (client-side auth)                     │
│   ├── Handles edit mode toggle                              │
│   └── Manages profile updates                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (on profile update)
┌─────────────────────────────────────────────────────────────┐
│ Server Action (revalidateProfileCache)                      │
│   ├── revalidateTag('profile-{username}') → Data Cache      │
│   └── revalidatePath('/profile/{username}') → Router Cache  │
└─────────────────────────────────────────────────────────────┘
```

#### Why `unstable_cache` for Profiles?

1. **Works with Supabase client**: Unlike `fetch` caching, `unstable_cache` wraps any async function
2. **Tag-based invalidation**: Supports targeted cache busting via `revalidateTag()`
3. **Public read access**: Profiles have RLS public read, so no auth cookies needed in cached function

#### Cache Limitations

`unstable_cache` cannot use `cookies()` inside the cached function. Solution:

```typescript
// Use standalone Supabase client (no cookies) for cached functions
function getSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}
```

This works because profiles have public read access via RLS.

#### What's Cached vs Client-Side

| Data | Location | Reason |
|------|----------|--------|
| Profile data (username, bio, etc.) | Server Cache | Public data, same for all users |
| `isOwner` status | Client-side | Requires auth session from cookies |
| Edit mode state | Client-side | UI interaction state |

#### Files

| File | Purpose |
|------|---------|
| `app/utils/cached-profiles.ts` | `getCachedProfile()`, cache tags, standalone Supabase client |
| `app/actions/revalidate-profiles.ts` | Server Actions for cache invalidation |

#### Cache Invalidation

```typescript
// After profile update
await revalidateProfileCache(username);

// After username change
await revalidateUsernameChange(oldUsername, newUsername);
```

#### Performance Impact

```
Before (No Cache):
- Every profile visit = 1 Supabase query
- 1000 visits/hour = 1000 queries/hour

After (With Cache):
- Cache HIT: 0 queries
- Cache MISS: 1 query (cached for 180 seconds)
- 1000 visits/hour with 180s cache ≈ 20 queries/hour (98% reduction!)
```

#### Navigation Flow

```
Home → Profile → Rank → Back to Home
  ↓       ↓        ↓         ↓
Cache   Cache    Cache     Cache
 HIT     HIT      HIT       HIT
(60s)  (180s)   (300s)     (60s)

= Smooth, fast navigation with minimal DB hits
```

## Username Validation System

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Client (Browser)                            │
├─────────────────────────────────────────────────────────────────┤
│  ProfileEditForm.tsx                                            │
│  └── useUsernameValidation hook                                 │
│      ├── Phase 1: Instant format validation (client-side)       │
│      └── Phase 2: Debounced availability check (server-side)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 500ms debounce
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Server Action                               │
├─────────────────────────────────────────────────────────────────┤
│  checkUsernameAvailable()                                       │
│  ├── Authentication check                                       │
│  ├── Rate limiting (10 req/min per user)                        │
│  ├── Input validation                                           │
│  ├── Database query (excludes own username)                     │
│  └── Timing attack prevention (min 100ms response)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Database (Supabase)                         │
├─────────────────────────────────────────────────────────────────┤
│  profiles table                                                 │
│  └── UNIQUE constraint on username (final defense)              │
└─────────────────────────────────────────────────────────────────┘
```

### Username Rules

| Rule | Value | Example |
|------|-------|---------|
| Minimum length | 3 characters | `abc` ✓ |
| Maximum length | 30 characters | - |
| Allowed characters | `a-z`, `0-9`, `.`, `_` | `john_doe.123` ✓ |
| Start/End restriction | Cannot start/end with `.` or `_` | `_john` ✗ |
| Consecutive restriction | No `..` or `__` | `john..doe` ✗ |
| Case sensitivity | Normalized to lowercase | `John` → `john` |

### Reserved Usernames

The system blocks 60+ reserved usernames including:

- **System**: `admin`, `administrator`, `root`, `system`, `support`
- **Routes**: `login`, `profile`, `settings`, `post`, `rank`
- **Attack vectors**: `null`, `undefined`, `anonymous`, `test`
- **Brand**: `supabase`, `platzi`, `suplatzigram`

### Files

| File | Purpose |
|------|---------|
| `app/utils/username-validation.ts` | Format rules, reserved list, normalization utilities |
| `app/actions/check-username.ts` | Secure Server Action with rate limiting |
| `app/hooks/useUsernameValidation.ts` | React hook for debounced validation |

### Usage

```tsx
import { useUsernameValidation } from "@/app/hooks/useUsernameValidation";

function ProfileForm() {
  const validation = useUsernameValidation(currentUsername);

  return (
    <input
      value={username}
      onChange={(e) => {
        setUsername(e.target.value);
        validation.validate(e.target.value);
      }}
      className={validation.status === "valid" ? "border-green-500" : ""}
    />
  );
}
```

## Data Flow

### Profile Creation Flow

```
User clicks "Profile" in nav
        ↓
/profile (page.tsx)
        ↓
Check: Is user authenticated?
        ↓
   No → Redirect to /auth/login
   Yes → Check: Does profile exist?
        ↓
   No → Redirect to /profile/create
   Yes → Redirect to /profile/{username}
```

### Profile View/Edit Flow (with Caching)

```
/profile/{username}
        ↓
Server Component (page.tsx)
        ↓
getCachedProfile(username)
        ↓
   ├── Cache HIT → Return cached data (< 1ms)
   └── Cache MISS → Fetch from Supabase → Cache for 180s
        ↓
ProfileClientPage renders with cached profile
        ↓
Client-side: Check isOwner (auth from cookies)
        ↓
   Yes → Show "Editar Perfil" button + avatar hover
   No → View-only mode
        ↓
User clicks "Editar Perfil" or avatar
        ↓
ProfileEditForm renders
        ↓
User updates fields → Real-time validation
        ↓
Supabase upsert → Success
        ↓
Cache invalidation:
   ├── revalidateTag('profile-{username}')
   └── revalidatePath('/profile/{username}')
        ↓
Hard navigation → Fresh profile data displayed
```

### Username Validation Flow

```
User types username
        ↓
Phase 1: Instant client-side format check
        ↓
   Invalid format → Show error immediately
   Valid format → Continue to Phase 2
        ↓
Phase 2: Debounced (500ms) server check
        ↓
Server Action: checkUsernameAvailable()
        ↓
   ├── Auth check (must be logged in)
   ├── Rate limit check (10/min)
   ├── Format validation (server-side)
   ├── Database query (exclude own username)
   └── Return result with timing padding
        ↓
   Available → Green checkmark
   Not available → Red error (generic message)
```

## Design Decisions

### 1. Profile ID = Auth User ID

The profile `id` column directly references `auth.users(id)`. This ensures:
- 1:1 relationship between auth user and profile
- Automatic cleanup when user is deleted (CASCADE)
- Simple lookups without JOINs

### 2. Username Uniqueness

Usernames are unique (`UNIQUE` constraint) to:
- Enable clean profile URLs (`/profile/username`)
- Prevent impersonation
- Support future @mentions functionality

### 3. Separate Server/Client Components

The profile page uses the Server Component + Client Component pattern:
- **Server Component** (`page.tsx`): Fetches data securely, no client bundle
- **Client Component** (`ProfileClientPage.tsx`): Handles interactivity, state

### 4. Centralized Button Component

Created a shared Button component to:
- Ensure consistent styling across all pages
- Reduce code duplication
- Make design changes in one place
- Support both `<button>` and `<Link>` behaviors

### 5. Dynamic Routes for Profiles

Using `[username]` instead of `[id]` because:
- User-friendly URLs (`/profile/alexis` vs `/profile/uuid`)
- SEO-friendly
- Shareable links

### 6. Avatar Storage Strategy

Avatars use timestamp-based filenames (`{userId}-{timestamp}.ext`) to:
- Bust browser cache on update
- Allow multiple versions
- Prevent filename collisions

### 7. Image Optimization Handling

Created `app/utils/image.ts` with `shouldSkipImageOptimization()` helper that:
- Detects local development URLs (`127.0.0.1`, `localhost`)
- Detects data URLs (base64 file previews)
- Uses `NEXT_PUBLIC_SUPABASE_URL` environment variable for reliable detection
- Returns `true` to skip Next.js Image optimization when needed

This approach is environment-aware and works in both local development and production.

### 8. Avatar Hover Feature

Profile owners see a hover overlay on their avatar with:
- Dark semi-transparent background (50% opacity)
- Camera icon
- "Editar foto" text
- Click triggers edit mode

This follows common UX patterns from Instagram, Facebook, and other social platforms.

### 9. Two-Phase Username Validation

Implemented a production-grade validation system:
- **Phase 1 (Client)**: Instant format validation for immediate feedback
- **Phase 2 (Server)**: Debounced availability check with security measures

This balances UX (fast feedback) with security (rate limiting, timing attack prevention).

### 10. Server-Side Caching with `unstable_cache`

Implemented caching for profile pages using the same pattern as home/rank pages:

- **Cache duration**: 180 seconds (profiles change less frequently than posts)
- **Standalone Supabase client**: Avoids `cookies()` limitation in `unstable_cache`
- **Tag-based invalidation**: `profile-{username}` for targeted cache busting
- **Hard navigation after updates**: Bypasses Router Cache for reliable fresh data

This reduces database load by ~98% while maintaining data freshness through proper invalidation.

### 11. Consistent Navigation Experience

All three main pages (Home, Profile, Rank) now use the same caching pattern:

| Page | Cache Duration | Pattern |
|------|----------------|---------|
| Home | 60 seconds | Server Component + `unstable_cache` |
| Profile | 180 seconds | Server Component + `unstable_cache` |
| Rank | 300 seconds | Server Component + `unstable_cache` |

This ensures smooth navigation between pages without unnecessary database hits.

## Security Considerations

### 1. Row Level Security (RLS)

All database operations go through RLS policies:
- Public read access for profiles
- Insert/Update restricted to authenticated profile owner

### 2. Auth State Verification

Both server and client verify authentication:
```typescript
// Server (page.tsx)
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/auth/login");

// Client (ProfileClientPage.tsx)
const { data: { user } } = await supabase.auth.getUser();
if (user && user.id === profile.id) setIsOwner(true);
```

### 3. Storage Bucket Policies

Avatar uploads are restricted to authenticated users with proper bucket policies.

### 4. Username Validation Security

Following OWASP guidelines, the username validation system implements:

| Security Measure | Implementation | Purpose |
|-----------------|----------------|---------|
| Generic error messages | "No disponible" instead of "exists" | Prevent enumeration attacks |
| Rate limiting | 10 requests/min per user | Prevent brute-force |
| Timing attack prevention | Min 100ms response time | Consistent timing |
| Authentication required | Only logged-in users can check | Access control |
| Reserved usernames | 60+ blocked names | Prevent abuse |
| Input sanitization | Format validation | Prevent injection |
| Database constraint | UNIQUE as final defense | Defense in depth |

**OWASP References:**
- [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Testing for Account Enumeration](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/03-Identity_Management_Testing/04-Testing_for_Account_Enumeration_and_Guessable_User_Account)

### 5. Middleware for Session Management

The middleware ensures:
- Auth sessions are refreshed on every request
- Cookies are properly synchronized
- RLS policies have valid auth context

## Migration

### Applying the Migration

```bash
# Local Supabase
supabase db push

# Or run migration directly
supabase migration up
```

### Migration Files

- `supabase/migrations/20260108000000_create_profiles_table.sql` - Initial schema
- `supabase/migrations/fix_profiles_schema` (production) - Added missing columns, fixed null usernames

## Testing

### Manual Testing Checklist

**Authentication & Navigation:**
- [ ] Navigate to `/profile` when logged out → redirects to login
- [ ] Navigate to `/profile` when logged in without profile → redirects to create

**Profile Creation:**
- [ ] Create profile with all fields → success
- [ ] Create profile with duplicate username → generic error message
- [ ] Create profile with reserved username (admin, null) → error message

**Profile View:**
- [ ] View own profile → shows Edit button and avatar hover
- [ ] View other user's profile → no Edit button, no hover
- [ ] Hover over avatar (owner) → shows "Editar foto" overlay
- [ ] Click avatar (owner) → opens edit mode

**Profile Edit:**
- [ ] Edit profile → changes persist
- [ ] Upload avatar → preview shows, saves correctly
- [ ] Change username → real-time validation feedback
- [ ] Try existing username → "No disponible" error
- [ ] Try invalid format (too short, special chars) → format error

**Caching Behavior:**
- [ ] First visit to profile → server log shows "Fetching profile for username"
- [ ] Refresh within 3 minutes → no new Supabase fetch (cache hit)
- [ ] Wait 3+ minutes and refresh → new fetch in server logs (cache expired)
- [ ] Edit profile → updated data shows immediately after save
- [ ] Change username → both old and new URLs show correct data
- [ ] Navigate Home → Profile → Rank → Home → all pages load fast (cache hits)
- [ ] Check server logs → minimal Supabase queries during navigation

**Cache Invalidation:**
- [ ] After profile update → cache is invalidated, fresh data on next visit
- [ ] After username change → old username cache invalidated
- [ ] After avatar upload → new avatar URL visible immediately

## Future Enhancements

1. **Profile Posts Grid**: Display user's posts on their profile
2. **Follower/Following System**: Social connections
3. **Profile Stats**: Post count, likes received, etc.
4. **Profile Verification**: Verified badge for certain users
5. **Privacy Settings**: Control profile visibility
6. **Account Deletion**: Self-service account removal
7. **Username Change History**: Track username changes
8. **Profile Themes**: Customizable profile appearance
9. **CAPTCHA Integration**: Additional bot protection for profile creation
10. **Redis Rate Limiting**: Replace in-memory rate limiting with Upstash Redis
