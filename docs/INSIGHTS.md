# Database & System Insights Report

## Issue Analysis & Resolutions

### 1. Supabase Connection Error
*   **Issue:** The application failed to connect to Supabase with an empty error object.
*   **Root Cause:** A typo in `.env` for `NEXT_PUBLIC_SUPABASE_URL` which was set to `https://http://127.0.0.1:54321`.
*   **Resolution:** Corrected the URL to `http://127.0.0.1:54321`.

### 2. Broken Images (404 Not Found)
*   **Issue:** Images in the feed and ranking were not loading.
*   **Root Cause:** Database contained placeholder URLs from `example.com` which are invalid.
*   **Resolution:** Updated `image_url` to use `picsum.photos` and configured `next.config.ts` to allow `example.com` and `images.unsplash.com`.

### 3. Missing Column Error (Rank Page)
*   **Issue:** The Rank page failed to fetch posts from the `supabase_curso` backend.
*   **Root Cause:** The `posts_new` table was missing the `"user"` (JSONB) column required by the frontend.
*   **Resolution:** Added the `"user"` column via SQL and populated it with generated user data.

### 4. Development Flexibility (Mock Toggle)
*   **Feature:** Added a global toggle to switch between Supabase and Mock data.
*   **Implementation:** 
    *   `NEXT_PUBLIC_USE_MOCKS` variable in `.env`.
    *   Centralized service in `app/utils/posts.ts`.

---

## Technical Reference

### Key SQL Commands Used

**Fixing Broken Images:**
```sql
UPDATE posts_new
SET image_url = 'https://picsum.photos/seed/' || id || '/600/600'
WHERE image_url LIKE '%example.com%';
```

**Fixing Missing User Column:**
```sql
-- Add column
ALTER TABLE posts_new ADD COLUMN IF NOT EXISTS "user" jsonb;

-- Populate with dummy user data
UPDATE posts_new 
SET "user" = jsonb_build_object(
  'username', 'user_' || substring(id::text, 1, 5), 
  'avatar', 'https://i.pravatar.cc/150?u=' || id
) 
WHERE "user" IS NULL;
```

### Inspecting Database Schema
```bash
docker exec -i supabase_db_supabase_curso psql -U postgres -c "\d posts_new"
```

### Environment Setup
| Variable | Value | Purpose |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | Local API Gateway |
| `NEXT_PUBLIC_USE_MOCKS` | `true` / `false` | Toggle data source |