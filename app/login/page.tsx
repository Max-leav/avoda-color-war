"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { normalizeVenmoHandle, validateVenmoHandle } from "@/lib/payment";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [venmo, setVenmo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const venmoError = validateVenmoHandle(venmo);
        if (venmoError) throw new Error(venmoError);

        // The handle travels as account metadata, and the signup trigger
        // copies it into user_payment_info. Posting it after signUp() would
        // fail whenever email confirmation is on, since there's no session
        // yet to authenticate the write with.
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username, venmo_handle: normalizeVenmoHandle(venmo) },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.push("/");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="font-display text-2xl font-700 text-ink mb-2">
        {mode === "signin" ? "Sign in" : "Create an account"}
      </h1>

      <div className="mb-4" />

      {mode === "signup" && (
        <>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1">
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-4"
          />
        </>
      )}

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        Email
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-4"
      />

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        Password
      </label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-2"
      />

      {mode === "signin" && (
        <Link
          href={
            email.trim()
              ? `/reset-password?email=${encodeURIComponent(email.trim())}`
              : "/reset-password"
          }
          className="inline-block text-xs text-muted hover:text-brand transition-colors mb-6"
        >
          Forgot your password?
        </Link>
      )}
      {mode === "signup" && <div className="mb-6" />}

      {error && <p className="text-xs text-no mb-3">{error}</p>}

      {mode === "signup" && (
        <>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1">
            Venmo handle <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-muted">@</span>
            <input
              value={venmo}
              onChange={(e) => setVenmo(e.target.value)}
              placeholder="your-venmo"
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 font-mono text-ink focus-ring"
            />
          </div>
          <p className="text-[11px] text-muted mb-4 leading-relaxed">
            So an admin can pay you out. Only you and the admins can see it, and you
            can add or change it later on your profile.
          </p>
        </>
      )}

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full bg-brand text-bg font-display font-600 rounded-lg py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40 mb-3"
      >
        {submitting ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
      </button>

      <button
        onClick={() => {
          setError(null);
          setMode(mode === "signup" ? "signin" : "signup");
        }}
        className="w-full text-sm text-muted hover:text-ink transition-colors"
      >
        {mode === "signin"
          ? "Need an account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
