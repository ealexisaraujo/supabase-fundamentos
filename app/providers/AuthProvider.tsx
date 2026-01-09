"use client";

/**
 * AuthProvider - Centralized Authentication State Management
 *
 * This provider creates a single source of truth for authentication state
 * across the entire application. Instead of each component calling
 * `supabase.auth.getUser()` on mount, they can use the `useAuth()` hook.
 *
 * Benefits:
 * - Single `onAuthStateChange` listener (not one per component)
 * - Auth state persists across navigations
 * - No loading flash for auth-dependent UI
 * - Reduces Supabase API calls significantly
 *
 * @see https://supabase.com/docs/guides/auth/auth-helpers/nextjs
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "../utils/client";
import { getSessionId } from "../utils/session";

interface AuthContextType {
  /** Current authenticated user, null if not logged in */
  user: User | null;
  /** Current session, null if not logged in */
  session: Session | null;
  /** True while initial auth check is in progress */
  isLoading: boolean;
  /** Anonymous session ID for tracking likes without auth */
  sessionId: string;
  /** Sign out the current user */
  signOut: () => Promise<void>;
  /** Refresh the session (useful after profile updates) */
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Initialize sessionId once - used for anonymous like tracking
  const [sessionId] = useState<string>(() => getSessionId());

  // Initialize auth state and set up listener
  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        setSession(initialSession);
        setUser(initialSession?.user ?? null);
      } catch (error) {
        console.error("[AuthProvider] Error getting initial session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      // Ensure loading is false after any auth event
      setIsLoading((current) => (current ? false : current));
    });

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array - only run once on mount

  // Sign out function
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      // State will be updated by onAuthStateChange listener
    } catch (error) {
      console.error("[AuthProvider] Error signing out:", error);
      throw error;
    }
  }, []);

  // Refresh session function
  const refreshSession = useCallback(async () => {
    try {
      const {
        data: { session: refreshedSession },
      } = await supabase.auth.refreshSession();
      setSession(refreshedSession);
      setUser(refreshedSession?.user ?? null);
    } catch (error) {
      console.error("[AuthProvider] Error refreshing session:", error);
      throw error;
    }
  }, []);

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    sessionId,
    signOut,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access authentication state
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, isLoading, signOut } = useAuth();
 *
 *   if (isLoading) return <Skeleton />;
 *   if (!user) return <LoginButton />;
 *
 *   return (
 *     <div>
 *       Welcome, {user.email}
 *       <button onClick={signOut}>Sign Out</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
