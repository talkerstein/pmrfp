import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AuthState = {
  session: Session | null;
  /** null while we're still restoring the session from the keychain. */
  loading: boolean;
  /** True when the org has an active or comped subscription. */
  hasAccess: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Asks the database whether this user's org can see full RFPs.
 *
 * `has_active_trade_access` is the same function the RLS policies use, so the
 * answer here always matches what the API will actually return — we never
 * decide access on the client. This only drives what the UI shows (an unlock
 * prompt vs the full scope); the data itself is protected either way.
 */
async function fetchAccess(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_active_trade_access", { uid: userId });
  if (error) return false;
  return data === true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      setHasAccess(data.session ? await fetchAccess(data.session.user.id) : false);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!active) return;
      setSession(next);
      setHasAccess(next ? await fetchAccess(next.user.id) : false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    session,
    loading,
    hasAccess,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshAccess: async () => {
      setHasAccess(session ? await fetchAccess(session.user.id) : false);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
