DROP POLICY IF EXISTS "Allow public inserts" ON public.posts_new;
DROP POLICY IF EXISTS "Allow public selects" ON public.posts_new;

CREATE POLICY "Allow all public" ON public.posts_new
    AS PERMISSIVE
    FOR ALL
    USING (true)
    WITH CHECK (true);
