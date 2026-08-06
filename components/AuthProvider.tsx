"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();

  // Password-reset links don't always arrive at /reset-password. Supabase
  // redirects to the project's Site URL whenever redirectTo isn't on the
  // allowlist, and it sends failures (expired, already-used) to the Site URL
  // regardless. Either way the user lands on "/" with the whole story sitting
  // in the URL fragment and nothing on that page looking at it, which reads
  // as "clicking the link did nothing."
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname === "/reset-password") return;

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

    const errorDescription = hashParams.get("error_description");
    if (errorDescription) {
      const errorCode = hashParams.get("error_code") ?? "";
      // Hand it to the reset page, which already knows how to explain a bad
      // link, rather than dropping the user on a homepage that says nothing.
      router.replace(
        `/reset-password?error_description=${encodeURIComponent(errorDescription)}` +
          (errorCode ? `&error_code=${encodeURIComponent(errorCode)}` : "")
      );
      return;
    }

    // A working recovery link that landed on the wrong page: the tokens are
    // in the fragment, so carry it across intact.
    if (hashParams.get("type") === "recovery") {
      router.replace(`/reset-password${window.location.hash}`);
    }
  }, [pathname, router]);

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

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Fired when a recovery link is processed. detectSessionInUrl may have
      // already stripped the fragment by the time the effect above runs, so
      // this is the backstop: the session a recovery link creates is only
      // good for setting a new password, so send them where that happens.
      if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") {
        router.replace("/reset-password");
      }

      setSession(newSession);
      if (newSession?.user?.id) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setProfileError(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  return (
    <AuthContext.Provider value={{ session, profile, loading, profileError, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
