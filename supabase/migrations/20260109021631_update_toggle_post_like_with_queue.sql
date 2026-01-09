-- Update toggle_post_like to enqueue analytics events
-- This version adds pgmq.send() calls for background processing

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

    -- Enqueue analytics event for unlike
    PERFORM pgmq.send('like_events', json_build_object(
      'event_type', 'unlike',
      'post_id', p_post_id,
      'session_id', p_session_id,
      'new_like_count', v_new_likes,
      'timestamp', now()
    )::jsonb);

  ELSE
    -- Like: Insert rating and increment
    INSERT INTO post_ratings (post_id, session_id)
    VALUES (p_post_id, p_session_id);

    UPDATE posts_new
    SET likes = likes + 1, updated_at = now()
    WHERE id = p_post_id
    RETURNING likes INTO v_new_likes;

    v_is_liked := TRUE;

    -- Enqueue analytics event for like
    PERFORM pgmq.send('like_events', json_build_object(
      'event_type', 'like',
      'post_id', p_post_id,
      'session_id', p_session_id,
      'new_like_count', v_new_likes,
      'timestamp', now()
    )::jsonb);
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
