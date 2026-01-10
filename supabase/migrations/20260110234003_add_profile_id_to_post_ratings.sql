-- Migration: Add profile_id to post_ratings for authenticated user likes
--
-- Problem: Likes are tied to session_id (localStorage), which is lost when
-- users clear site data or use a different browser/device.
--
-- Solution: For authenticated users, store likes with profile_id instead.
-- This ensures likes persist across sessions/devices.
--
-- Schema change:
-- - Add profile_id column (nullable, FK to profiles)
-- - Make session_id nullable (for profile-based likes)
-- - Add constraint: at least one of session_id or profile_id must be set
-- - Add unique index for profile-based likes

-- Step 1: Add profile_id column with foreign key
ALTER TABLE public.post_ratings
ADD COLUMN profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Step 2: Make session_id nullable (for authenticated likes that use profile_id)
ALTER TABLE public.post_ratings
ALTER COLUMN session_id DROP NOT NULL;

-- Step 3: Add constraint ensuring at least one identifier is present
ALTER TABLE public.post_ratings
ADD CONSTRAINT check_identity_present
CHECK (session_id IS NOT NULL OR profile_id IS NOT NULL);

-- Step 4: Create unique index for profile-based likes
-- This allows one like per profile per post (similar to session_id constraint)
CREATE UNIQUE INDEX idx_post_ratings_profile_unique
ON public.post_ratings(post_id, profile_id)
WHERE profile_id IS NOT NULL;

-- Step 5: Create index for efficient profile lookups
CREATE INDEX idx_post_ratings_profile_id
ON public.post_ratings(profile_id)
WHERE profile_id IS NOT NULL;

-- Step 6: Update RLS policy to allow profile-based operations
-- The existing permissive policy allows all operations, so we just need to
-- ensure the policy covers profile_id lookups as well (it does, since it's permissive)

-- Add comments for documentation
COMMENT ON COLUMN public.post_ratings.profile_id IS 'Profile ID for authenticated user likes. Mutually exclusive with session_id for the same like.';
COMMENT ON CONSTRAINT check_identity_present ON public.post_ratings IS 'Ensures either session_id or profile_id is set for each like';
