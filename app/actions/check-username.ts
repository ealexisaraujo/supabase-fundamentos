"use server";

/**
 * Server Action for secure username availability checking
 *
 * Security measures implemented:
 * 1. Authentication required - only logged-in users can check
 * 2. Rate limiting - prevents enumeration attacks
 * 3. Timing attack prevention - consistent response times
 * 4. Generic error messages - never reveals if username exists
 * 5. Input validation before database query
 *
 * OWASP References:
 * - https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
 * - https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/03-Identity_Management_Testing/04-Testing_for_Account_Enumeration_and_Guessable_User_Account
 */

import { createClient } from "@/app/utils/supabase/server";
import { validateUsernameFormat, normalizeUsername } from "@/app/utils/username-validation";

// Simple in-memory rate limiting (for production, use Redis/Upstash)
// This is a basic implementation - in production use @upstash/ratelimit
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  userLimit.count++;
  return true;
}

// Minimum response time to prevent timing attacks (ms)
const MIN_RESPONSE_TIME_MS = 100;

async function enforceMinResponseTime<T>(
  startTime: number,
  result: T
): Promise<T> {
  const elapsed = Date.now() - startTime;
  const remaining = MIN_RESPONSE_TIME_MS - elapsed;

  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  return result;
}

export interface CheckUsernameResult {
  available: boolean;
  error?: string;
}

/**
 * Check if a username is available
 *
 * IMPORTANT: This function intentionally uses generic error messages
 * to prevent username enumeration attacks. Never reveal specific
 * reasons why a username is not available.
 */
export async function checkUsernameAvailable(
  username: string
): Promise<CheckUsernameResult> {
  const startTime = Date.now();

  try {
    // 1. Validate input format first (fast, no DB hit)
    const formatValidation = validateUsernameFormat(username);
    if (!formatValidation.valid) {
      return enforceMinResponseTime(startTime, {
        available: false,
        error: formatValidation.error,
      });
    }

    // 2. Check authentication
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return enforceMinResponseTime(startTime, {
        available: false,
        error: "Debes iniciar sesión para verificar disponibilidad",
      });
    }

    // 3. Check rate limit
    if (!checkRateLimit(user.id)) {
      return enforceMinResponseTime(startTime, {
        available: false,
        error: "Demasiadas solicitudes. Intenta de nuevo en un minuto.",
      });
    }

    // 4. Normalize and check database
    const normalizedUsername = normalizeUsername(username);

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", normalizedUsername)
      .neq("id", user.id) // Exclude current user's own username
      .maybeSingle();

    // 5. Return result with consistent timing
    // SECURITY: Use generic message - never reveal "username already exists"
    if (existingProfile) {
      return enforceMinResponseTime(startTime, {
        available: false,
        // Generic message - intentionally vague for security
        error: "Este nombre de usuario no está disponible",
      });
    }

    return enforceMinResponseTime(startTime, {
      available: true,
    });
  } catch (error) {
    // Log error server-side but return generic message to client
    console.error("[checkUsernameAvailable] Error:", error);

    return enforceMinResponseTime(startTime, {
      available: false,
      error: "Error al verificar disponibilidad. Intenta de nuevo.",
    });
  }
}
