-- Add profile_id column to comments for authenticated comment creation
-- This enables the 1:N relationship between profiles and comments

-- Add profile_id column that references profiles table
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for efficient queries by profile
CREATE INDEX IF NOT EXISTS idx_comments_profile_id ON public.comments(profile_id);

-- Drop the old permissive INSERT policy
DROP POLICY IF EXISTS "Allow public insert" ON public.comments;

-- Create new INSERT policy that requires authentication
CREATE POLICY "Only authenticated users can comment" ON public.comments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND profile_id IS NOT NULL
        AND user_id = auth.uid()
    );
