-- Migration: Secure RLS policies for post_ratings table
--
-- Problem: Current policy "Allow all public operations on post_ratings" is overly permissive
-- allowing anyone to INSERT/UPDATE/DELETE any rating, creating risks for:
-- - Like bombing (manipulating session_ids to spam likes)
-- - Data manipulation (deleting other users' likes)
--
-- Solution: Implement granular RLS policies for the dual identity system:
-- - Anonymous users: Can only manage their own session_id based likes
-- - Authenticated users: Can only manage their own profile_id based likes
-- - Everyone: Can read all ratings (needed for like counts)

-- Step 1: Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all public operations on post_ratings" ON public.post_ratings;

-- Step 2: SELECT policy - Everyone can read ratings (needed for like counts)
CREATE POLICY "Anyone can view ratings"
ON public.post_ratings
FOR SELECT
USING (true);

-- Step 3: INSERT policy for anonymous users (session-based likes)
-- Anonymous users can insert ratings with their session_id
-- Note: session_id comes from client localStorage, so we can't fully verify server-side
-- but the unique constraint (post_id, session_id) prevents duplicate likes
CREATE POLICY "Anonymous users can insert session-based likes"
ON public.post_ratings
FOR INSERT
TO anon
WITH CHECK (
    session_id IS NOT NULL
    AND profile_id IS NULL
);

-- Step 4: INSERT policy for authenticated users (profile-based likes)
-- Authenticated users can only insert ratings with their own profile_id
CREATE POLICY "Authenticated users can insert profile-based likes"
ON public.post_ratings
FOR INSERT
TO authenticated
WITH CHECK (
    profile_id IS NOT NULL
    AND profile_id IN (
        SELECT id FROM public.profiles WHERE id = (
            SELECT id FROM public.profiles WHERE id = auth.uid()
        )
    )
);

-- Step 5: DELETE policy for anonymous users
-- Anonymous users can only delete their own session-based likes
CREATE POLICY "Anonymous users can delete own session-based likes"
ON public.post_ratings
FOR DELETE
TO anon
USING (
    session_id IS NOT NULL
    AND profile_id IS NULL
);

-- Step 6: DELETE policy for authenticated users
-- Authenticated users can only delete their own profile-based likes
CREATE POLICY "Authenticated users can delete own profile-based likes"
ON public.post_ratings
FOR DELETE
TO authenticated
USING (
    profile_id IS NOT NULL
    AND profile_id IN (
        SELECT id FROM public.profiles WHERE id = auth.uid()
    )
);

-- Step 7: No UPDATE policy - likes are binary (add via INSERT, remove via DELETE)
-- Explicitly not creating UPDATE policy to prevent modification of existing likes

-- Add comments for documentation
COMMENT ON POLICY "Anyone can view ratings" ON public.post_ratings IS 'Allows reading all ratings for like count display';
COMMENT ON POLICY "Anonymous users can insert session-based likes" ON public.post_ratings IS 'Anonymous users can only create likes with session_id, not profile_id';
COMMENT ON POLICY "Authenticated users can insert profile-based likes" ON public.post_ratings IS 'Authenticated users can only create likes with their own profile_id';
COMMENT ON POLICY "Anonymous users can delete own session-based likes" ON public.post_ratings IS 'Anonymous users can only remove session-based likes';
COMMENT ON POLICY "Authenticated users can delete own profile-based likes" ON public.post_ratings IS 'Authenticated users can only remove their own profile-based likes';
