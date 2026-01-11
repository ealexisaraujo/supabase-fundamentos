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

interface ProfileData {
  username: string | null;
  avatar_url: string | null;
}

interface AuthContextType {
  /** Current authenticated user, null if not logged in */
  user: User | null;
  /** Current session, null if not logged in */
  session: Session | null;
  /** Profile ID from profiles table (for persistent likes) */
  profileId: string | undefined;
  /** Profile data (username, avatar) for display */
  profile: ProfileData | null;
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
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Initialize sessionId once - used for anonymous like tracking
  const [sessionId] = useState<string>(() => getSessionId());

  // Helper to fetch profile data (id, username, avatar_url)
  // In Supabase, profiles.id === auth.users.id (the profile ID is the user's auth ID)
  const fetchProfile = useCallback(async (userId: string): Promise<{ id: string; data: ProfileData } | undefined> => {
    try {
      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("[AuthProvider] Error fetching profile:", error);
        return undefined;
      }

      if (!profileData) {
        return undefined;
      }

      return {
        id: profileData.id,
        data: { username: profileData.username, avatar_url: profileData.avatar_url }
      };
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

        // Fetch profile data if user is authenticated
        if (initialSession?.user?.id) {
          const result = await fetchProfile(initialSession.user.id);
          setProfileId(result?.id);
          setProfile(result?.data ?? null);
        } else {
          setProfileId(undefined);
          setProfile(null);
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
      // Skip INITIAL_SESSION - already handled by initializeAuth above
      if (event === "INITIAL_SESSION") {
        return;
      }

      console.log("[AuthProvider] Auth state changed:", event, "user:", newSession?.user?.email);

      // Update user and session immediately
      setSession(newSession);
      setUser(newSession?.user ?? null);

      // Set loading to false IMMEDIATELY so UI can render
      setIsLoading(false);

      // Fetch profile data if user is authenticated (async, UI updates when done)
      if (newSession?.user?.id) {
        fetchProfile(newSession.user.id).then(result => {
          setProfileId(result?.id);
          setProfile(result?.data ?? null);
        });
      } else {
        setProfileId(undefined);
        setProfile(null);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

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
    profileId,
    profile,
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
