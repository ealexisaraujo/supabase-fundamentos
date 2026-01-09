-- Simplify toggle_post_like: Remove pgmq queue calls
-- The queues were not being consumed, so we remove them for simplicity

CREATE OR REPLACE FUNCTION toggle_post_like(
  p_post_id UUID,
  p_session_id TEXT
)
RETURNS JSON AS $$
DECLARE
  v_existing_rating_id UUID;
  v_is_liked BOOLEAN;
  v_new_likes NUMERIC;
BEGIN
  -- Check if rating exists
  SELECT id INTO v_existing_rating_id
  FROM post_ratings
  WHERE post_id = p_post_id AND session_id = p_session_id;

  IF v_existing_rating_id IS NOT NULL THEN
    -- Unlike: Delete rating and decrement
    DELETE FROM post_ratings WHERE id = v_existing_rating_id;

    UPDATE posts_new
    SET likes = GREATEST(0, likes - 1), updated_at = now()
    WHERE id = p_post_id
    RETURNING likes INTO v_new_likes;

    v_is_liked := FALSE;
  ELSE
    -- Like: Insert rating and increment
    INSERT INTO post_ratings (post_id, session_id)
    VALUES (p_post_id, p_session_id);

    UPDATE posts_new
    SET likes = likes + 1, updated_at = now()
    WHERE id = p_post_id
    RETURNING likes INTO v_new_likes;

    v_is_liked := TRUE;
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'isLiked', v_is_liked,
    'newLikeCount', v_new_likes
  );
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object(
    'success', FALSE,
    'isLiked', TRUE,
    'newLikeCount', 0,
    'error', 'Already liked this post'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop unused wrapper functions
DROP FUNCTION IF EXISTS public.pgmq_read(text, integer, integer);
DROP FUNCTION IF EXISTS public.pgmq_send(text, jsonb);
DROP FUNCTION IF EXISTS public.pgmq_archive(text, bigint);
DROP FUNCTION IF EXISTS public.pgmq_delete(text, bigint);
DROP FUNCTION IF EXISTS public.pgmq_metrics(text);
DROP FUNCTION IF EXISTS public.pgmq_list_queues();
DROP FUNCTION IF EXISTS public.invoke_process_like_events();

-- Drop the queues
SELECT pgmq.drop_queue('like_events');
SELECT pgmq.drop_queue('notifications');
SELECT pgmq.drop_queue('analytics');
