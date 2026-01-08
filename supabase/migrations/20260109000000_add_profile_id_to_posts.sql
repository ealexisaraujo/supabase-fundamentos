-- Add profile_id column to posts_new for authenticated post creation
-- This enables the 1:N relationship between profiles and posts

-- Add profile_id column that references profiles table
ALTER TABLE public.posts_new
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for efficient queries by profile
CREATE INDEX IF NOT EXISTS idx_posts_new_profile_id ON public.posts_new(profile_id);

-- Note: RLS policies already exist for posts_new table
-- The existing policies allow public read and authenticated insert/update/delete
-- No changes needed since we're preserving backward compatibility with anonymous posts
