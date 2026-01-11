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
  /** Profile ID from profiles table (for persistent likes) */
  profileId: string | undefined;
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
  const [profileId, setProfileId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  // Initialize sessionId once - used for anonymous like tracking
  const [sessionId] = useState<string>(() => getSessionId());

  // Helper to check if profile exists and return profileId
  // In Supabase, profiles.id === auth.users.id (the profile ID is the user's auth ID)
  const fetchProfileId = useCallback(async (userId: string): Promise<string | undefined> => {
    console.log("[AuthProvider] Checking profile for user:", userId);
    try {
      // Check if profile exists (profiles.id = auth.users.id)
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle(); // Use maybeSingle to avoid error when no rows

      if (error) {
        console.error("[AuthProvider] Error fetching profile:", error);
        return undefined;
      }

      if (!profile) {
        console.log("[AuthProvider] Profile not found for user, may need to create one");
        return undefined;
      }

      console.log("[AuthProvider] Profile found, profileId:", profile.id);
      return profile.id;
    } catch (error) {
      console.error("[AuthProvider] Exception fetching profile:", error);
      return undefined;
    }
  }, []);

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

        // Fetch profile ID if user is authenticated
        if (initialSession?.user?.id) {
          const fetchedProfileId = await fetchProfileId(initialSession.user.id);
          setProfileId(fetchedProfileId);
        } else {
          setProfileId(undefined);
        }
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
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log("[AuthProvider] Auth state changed:", event, "user:", newSession?.user?.email);

      // Update user and session immediately
      setSession(newSession);
      setUser(newSession?.user ?? null);

      // Set loading to false IMMEDIATELY so UI can render
      setIsLoading(false);

      // Fetch profile ID if user is authenticated (async, UI updates when done)
      if (newSession?.user?.id) {
        fetchProfileId(newSession.user.id).then(fetchedProfileId => {
          console.log("[AuthProvider] Setting profileId:", fetchedProfileId);
          setProfileId(fetchedProfileId);
        });
      } else {
        console.log("[AuthProvider] No user, clearing profileId");
        setProfileId(undefined);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfileId]); // Include fetchProfileId in dependencies

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

  // Debug: Log current auth state
  useEffect(() => {
    console.log("[AuthProvider] State:", {
      user: user?.email,
      profileId,
      isLoading,
      sessionId: sessionId.slice(0, 8)
    });
  }, [user, profileId, isLoading, sessionId]);

  const value: AuthContextType = {
    user,
    session,
    profileId,
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
