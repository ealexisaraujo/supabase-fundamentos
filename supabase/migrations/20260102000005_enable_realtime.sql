-- Enable realtime for posts_new and post_ratings tables
-- This allows Supabase's pub/sub system to broadcast changes to connected clients

-- Add posts_new to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts_new;

-- Add post_ratings to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_ratings;

-- Set replica identity to FULL for post_ratings to include old values in DELETE events
-- This is necessary to know which post_id was unliked
ALTER TABLE public.post_ratings REPLICA IDENTITY FULL;

COMMENT ON TABLE public.posts_new IS 'Posts table with realtime enabled for live like count updates';
COMMENT ON TABLE public.post_ratings IS 'Rating tracking table with realtime enabled for session sync across tabs';
