-- Create post_ratings table to store individual ratings per session
-- This prevents multiple ratings from the same session while allowing the like count to be tracked

CREATE TABLE IF NOT EXISTS public.post_ratings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES public.posts_new(id) ON DELETE CASCADE,
    session_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),

    -- Ensure one rating per session per post
    CONSTRAINT unique_session_post_rating UNIQUE (post_id, session_id)
);

-- Create index for faster lookups by session_id
CREATE INDEX idx_post_ratings_session_id ON public.post_ratings(session_id);

-- Create index for faster lookups by post_id
CREATE INDEX idx_post_ratings_post_id ON public.post_ratings(post_id);

-- Enable Row Level Security
ALTER TABLE public.post_ratings ENABLE ROW LEVEL SECURITY;

-- Allow all public operations (matching existing permissive policy pattern)
CREATE POLICY "Allow all public operations on post_ratings" ON public.post_ratings
    AS PERMISSIVE
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Add comment to explain the table purpose
COMMENT ON TABLE public.post_ratings IS 'Stores individual post ratings per session to prevent duplicate likes and enable rating persistence';
COMMENT ON COLUMN public.post_ratings.session_id IS 'Anonymous session identifier stored in browser localStorage';
