"use client";

/**
 * Custom hook for debounced username validation
 *
 * Implements a two-phase validation:
 * 1. Instant client-side format validation (UX)
 * 2. Debounced server-side availability check (security)
 *
 * Best practices:
 * - Debounce to reduce server load
 * - Show loading state during check
 * - Clear feedback for all states
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { validateUsernameFormat, normalizeUsername } from "@/app/utils/username-validation";
import { checkUsernameAvailable } from "@/app/actions/check-username";

export type ValidationStatus = "idle" | "validating" | "valid" | "invalid";

export interface UseUsernameValidationResult {
  status: ValidationStatus;
  error: string | null;
  isAvailable: boolean | null;
  validate: (username: string) => void;
}

// Debounce delay in ms - balance between UX and server load
const DEBOUNCE_DELAY = 500;

export function useUsernameValidation(
  currentUsername?: string // User's current username (to allow keeping it)
): UseUsernameValidationResult {
  const [status, setStatus] = useState<ValidationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  // Ref to track the latest validation request
  const latestRequestRef = useRef<string>("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const validate = useCallback(
    (username: string) => {
      // Clear any pending validation
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      const normalized = normalizeUsername(username);
      latestRequestRef.current = normalized;

      // Reset state for empty input
      if (!username.trim()) {
        setStatus("idle");
        setError(null);
        setIsAvailable(null);
        return;
      }

      // If it's the user's current username, it's valid
      if (currentUsername && normalized === normalizeUsername(currentUsername)) {
        setStatus("valid");
        setError(null);
        setIsAvailable(true);
        return;
      }

      // Phase 1: Instant client-side format validation
      const formatResult = validateUsernameFormat(username);
      if (!formatResult.valid) {
        setStatus("invalid");
        setError(formatResult.error || "Nombre de usuario inválido");
        setIsAvailable(false);
        return;
      }

      // Phase 2: Debounced server-side availability check
      setStatus("validating");
      setError(null);
      setIsAvailable(null);

      timeoutRef.current = setTimeout(async () => {
        try {
          const result = await checkUsernameAvailable(username);

          // Only update if this is still the latest request
          if (latestRequestRef.current === normalized) {
            if (result.available) {
              setStatus("valid");
              setError(null);
              setIsAvailable(true);
            } else {
              setStatus("invalid");
              setError(result.error || "Nombre de usuario no disponible");
              setIsAvailable(false);
            }
          }
        } catch {
          // Only update if this is still the latest request
          if (latestRequestRef.current === normalized) {
            setStatus("invalid");
            setError("Error al verificar disponibilidad");
            setIsAvailable(false);
          }
        }
      }, DEBOUNCE_DELAY);
    },
    [currentUsername]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    status,
    error,
    isAvailable,
    validate,
  };
}
