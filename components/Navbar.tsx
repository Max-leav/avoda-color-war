"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/lib/supabase";
import { formatCredits } from "@/lib/calculations";

export default function Navbar() {
  const { session, profile } = useAuth();

  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-display font-700 text-lg tracking-tight text-ink">
          FORE<span className="text-brand">CAST</span>
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted hover:text-ink transition-colors">
            Markets
          </Link>
          {session && (
            <Link href="/markets/new" className="text-muted hover:text-ink transition-colors">
              New market
            </Link>
          )}

          {session && profile ? (
            <>
              <Link
                href="/profile"
                className="font-mono text-brand border border-border rounded-full px-3 py-1 hover:border-brand transition-colors"
              >
                {formatCredits(profile.balance)} cr
              </Link>
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-muted hover:text-ink transition-colors"
              >
                Sign out
              </button>
            </>
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
