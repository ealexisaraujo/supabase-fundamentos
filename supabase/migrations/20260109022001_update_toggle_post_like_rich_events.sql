-- Final version of toggle_post_like with rich metadata for analytics
-- Includes post owner info, liker profile, and notification queue integration

CREATE OR REPLACE FUNCTION toggle_post_like(
  p_post_id UUID,
  p_session_id TEXT
)
RETURNS JSON AS $$
DECLARE
  v_existing_rating_id UUID;
  v_is_liked BOOLEAN;
  v_new_likes NUMERIC;
  v_post_owner_id UUID;
  v_liker_profile_id UUID;
  v_post_caption TEXT;
BEGIN
  -- Check if rating exists
  SELECT id INTO v_existing_rating_id
  FROM post_ratings
  WHERE post_id = p_post_id AND session_id = p_session_id;

  -- Get post metadata (owner and caption)
  SELECT profile_id, caption INTO v_post_owner_id, v_post_caption
  FROM posts_new
  WHERE id = p_post_id;

  -- Try to get the liker's profile_id from their session
  -- (This assumes session_id might be linked to a profile, otherwise null)
  SELECT p.id INTO v_liker_profile_id
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p_session_id LIKE '%' || u.id::text || '%'
  LIMIT 1;

  IF v_existing_rating_id IS NOT NULL THEN
    -- Unlike: Delete rating and decrement count
    DELETE FROM post_ratings WHERE id = v_existing_rating_id;

    UPDATE posts_new
    SET likes = GREATEST(0, likes - 1), updated_at = now()
    WHERE id = p_post_id
    RETURNING likes INTO v_new_likes;

    v_is_liked := FALSE;

    -- Enqueue UNLIKE analytics event with rich metadata
    PERFORM pgmq.send('like_events', json_build_object(
      'event_type', 'unlike',
      'event_value', -1,
      'post_id', p_post_id,
      'post_owner_id', v_post_owner_id,
      'post_caption', LEFT(v_post_caption, 100), -- Truncate for storage efficiency
      'liker_session_id', p_session_id,
      'liker_profile_id', v_liker_profile_id,
      'new_like_count', v_new_likes,
      'timestamp', now(),
      'metadata', json_build_object(
        'action', 'remove_rating',
        'rating_id', v_existing_rating_id
      )
    )::jsonb);

  ELSE
    -- Like: Insert rating and increment count
    INSERT INTO post_ratings (post_id, session_id)
    VALUES (p_post_id, p_session_id);

    UPDATE posts_new
    SET likes = likes + 1, updated_at = now()
    WHERE id = p_post_id
    RETURNING likes INTO v_new_likes;

    v_is_liked := TRUE;

    -- Enqueue LIKE analytics event with rich metadata
    PERFORM pgmq.send('like_events', json_build_object(
      'event_type', 'like',
      'event_value', 1,
      'post_id', p_post_id,
      'post_owner_id', v_post_owner_id,
      'post_caption', LEFT(v_post_caption, 100),
      'liker_session_id', p_session_id,
      'liker_profile_id', v_liker_profile_id,
      'new_like_count', v_new_likes,
      'timestamp', now(),
      'metadata', json_build_object(
        'action', 'add_rating'
      )
    )::jsonb);

    -- Enqueue notification for post owner (only on like, not unlike)
    -- Don't notify if the liker is the post owner
    IF v_post_owner_id IS NOT NULL AND v_post_owner_id != v_liker_profile_id THEN
      PERFORM pgmq.send('notifications', json_build_object(
        'notification_type', 'new_like',
        'recipient_id', v_post_owner_id,
        'actor_id', v_liker_profile_id,
        'actor_session_id', p_session_id,
        'post_id', p_post_id,
        'post_caption', LEFT(v_post_caption, 50),
        'new_like_count', v_new_likes,
        'timestamp', now()
      )::jsonb);
    END IF;
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'isLiked', v_is_liked,
    'newLikeCount', v_new_likes
  );
EXCEPTION WHEN unique_violation THEN
  -- Handle race condition (concurrent like from same session)
  RETURN json_build_object(
    'success', FALSE,
    'isLiked', TRUE,
    'newLikeCount', 0,
    'error', 'Already liked this post'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
