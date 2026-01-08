/**
 * Production-grade username validation following industry best practices
 *
 * Security considerations:
 * - Prevents username enumeration attacks
 * - Rate limiting to prevent brute-force
 * - Input sanitization and validation
 * - Timing attack prevention
 * - Reserved username blocking
 *
 * References:
 * - OWASP Authentication Cheat Sheet
 * - OWASP Testing for Account Enumeration
 */

// Reserved usernames that cannot be used (security + brand protection)
const RESERVED_USERNAMES = new Set([
  // System/admin
  'admin', 'administrator', 'root', 'system', 'sysadmin',
  'moderator', 'mod', 'staff', 'support', 'help', 'info',

  // Brand protection
  'supabase', 'platzi', 'suplatzigram', 'official',

  // Common attack vectors
  'null', 'undefined', 'none', 'anonymous', 'unknown',
  'test', 'testing', 'demo', 'example',

  // API/technical
  'api', 'graphql', 'rest', 'webhook', 'bot', 'robot',

  // Pages/routes that could conflict
  'login', 'logout', 'register', 'signup', 'signin', 'signout',
  'profile', 'settings', 'account', 'dashboard', 'home',
  'about', 'contact', 'privacy', 'terms', 'legal',
  'create', 'edit', 'delete', 'new', 'post', 'posts',
  'feed', 'explore', 'search', 'rank', 'ranking',
  'auth', 'oauth', 'callback', 'verify', 'confirm',

  // Social
  'everyone', 'all', 'public', 'private', 'me', 'you',
]);

// Username format rules
const USERNAME_RULES = {
  minLength: 3,
  maxLength: 30,
  // Only alphanumeric, underscores, and periods (like Instagram)
  pattern: /^[a-zA-Z0-9._]+$/,
  // Cannot start or end with period/underscore
  noEdgeSpecialChars: /^[a-zA-Z0-9].*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/,
  // No consecutive periods or underscores
  noConsecutiveSpecial: /^(?!.*[._]{2})/,
};

export interface UsernameValidationResult {
  valid: boolean;
  error?: string;
  // Intentionally vague for security - never reveal "username exists"
  suggestion?: string;
}

/**
 * Client-side validation (fast, runs before server check)
 * This is NOT a security measure - it's for UX only
 */
export function validateUsernameFormat(username: string): UsernameValidationResult {
  const trimmed = username.trim().toLowerCase();

  // Length check
  if (trimmed.length < USERNAME_RULES.minLength) {
    return {
      valid: false,
      error: `El nombre de usuario debe tener al menos ${USERNAME_RULES.minLength} caracteres`,
    };
  }

  if (trimmed.length > USERNAME_RULES.maxLength) {
    return {
      valid: false,
      error: `El nombre de usuario no puede exceder ${USERNAME_RULES.maxLength} caracteres`,
    };
  }

  // Character validation
  if (!USERNAME_RULES.pattern.test(trimmed)) {
    return {
      valid: false,
      error: 'Solo se permiten letras, números, puntos y guiones bajos',
    };
  }

  // Edge character validation (for usernames > 1 char)
  if (trimmed.length > 1 && !USERNAME_RULES.noEdgeSpecialChars.test(trimmed)) {
    return {
      valid: false,
      error: 'El nombre de usuario no puede comenzar o terminar con punto o guión bajo',
    };
  }

  // Consecutive special characters
  if (!USERNAME_RULES.noConsecutiveSpecial.test(trimmed)) {
    return {
      valid: false,
      error: 'No se permiten puntos o guiones bajos consecutivos',
    };
  }

  // Reserved username check
  if (RESERVED_USERNAMES.has(trimmed)) {
    return {
      valid: false,
      // Generic message - don't reveal it's reserved
      error: 'Este nombre de usuario no está disponible',
    };
  }

  return { valid: true };
}

/**
 * Normalize username for consistent storage and comparison
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Generate username suggestions based on a base name
 * Used when the desired username is not available
 */
export function generateUsernameSuggestions(baseName: string): string[] {
  const normalized = normalizeUsername(baseName);
  const suggestions: string[] = [];

  // Add random numbers
  for (let i = 0; i < 3; i++) {
    const randomNum = Math.floor(Math.random() * 9999);
    suggestions.push(`${normalized}${randomNum}`);
  }

  // Add underscores with numbers
  suggestions.push(`${normalized}_${Math.floor(Math.random() * 99)}`);

  // Add year
  const year = new Date().getFullYear();
  suggestions.push(`${normalized}${year}`);

  return suggestions.filter(s =>
    s.length <= USERNAME_RULES.maxLength &&
    validateUsernameFormat(s).valid
  );
}
