-- Profile Highlights Table
-- Allows users to pin up to 3 of their posts as highlights on their profile
--
-- Features:
-- - Max 3 highlights per profile (enforced via position constraint 1-3)
-- - Manual position selection (1, 2, 3)
-- - Only own posts can be highlighted
-- - Cascade delete when post is deleted

-- Create the profile_highlights table
CREATE TABLE public.profile_highlights (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    post_id uuid NOT NULL REFERENCES public.posts_new(id) ON DELETE CASCADE,
    position smallint NOT NULL CHECK (position >= 1 AND position <= 3),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    -- Unique constraints: one position per profile, one highlight per post per profile
    CONSTRAINT unique_profile_position UNIQUE (profile_id, position),
    CONSTRAINT unique_profile_post UNIQUE (profile_id, post_id)
);

-- Indexes for efficient lookups
CREATE INDEX idx_profile_highlights_profile_id ON public.profile_highlights(profile_id);
CREATE INDEX idx_profile_highlights_post_id ON public.profile_highlights(post_id);

-- Enable Row Level Security
ALTER TABLE public.profile_highlights ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Allow public read access (anyone can view highlights)
CREATE POLICY "Profile highlights are publicly viewable" ON public.profile_highlights
    FOR SELECT USING (true);

-- Allow users to insert their own highlights for their own posts
CREATE POLICY "Users can insert their own highlights" ON public.profile_highlights
    FOR INSERT WITH CHECK (
        auth.uid() = profile_id
        AND EXISTS (
            SELECT 1 FROM public.posts_new
            WHERE id = post_id AND profile_id = profile_highlights.profile_id
        )
    );

-- Allow users to update their own highlights (for reordering)
CREATE POLICY "Users can update their own highlights" ON public.profile_highlights
    FOR UPDATE USING (auth.uid() = profile_id)
    WITH CHECK (auth.uid() = profile_id);

-- Allow users to delete their own highlights
CREATE POLICY "Users can delete their own highlights" ON public.profile_highlights
    FOR DELETE USING (auth.uid() = profile_id);

-- Trigger for updated_at
CREATE TRIGGER on_profile_highlights_updated
    BEFORE UPDATE ON public.profile_highlights
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_highlights;

-- Documentation
COMMENT ON TABLE public.profile_highlights IS 'Stores pinned/highlighted posts for user profiles (max 3 per profile)';
COMMENT ON COLUMN public.profile_highlights.position IS 'Display position (1-3) for the highlight';
