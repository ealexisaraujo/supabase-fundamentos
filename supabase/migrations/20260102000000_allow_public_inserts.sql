ALTER TABLE public.posts_new ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public inserts" ON public.posts_new FOR INSERT WITH CHECK (true);