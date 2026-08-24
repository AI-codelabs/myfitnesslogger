import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";

/** Minimal session/user shapes returned by the Neon SupabaseAuthAdapter. */
export type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

export type AuthSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user: AuthUser;
};

type Role = "user" | "coach" | null;

interface AuthContextValue {
  session: AuthSession | null;
  user: AuthUser | null;
  role: Role;
  onboardingComplete: boolean | null; // null = unknown / loading
  loading: boolean;
  signOut: () => Promise<void>;
  refreshOnboarding: () => Promise<void>;
  /** Call after signInWithPassword to re-enter loading state until onAuthStateChange fires. */
  notifySignIn: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = async (uid: string) => {
    const { data } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .maybeSingle();
    setRole((data?.role as Role) ?? null);
  };

  const fetchOnboarding = useCallback(async (uid: string) => {
    const { data } = await db
      .from("onboarding_responses")
      .select("completed_at")
      .eq("user_id", uid)
      .maybeSingle();
    setOnboardingComplete(!!data?.completed_at);
  }, []);

  const refreshOnboarding = useCallback(async () => {
    if (user) await fetchOnboarding(user.id);
  }, [user, fetchOnboarding]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const next = (newSession as AuthSession | null) ?? null;
      setSession(next);
      setUser(next?.user ?? null);
      if (next?.user) {
        fetchRole(next.user.id);
        fetchOnboarding(next.user.id);
      } else {
        setRole(null);
        setOnboardingComplete(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      const next = (existing as AuthSession | null) ?? null;
      setSession(next);
      setUser(next?.user ?? null);
      if (next?.user) {
        fetchRole(next.user.id);
        fetchOnboarding(next.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchOnboarding]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const notifySignIn = useCallback(() => {
    setLoading(true);
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, role, onboardingComplete, loading, signOut, refreshOnboarding, notifySignIn }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
