# Ralph Prompt: Authenticated Post Creation & User Profile Wall

## Feature Overview

Implement an authenticated posting system where:
1. Only logged-in users can create posts
2. Posts are associated with the creator's profile (1 profile → N posts)
3. User's posts appear on their profile page ("wall")
4. Posts automatically appear in the public feed with author attribution
5. Anonymous users can view but NOT create posts

## Current State Analysis

### Current Behavior (Anonymous)
- Anyone can create posts via `/post` page
- Posts are created with anonymous `session_id` (localStorage)
- No user attribution on posts
- Profile pages exist but don't show user's own posts

### Target Behavior (Authenticated)
```
┌─────────────────────────────────────────────────────────────┐
│ Anonymous User                                              │
│   ├── Can view home feed ✓                                  │
│   ├── Can view profiles ✓                                   │
│   ├── Can like posts ✓ (via session_id)                    │
│   └── Cannot create posts ✗ → Redirect to login            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Authenticated User                                          │
│   ├── Can view home feed ✓                                  │
│   ├── Can view profiles ✓                                   │
│   ├── Can like posts ✓                                      │
│   ├── Can create posts ✓ → Associated with their profile   │
│   └── Can see their posts on their profile wall ✓          │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema Analysis

### Required: Review and Update Schema

Before implementing, analyze the current Supabase schema:

```sql
-- Expected current tables (verify in supabase/migrations/):
-- posts_new: id, image_url, caption, created_at, likes, session_id
-- profiles: id, username, avatar_url, full_name, bio
-- post_ratings: id, post_id, session_id, rating
-- comments: id, post_id, user_id, content, created_at

-- Required changes for user-post relationship:
ALTER TABLE posts_new 
  ADD COLUMN user_id UUID REFERENCES auth.users(id),
  ADD COLUMN profile_id UUID REFERENCES profiles(id);

-- Create index for efficient profile queries
CREATE INDEX idx_posts_profile_id ON posts_new(profile_id);
CREATE INDEX idx_posts_user_id ON posts_new(user_id);
```

### Data Model Relationships

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
                                          │  session_id  │
                                          └──────────────┘
```

## Implementation Phases

### Phase 1: Database Schema Migration

Create migration file `supabase/migrations/YYYYMMDD_add_user_to_posts.sql`:

```sql
-- Add user relationship columns to posts_new
ALTER TABLE posts_new 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_posts_new_user_id ON posts_new(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_new_profile_id ON posts_new(profile_id);

-- RLS Policy: Allow authenticated users to create posts
CREATE POLICY "Users can create their own posts" ON posts_new
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Anyone can view posts
CREATE POLICY "Anyone can view posts" ON posts_new
  FOR SELECT TO anon, authenticated
  USING (true);

-- RLS Policy: Users can update their own posts
CREATE POLICY "Users can update own posts" ON posts_new
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own posts
CREATE POLICY "Users can delete own posts" ON posts_new
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
```

### Phase 2: Update TypeScript Types

Modify `app/types/` to include user relationships:

```typescript
// app/types/post.ts
export interface Post {
  id: string;
  image_url: string;
  caption: string;
  likes: number;
  created_at: string;
  session_id?: string;  // Legacy anonymous posts
  user_id?: string;     // NEW: Auth user reference
  profile_id?: string;  // NEW: Profile reference
  isLiked?: boolean;
  
  // Joined data (optional, populated on fetch)
  profile?: {
    username: string;
    avatar_url: string;
    full_name?: string;
  };
}

// app/types/profile.ts
export interface Profile {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string;
  full_name?: string;
  bio?: string;
  posts?: Post[];      // NEW: User's posts
  post_count?: number; // NEW: Total posts
}
```

### Phase 3: Protected Route for Post Creation

Create authentication guard for `/post` page:

```typescript
// app/post/page.tsx - Convert to protected route
import { redirect } from "next/navigation";
import { createServerClient } from "@/app/utils/supabase/server";

export default async function PostPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    // Redirect anonymous users to login
    redirect("/login?redirect=/post&message=Please login to create a post");
  }
  
  // Fetch user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .eq("user_id", user.id)
    .single();
  
  if (!profile) {
    // User exists but no profile - redirect to profile setup
    redirect("/profile/setup");
  }
  
  return <PostForm user={user} profile={profile} />;
}
```

### Phase 4: Update Post Creation Logic

Modify `app/utils/posts.ts` (or wherever post creation lives):

