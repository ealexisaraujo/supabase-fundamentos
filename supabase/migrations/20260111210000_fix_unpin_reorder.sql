-- Fix unpin to reorder remaining highlights (no gaps)
-- When a highlight is removed, remaining highlights shift down to fill the gap

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
$$ LANGUAGE plpgsql SECURITY DEFINER;
