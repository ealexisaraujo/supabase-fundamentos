-- Create comments table for photo/post comments
CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    post_id uuid NOT NULL,
    user_id uuid,
    content text NOT NULL,
    "user" jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comments_post_id_fkey FOREIGN KEY (post_id)
        REFERENCES public.posts_new(id) ON DELETE CASCADE
);

-- Create index for faster lookups by post_id
CREATE INDEX comments_post_id_idx ON public.comments(post_id);

-- Create index for faster lookups by user_id
CREATE INDEX comments_user_id_idx ON public.comments(user_id);

-- Create index for chronological ordering
CREATE INDEX comments_created_at_idx ON public.comments(created_at);

-- Enable Row Level Security
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Allow public read access to all comments
CREATE POLICY "Allow public read" ON public.comments
    FOR SELECT
    USING (true);

-- Allow public insert (anonymous commenting supported like posts)
CREATE POLICY "Allow public insert" ON public.comments
    FOR INSERT
    WITH CHECK (true);

-- Allow users to update their own comments (by user_id)
CREATE POLICY "Allow update own comments" ON public.comments
    FOR UPDATE
    USING (user_id IS NOT NULL AND user_id = auth.uid())
    WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());

-- Allow users to delete their own comments
CREATE POLICY "Allow delete own comments" ON public.comments
    FOR DELETE
    USING (user_id IS NOT NULL AND user_id = auth.uid());

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_comments_updated_at_trigger
    BEFORE UPDATE ON public.comments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_comments_updated_at();

-- Add comment to table for documentation
COMMENT ON TABLE public.comments IS 'Stores user comments on posts/photos';
COMMENT ON COLUMN public.comments.id IS 'Unique identifier for the comment (UUID)';
COMMENT ON COLUMN public.comments.post_id IS 'Reference to the parent post';
COMMENT ON COLUMN public.comments.user_id IS 'Reference to the commenting user (nullable for anonymous)';
COMMENT ON COLUMN public.comments.content IS 'The comment text content';
COMMENT ON COLUMN public.comments."user" IS 'JSONB with user display info (username, avatar)';
COMMENT ON COLUMN public.comments.created_at IS 'Timestamp when comment was created';
COMMENT ON COLUMN public.comments.updated_at IS 'Timestamp when comment was last updated';
