"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/lib/supabase";
import { formatCredits } from "@/lib/calculations";

export default function Navbar() {
  const { session, profile, loading, profileError } = useAuth();

  // The auth state and the profile row load separately, so treat them as two
  // separate questions. Being signed in is what decides sign in vs. sign out;
  // the profile only decides what extras (balance, admin badge) show up. The
  // old version gated the sign-out button on both, so any hiccup loading the
  // profile left a logged-in user staring at a "Sign in" button.
  const signedIn = !!session;
  const isAdmin = !!profile?.is_admin;

  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="font-display font-700 text-lg tracking-tight text-ink">
          FORE<span className="text-brand">CAST</span>
        </Link>

        <nav className="flex items-center gap-3 sm:gap-4 text-sm">
          <Link href="/" className="text-muted hover:text-ink transition-colors">
            Markets
          </Link>

          {/* Market creation is admin-only now. */}
          {signedIn && isAdmin && (
            <Link
              href="/markets/new"
              className="text-muted hover:text-ink transition-colors"
            >
              New market
            </Link>
          )}

          {/* Balance: every signed-in non-admin. Admins have no stake in any
              market, so a balance would just read as a number they can't use. */}
          {signedIn && !isAdmin && (
            <Link
              href="/profile"
              className={`font-mono tabular-nums border rounded-full px-3 py-1 transition-colors ${
                profileError
                  ? "text-no border-no/50"
                  : "text-brand border-border hover:border-brand"
              }`}
              title={
                profileError
                  ? `Couldn't load your profile: ${profileError}`
                  : "Your credit balance"
              }
            >
              {profile ? (
                `${formatCredits(profile.balance)} cr`
              ) : profileError ? (
                "no profile"
              ) : (
                "… cr"
              )}
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/admin"
              className="font-display text-[11px] font-600 uppercase tracking-[0.15em] text-brand border border-brand/50 rounded-full px-2.5 py-1 hover:bg-brand/10 transition-colors"
              title="Admin tools"
            >
              Admin
            </Link>
          )}

          {loading ? (
            <span className="text-muted">…</span>
          ) : signedIn ? (
            <button
              onClick={() => supabase.auth.signOut()}
              className="bg-brand text-bg font-medium rounded-full px-4 py-1.5 hover:opacity-90 transition-opacity"
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/login"
              className="bg-brand text-bg font-medium rounded-full px-4 py-1.5 hover:opacity-90 transition-opacity"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