```typescript
// app/utils/posts.ts
export async function createPost({
  imageFile,
  caption,
  userId,
  profileId,
}: {
  imageFile: File;
  caption: string;
  userId: string;
  profileId: string;
}) {
  const supabase = getSupabaseClient();
  
  // 1. Upload image to storage
  const fileName = `${userId}/${Date.now()}-${imageFile.name}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("posts")
    .upload(fileName, imageFile);
  
  if (uploadError) throw uploadError;
  
  // 2. Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from("posts")
    .getPublicUrl(fileName);
  
  // 3. Insert post with user association
  const { data: post, error: insertError } = await supabase
    .from("posts_new")
    .insert({
      image_url: publicUrl,
      caption,
      user_id: userId,
      profile_id: profileId,
      likes: 0,
    })
    .select()
    .single();
  
  if (insertError) throw insertError;
  
  return post;
}
```

### Phase 5: Create PostForm Client Component

```typescript
// app/post/PostForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { createPost } from "@/app/utils/posts";
import { revalidatePostsCache } from "@/app/actions/revalidate-posts";

interface PostFormProps {
  user: User;
  profile: {
    id: string;
    username: string;
    avatar_url: string;
  };
}

export default function PostForm({ user, profile }: PostFormProps) {
  const router = useRouter();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile) return;
    
    setIsSubmitting(true);
    
    try {
      await createPost({
        imageFile,
        caption,
        userId: user.id,
        profileId: profile.id,
      });
      
      // Invalidate caches
      await revalidatePostsCache();
      
      // Hard navigation to ensure fresh data
      window.location.href = "/";
    } catch (error) {
      console.error("Error creating post:", error);
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto p-4">
      {/* Creator info */}
      <div className="flex items-center gap-3 mb-4">
        <img 
          src={profile.avatar_url} 
          alt={profile.username}
          className="w-10 h-10 rounded-full"
        />
        <span className="font-medium">@{profile.username}</span>
      </div>
      
      {/* Image upload */}
      <div className="mb-4">
        {preview ? (
          <img src={preview} alt="Preview" className="w-full rounded-lg" />
        ) : (
          <label className="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer">
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleImageChange}
              className="hidden"
            />
            <span>Tap to select an image</span>
          </label>
        )}
      </div>
      
      {/* Caption */}
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Write a caption..."
        className="w-full p-3 border rounded-lg mb-4"
        rows={3}
      />
      
      {/* Submit */}
      <button
        type="submit"
        disabled={!imageFile || isSubmitting}
        className="w-full py-3 bg-blue-500 text-white rounded-lg disabled:opacity-50"
      >
        {isSubmitting ? "Posting..." : "Share Post"}
      </button>
    </form>
  );
}
```

### Phase 6: Update Home Feed to Show Author

Modify post fetching to include profile data:

```typescript
// app/utils/cached-posts.ts
async function fetchHomePosts(page: number, limit: number): Promise<Post[]> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from("posts_new")
    .select(`
      *,
      profile:profiles!posts_new_profile_id_fkey (
        username,
        avatar_url,
        full_name
      )
    `)
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);
  
  if (error) {
    console.error("[CachedPosts] Error fetching posts:", error);
    return [];
  }
  
  return data || [];
}
```

### Phase 7: Update HomeFeed UI to Display Author

```typescript
// app/components/HomeFeed.tsx - Add author display
function PostCard({ post }: { post: Post }) {
  return (
    <article className="border-b pb-4">
      {/* Author header */}
      {post.profile ? (
        <Link 
          href={`/profile/${post.profile.username}`}
          className="flex items-center gap-2 p-3"
        >
          <img 
            src={post.profile.avatar_url} 
            alt={post.profile.username}
            className="w-8 h-8 rounded-full"
          />
          <span className="font-medium">@{post.profile.username}</span>
        </Link>
      ) : (
        <div className="flex items-center gap-2 p-3">
          <div className="w-8 h-8 rounded-full bg-gray-300" />
          <span className="text-gray-500">Anonymous</span>
        </div>
      )}
      
      {/* Post image */}
      <img src={post.image_url} alt={post.caption} className="w-full" />
      
      {/* Actions & caption */}
      {/* ... existing like button, caption, etc. */}
    </article>
  );
}
```

### Phase 8: Profile Wall - Show User's Posts

Update profile page to fetch and display user's posts:

```typescript
// app/profile/[username]/page.tsx
export default async function ProfilePage({ 
  params 
}: { 
  params: { username: string } 
}) {
  const { username } = params;
  
  // Fetch profile with posts
  const profile = await getCachedProfileWithPosts(username);
  
  if (!profile) {
    notFound();
  }
  
  return <ProfileClientPage profile={profile} />;
}

