"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { User } from "@/lib/types";

type AuthContextType = {
  session: Session | null;
  profile: User | null;
  /** True until the first session check finishes. */
  loading: boolean;
  /** Set when we're signed in but couldn't read/create the users row. */
  profileError: string | null;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  profile: null,
  loading: true,
  profileError: null,
  refreshProfile: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  async function loadProfile(userId: string) {
    // maybeSingle() instead of single(): "no row" is an expected state here
    // (that's what the self-heal below is for), and single() turns it into an
    // error, which makes a real failure indistinguishable from a missing row.
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      // Errors here are almost always environment/RLS problems, not app bugs.
      console.error("[auth] reading public.users failed:", error.message, error);
      setProfileError(error.message);
      return;
    }

    if (data) {
      setProfile(data as User);
      setProfileError(null);
      return;
    }

    // Signed in, but no public.users row -- e.g. the account was created
    // before the signup trigger existed. Ask the server to backfill one.
    console.warn("[auth] no public.users row for", userId, "- attempting backfill");

    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession();
    if (!freshSession) return;

    try {
      const res = await fetch("/api/auth/ensure-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshSession.access_token}`,
        },
      });
      const body = await res.json();
      if (res.ok) {
        setProfile(body.profile as User);
        setProfileError(null);
      } else {
        console.error("[auth] ensure-profile failed:", body.error);
        setProfileError(body.error ?? "Could not create profile.");
      }
    } catch (err: any) {
      console.error("[auth] ensure-profile request failed:", err);
      setProfileError("Could not reach the profile endpoint.");
    }
  }

  async function refreshProfile() {
    if (session?.user?.id) await loadProfile(session.user.id);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user?.id) loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setProfileError(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, profileError, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
