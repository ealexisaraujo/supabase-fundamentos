/**
 * Profile Highlights Type Definitions
 *
 * Types for the highlights/pinned posts feature that allows users
 * to pin up to 3 of their posts on their profile.
 */

/**
 * Simplified post data included when fetching highlights
 */
export interface HighlightPost {
  id: string;
  image_url: string;
  caption: string;
  likes: number;
  created_at: string;
}

/**
 * A profile highlight (pinned post)
 */
export interface ProfileHighlight {
  id: string;
  profile_id: string;
  post_id: string;
  position: 1 | 2 | 3;
  created_at: string;
  updated_at: string;
  // Joined post data (when fetched with post details)
  post?: HighlightPost;
}

/**
 * Result of pinning a post to highlights
 */
export interface PinHighlightResult {
  success: boolean;
  highlightId?: string;
  position?: number;
  error?: string;
}

/**
 * Result of unpinning a post from highlights
 */
export interface UnpinHighlightResult {
  success: boolean;
  removedPosition?: number;
  error?: string;
}

/**
 * Result of reordering a highlight
 */
export interface ReorderHighlightResult {
  success: boolean;
  newPosition?: number;
  swappedWith?: string | null;
  message?: string;
  error?: string;
}

/**
 * Real-time update payload for highlight changes
 */
export interface HighlightUpdate {
  profileId: string;
  action: "pin" | "unpin" | "reorder";
  postId: string;
  position?: number;
}

/**
 * Valid highlight positions (1-3)
 */
export type HighlightPosition = 1 | 2 | 3;
