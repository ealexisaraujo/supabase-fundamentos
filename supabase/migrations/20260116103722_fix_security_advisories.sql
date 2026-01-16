-- Migration: Fix Security Advisories
--
-- This migration addresses the following security issues:
-- 1. ERROR: RLS Disabled on public.post (unused table - will be dropped)
-- 2. WARN: Overly Permissive RLS on posts_new (will add granular policies)
-- 3. WARN: Function Search Path Mutable (will set search_path on all functions)

-- ============================================================================
-- PART 1: Drop unused public.post table (0 rows, not referenced in code)
-- ============================================================================
DROP TABLE IF EXISTS public.post;

-- ============================================================================
-- PART 2: Secure RLS policies for posts_new table
-- ============================================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all public" ON public.posts_new;

-- SELECT: Anyone can view posts (public feed)
CREATE POLICY "Anyone can view posts"
ON public.posts_new
FOR SELECT
USING (true);

-- INSERT: Only authenticated users with a profile can create posts
CREATE POLICY "Authenticated users can create posts"
ON public.posts_new
FOR INSERT
TO authenticated
WITH CHECK (
    profile_id IS NOT NULL
    AND profile_id IN (
        SELECT id FROM public.profiles WHERE id = auth.uid()
    )
);

-- UPDATE: Only post owner can update their posts
CREATE POLICY "Users can update own posts"
ON public.posts_new
FOR UPDATE
TO authenticated
USING (
    profile_id IN (
        SELECT id FROM public.profiles WHERE id = auth.uid()
    )
)
WITH CHECK (
    profile_id IN (
        SELECT id FROM public.profiles WHERE id = auth.uid()
    )
);

-- DELETE: Only post owner can delete their posts
CREATE POLICY "Users can delete own posts"
ON public.posts_new
FOR DELETE
TO authenticated
USING (
    profile_id IN (
        SELECT id FROM public.profiles WHERE id = auth.uid()
    )
);

-- ============================================================================
-- PART 3: Fix function search_path for SECURITY DEFINER functions
-- ============================================================================

-- Fix toggle_post_like function
CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid, p_session_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

-- Fix pin_post_to_highlights function
CREATE OR REPLACE FUNCTION public.pin_post_to_highlights(p_profile_id uuid, p_post_id uuid, p_position smallint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_existing_count INTEGER;
    v_post_owner UUID;
    v_highlight_id UUID;
BEGIN
    -- Validate position
    IF p_position < 1 OR p_position > 3 THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Position must be between 1 and 3'
        );
    END IF;

    -- Verify post ownership
    SELECT profile_id INTO v_post_owner
    FROM posts_new WHERE id = p_post_id;

    IF v_post_owner IS NULL THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Post not found'
        );
    END IF;

    IF v_post_owner != p_profile_id THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'You can only pin your own posts'
        );
    END IF;

    -- Check if post is already highlighted
    IF EXISTS (
        SELECT 1 FROM profile_highlights
        WHERE profile_id = p_profile_id AND post_id = p_post_id
    ) THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'This post is already highlighted'
        );
    END IF;

    -- Check current highlight count
    SELECT COUNT(*) INTO v_existing_count
    FROM profile_highlights WHERE profile_id = p_profile_id;

    IF v_existing_count >= 3 THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Maximum 3 highlights allowed. Please unpin one first.'
        );
    END IF;

    -- Check if position is occupied - if so, swap or shift
    IF EXISTS (
        SELECT 1 FROM profile_highlights
        WHERE profile_id = p_profile_id AND position = p_position
    ) THEN
        -- Remove the existing highlight at this position
        DELETE FROM profile_highlights
        WHERE profile_id = p_profile_id AND position = p_position;
    END IF;

    -- Insert the new highlight
    INSERT INTO profile_highlights (profile_id, post_id, position)
    VALUES (p_profile_id, p_post_id, p_position)
    RETURNING id INTO v_highlight_id;

    RETURN json_build_object(
        'success', TRUE,
        'highlightId', v_highlight_id,
        'position', p_position
    );
EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', 'Position conflict. Please try again.'
    );
WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$function$;

-- Fix unpin_post_from_highlights function
CREATE OR REPLACE FUNCTION public.unpin_post_from_highlights(p_profile_id uuid, p_post_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_deleted_position SMALLINT;
BEGIN
    -- Delete the highlight and get the position
    DELETE FROM profile_highlights
    WHERE profile_id = p_profile_id AND post_id = p_post_id
    RETURNING position INTO v_deleted_position;

    IF v_deleted_position IS NULL THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Highlight not found'
        );
    END IF;

    -- Reorder remaining highlights to fill the gap (shift down)
    -- All highlights with position > deleted position get position - 1
    UPDATE profile_highlights
    SET position = position - 1, updated_at = now()
    WHERE profile_id = p_profile_id AND position > v_deleted_position;

    RETURN json_build_object(
        'success', TRUE,
        'removedPosition', v_deleted_position
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$function$;

-- Fix reorder_highlight function
CREATE OR REPLACE FUNCTION public.reorder_highlight(p_profile_id uuid, p_post_id uuid, p_new_position smallint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_current_position SMALLINT;
    v_other_post_id UUID;
BEGIN
    -- Validate new position
    IF p_new_position < 1 OR p_new_position > 3 THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Position must be between 1 and 3'
        );
    END IF;

    -- Get current position
    SELECT position INTO v_current_position
    FROM profile_highlights
    WHERE profile_id = p_profile_id AND post_id = p_post_id;

    IF v_current_position IS NULL THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Highlight not found'
        );
    END IF;

    IF v_current_position = p_new_position THEN
        RETURN json_build_object(
            'success', TRUE,
            'message', 'Already at this position'
        );
    END IF;

    -- Check if target position is occupied
    SELECT post_id INTO v_other_post_id
    FROM profile_highlights
    WHERE profile_id = p_profile_id AND position = p_new_position;

    IF v_other_post_id IS NOT NULL THEN
        -- Swap positions: first move other to temp position (0)
        UPDATE profile_highlights
        SET position = 0, updated_at = now()
        WHERE profile_id = p_profile_id AND post_id = v_other_post_id;

        -- Move target to new position
        UPDATE profile_highlights
        SET position = p_new_position, updated_at = now()
        WHERE profile_id = p_profile_id AND post_id = p_post_id;

        -- Move other to original position
        UPDATE profile_highlights
        SET position = v_current_position, updated_at = now()
        WHERE profile_id = p_profile_id AND post_id = v_other_post_id;
    ELSE
        -- Simply update the target highlight
        UPDATE profile_highlights
        SET position = p_new_position, updated_at = now()
        WHERE profile_id = p_profile_id AND post_id = p_post_id;
    END IF;

    RETURN json_build_object(
        'success', TRUE,
        'newPosition', p_new_position,
        'swappedWith', v_other_post_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$function$;

-- Fix handle_updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Fix update_comments_updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_comments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- ============================================================================
-- Add comments for documentation
-- ============================================================================
COMMENT ON POLICY "Anyone can view posts" ON public.posts_new IS 'Public read access for the feed';
COMMENT ON POLICY "Authenticated users can create posts" ON public.posts_new IS 'Only authenticated users with a profile can create posts';
COMMENT ON POLICY "Users can update own posts" ON public.posts_new IS 'Users can only update their own posts';
COMMENT ON POLICY "Users can delete own posts" ON public.posts_new IS 'Users can only delete their own posts';
