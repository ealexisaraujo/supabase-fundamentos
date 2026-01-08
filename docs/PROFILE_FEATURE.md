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
app/profile/
├── page.tsx                    → /profile (entry point with auth check)
├── create/
│   └── page.tsx               → /profile/create (new profile form)
└── [username]/
    ├── page.tsx               → /profile/:username (server component)
    └── ProfileClientPage.tsx  → Client component for interactivity
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

- Avatar upload with preview
- Form validation
- Error message display
- Loading states

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

### Profile View/Edit Flow

```
/profile/{username}
        ↓
Server Component fetches profile
        ↓
ProfileClientPage renders
        ↓
Check: Is current user the owner?
        ↓
   Yes → Show "Editar Perfil" button
   No → View-only mode
        ↓
User clicks "Editar Perfil"
        ↓
ProfileEditForm renders
        ↓
User updates fields → Save
        ↓
Supabase upsert → Success
        ↓
Return to view mode with updated data
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

### 4. Input Validation

- Username: Required, unique constraint at database level
- Website: URL format validation
- Avatar: File type and size restrictions

## Migration

### Applying the Migration

```bash
# Local Supabase
supabase db push

# Or run migration directly
supabase migration up
```

### Migration File

`supabase/migrations/20260108000000_create_profiles_table.sql`

## Testing

### Manual Testing Checklist

- [ ] Navigate to `/profile` when logged out → redirects to login
- [ ] Navigate to `/profile` when logged in without profile → redirects to create
- [ ] Create profile with all fields → success
- [ ] Create profile with duplicate username → error message
- [ ] View own profile → shows Edit button
- [ ] View other user's profile → no Edit button
- [ ] Edit profile → changes persist
- [ ] Upload avatar → preview shows, saves correctly

## Future Enhancements

1. **Profile Posts Grid**: Display user's posts on their profile
2. **Follower/Following System**: Social connections
3. **Profile Stats**: Post count, likes received, etc.
4. **Profile Verification**: Verified badge for certain users
5. **Privacy Settings**: Control profile visibility
6. **Account Deletion**: Self-service account removal
7. **Username Change History**: Track username changes
8. **Profile Themes**: Customizable profile appearance