// app/utils/cached-profiles.ts
export async function getCachedProfileWithPosts(username: string) {
  const cacheKey = `profile:${username}:with-posts`;
  
  const cachedFetch = unstable_cache(
    async () => {
      const supabase = getSupabaseClient();
      
      // Fetch profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .single();
      
      if (!profile) return null;
      
      // Fetch user's posts
      const { data: posts } = await supabase
        .from("posts_new")
        .select("*")
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(30);
      
      return {
        ...profile,
        posts: posts || [],
        post_count: posts?.length || 0,
      };
    },
    [cacheKey],
    { revalidate: 180, tags: ['profiles', `profile-${username}`] }
  );
  
  return cachedFetch();
}
```

### Phase 9: Profile Wall UI Component

```typescript
// app/profile/[username]/ProfileWall.tsx
"use client";

import { Post } from "@/app/types/post";
import Link from "next/link";

interface ProfileWallProps {
  posts: Post[];
  username: string;
  isOwner: boolean;
}

export default function ProfileWall({ posts, username, isOwner }: ProfileWallProps) {
  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">
          {isOwner 
            ? "You haven't posted anything yet" 
            : `@${username} hasn't posted anything yet`
          }
        </p>
        {isOwner && (
          <Link 
            href="/post" 
            className="inline-block px-6 py-2 bg-blue-500 text-white rounded-lg"
          >
            Create your first post
          </Link>
        )}
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-3 gap-1">
      {posts.map((post) => (
        <Link 
          key={post.id} 
          href={`/p/${post.id}`}
          className="aspect-square relative group"
        >
          <img 
            src={post.image_url} 
            alt={post.caption}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <span className="text-white">❤️ {post.likes}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
```

### Phase 10: Login/Signup Flow Integration

Create or update auth pages:

```typescript
// app/login/page.tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/app/utils/client";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const message = searchParams.get("message");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      setError(error.message);
      setIsLoading(false);
    } else {
      window.location.href = redirectTo;
    }
  };
  
  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Login</h1>
      
      {message && (
        <div className="bg-blue-50 text-blue-700 p-3 rounded mb-4">
          {message}
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <form onSubmit={handleLogin} className="space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full p-3 border rounded"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full p-3 border rounded"
          required
        />
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {isLoading ? "Logging in..." : "Login"}
        </button>
      </form>
      
      <p className="text-center mt-4">
        Don't have an account?{" "}
        <Link href="/signup" className="text-blue-500">Sign up</Link>
      </p>
    </div>
  );
}
```

### Phase 11: Update Navigation for Auth State

```typescript
// app/components/BottomNav.tsx
"use client";

import { useAuth } from "@/app/providers/AuthProvider";
import Link from "next/link";

export default function BottomNav() {
  const { user, profile, isLoading } = useAuth();
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t">
      <div className="flex justify-around py-2">
        <Link href="/" className="p-2">🏠</Link>
        <Link href="/rank" className="p-2">🏆</Link>
        
        {/* Create post - only for authenticated */}
        {user ? (
          <Link href="/post" className="p-2">➕</Link>
        ) : (
          <Link href="/login?redirect=/post" className="p-2 opacity-50">➕</Link>
        )}
        
        {/* Profile - show login or user profile */}
        {isLoading ? (
          <div className="p-2">⏳</div>
        ) : user && profile ? (
          <Link href={`/profile/${profile.username}`} className="p-2">
            <img 
              src={profile.avatar_url} 
              alt="Profile"
              className="w-6 h-6 rounded-full"
            />
          </Link>
        ) : (
          <Link href="/login" className="p-2">👤</Link>
        )}
      </div>
    </nav>
  );
}
```

### Phase 12: Cache Invalidation Updates

Update revalidation to include profile caches:

```typescript
// app/actions/revalidate-posts.ts
"use server";

import { revalidateTag, revalidatePath } from "next/cache";

export async function revalidatePostsCache() {
  revalidateTag("posts", "default");
  revalidateTag("home-posts", "default");
  revalidateTag("ranked-posts", "default");
  
  revalidatePath("/");
  revalidatePath("/rank");
}

export async function revalidateProfileCache(username: string) {
  revalidateTag(`profile-${username}`, "default");
  revalidateTag("profiles", "default");
  
  revalidatePath(`/profile/${username}`);
}

export async function revalidateAllCaches(username?: string) {
  await revalidatePostsCache();
  if (username) {
    await revalidateProfileCache(username);
  }
}
```

## File Structure

```
app/
├── login/
│   └── page.tsx              # Login page
├── signup/
│   └── page.tsx              # Signup page
├── post/
│   ├── page.tsx              # Protected route (server)
│   └── PostForm.tsx          # Post creation form (client)
├── profile/
│   ├── [username]/
│   │   ├── page.tsx          # Profile page (server)
│   │   ├── ProfileClientPage.tsx
│   │   └── ProfileWall.tsx   # Grid of user's posts
│   └── setup/
│       └── page.tsx          # Profile setup for new users
├── components/
│   ├── BottomNav.tsx         # Updated with auth state
│   └── HomeFeed.tsx          # Updated with author display
├── providers/
│   └── AuthProvider.tsx      # Add profile to context
├── utils/
│   ├── posts.ts              # Updated createPost function
│   ├── cached-posts.ts       # Updated with profile joins
│   └── cached-profiles.ts    # Updated with posts
├── actions/
│   └── revalidate-posts.ts   # Updated cache invalidation
├── types/
│   ├── post.ts               # Updated Post type
│   └── profile.ts            # Updated Profile type
supabase/
└── migrations/
    └── YYYYMMDD_add_user_to_posts.sql  # Schema migration
```

## Testing Checklist

### Unit Tests
- [ ] All existing tests pass: `npm run test:run`
- [ ] Add test for createPost with user association
- [ ] Add test for profile page with posts

### Manual Testing

#### Anonymous User Flow
- [ ] Can view home feed
- [ ] Can view any profile
- [ ] Can like posts
- [ ] Cannot access /post (redirected to login)
- [ ] Sees login prompt in navigation

#### Authenticated User Flow
- [ ] Can log in via /login
- [ ] Can access /post page
- [ ] Creating post shows their username/avatar
- [ ] Post appears in home feed with author info
- [ ] Post appears on their profile wall
- [ ] Can view their own profile
- [ ] Logging out reverts to anonymous behavior

#### Edge Cases
- [ ] User without profile → redirected to /profile/setup
- [ ] Legacy anonymous posts display correctly (no author)
- [ ] Mixed feed (anonymous + authenticated posts) works

## Success Criteria

1. **Authentication Gate**: Only logged-in users can create posts
2. **User Attribution**: Posts show creator's username and avatar
3. **Profile Wall**: User's posts appear on their profile page
4. **Data Integrity**: Correct 1:N relationship in database
5. **Backward Compatibility**: Legacy anonymous posts still work
6. **Cache Coherence**: New posts appear immediately after creation
7. **Tests Pass**: All existing + new tests pass

## Completion Promise

When all phases complete and verified:
- Database migration applied
- All 12 phases implemented
- All tests pass
- Manual testing checklist complete
- Documentation updated

Output: <promise>AUTHENTICATED_POSTS_COMPLETE</promise>

---

## Ralph Loop Command

```bash
/ralph-loop "Implement authenticated post creation with user profile association for Suplatzigram.

CONTEXT:
- Read AUTHENTICATED_POSTS_RALPH_PROMPT.md for detailed requirements
- Read CLAUDE.md for project architecture
- Review supabase/migrations/ for current schema
- Review app/utils/ for current implementation

PHASES (implement in order):
1. Create database migration for user_id/profile_id columns
2. Update TypeScript types for Post and Profile
3. Protect /post route - require authentication
4. Update post creation to associate with user
5. Create PostForm client component with user info
6. Update fetchHomePosts to join profile data
7. Update HomeFeed to display post authors
8. Update profile page to fetch user's posts
9. Create ProfileWall component for post grid
10. Create/update login and signup pages
11. Update BottomNav for auth state
12. Update cache invalidation for profiles

VERIFICATION after each phase:
- npm run test:run (must pass)
- npm run dev (must start)
- Test the specific feature manually

CRITICAL RULES:
- Preserve backward compatibility with anonymous posts
- Use existing AuthProvider for auth state
- Follow existing code patterns and structure
- Update CLAUDE.md with new architecture

If tests fail, fix before proceeding.
If blocked after 15 iterations, document status and continue.

Output <promise>AUTHENTICATED_POSTS_COMPLETE</promise> when done." --completion-promise "AUTHENTICATED_POSTS_COMPLETE" --max-iterations 60
```

## Escape Hatch

If after 40 iterations the implementation is stuck:
1. Document what was accomplished
2. List specific blockers  
3. Commit working partial implementation
4. Output: <promise>AUTHENTICATED_POSTS_PARTIAL</promise>
