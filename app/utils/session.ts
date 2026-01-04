const SESSION_KEY = 'suplatzigram_session_id';

/**
 * Generates a unique session ID using crypto API
 * Format: timestamp-randomUUID for uniqueness and debugging
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomUUID();
  return `${timestamp}-${randomPart}`;
}

/**
 * Gets the current session ID from localStorage
 * Creates a new one if it doesn't exist
 * This enables one rating per session to prevent abuse
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  let sessionId = localStorage.getItem(SESSION_KEY);

  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  return sessionId;
}

/**
 * Clears the session ID (useful for testing or resetting)
 */
export function clearSessionId(): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(SESSION_KEY);
}
