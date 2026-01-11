-- Profile Highlights RPC Functions
-- Atomic functions for pin, unpin, and reorder operations
--
-- All functions use SECURITY DEFINER to run with owner permissions,
-- but include explicit ownership validation for security.

-- Pin a post to highlights at a specific position
CREATE OR REPLACE FUNCTION pin_post_to_highlights(
    p_profile_id UUID,
    p_post_id UUID,
    p_position SMALLINT
)
RETURNS JSON AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unpin a post from highlights
CREATE OR REPLACE FUNCTION unpin_post_from_highlights(
    p_profile_id UUID,
    p_post_id UUID
)
RETURNS JSON AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reorder a highlight to a new position (swaps with existing if occupied)
CREATE OR REPLACE FUNCTION reorder_highlight(
    p_profile_id UUID,
    p_post_id UUID,
    p_new_position SMALLINT
)
RETURNS JSON AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION pin_post_to_highlights(UUID, UUID, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION unpin_post_from_highlights(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reorder_highlight(UUID, UUID, SMALLINT) TO authenticated;
