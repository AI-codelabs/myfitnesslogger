import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "user" | "coach" | null;

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: Role;
  onboardingComplete: boolean | null; // null = unknown / loading
  loading: boolean;
  signOut: () => Promise<void>;
  refreshOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = async (uid: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .maybeSingle();
    setRole((data?.role as Role) ?? null);
  };

  const fetchOnboarding = useCallback(async (uid: string) => {
    const { data } = await supabase
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
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => {
          fetchRole(newSession.user.id);
          fetchOnboarding(newSession.user.id);
        }, 0);
      } else {
        setRole(null);
        setOnboardingComplete(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) {
        fetchRole(existing.user.id);
        fetchOnboarding(existing.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchOnboarding]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, role, onboardingComplete, loading, signOut, refreshOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
