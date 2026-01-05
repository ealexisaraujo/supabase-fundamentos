-- Create posts_new table (missing from previous migrations)
CREATE TABLE IF NOT EXISTS public.posts_new (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    image_url text,
    caption text,
    likes numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    "user" jsonb
);

COMMENT ON TABLE public.posts_new IS 'Main posts table (recreated to ensure UUID primary key)';
