"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { normalizeVenmoHandle, validateVenmoHandle } from "@/lib/payment";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [venmo, setVenmo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          // Where the emailed link lands. This exact URL also has to be in
          // Supabase -> Authentication -> URL Configuration -> Redirect URLs,
          // or Supabase will refuse to redirect to it.
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;

        // Shown whether or not the address has an account, so this can't be
        // used to find out which emails are registered.
        setSent(true);
        return;
      }

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
        {mode === "signin"
          ? "Sign in"
          : mode === "signup"
          ? "Create an account"
          : "Reset your password"}
      </h1>

      {mode === "forgot" && !sent && (
        <div className="mb-6">
          <p className="text-muted text-sm mb-3">
            Enter your email and we&apos;ll send you a reset link.
          </p>
          <p className="text-xs text-muted leading-relaxed border border-border bg-surface rounded-lg p-3">
            Reset emails only reach a few addresses on this setup, so if nothing
            arrives, ask an admin — they can reset your password or send you a sign-in
            link directly. That always works.
          </p>
        </div>
      )}
      {mode !== "forgot" && <div className="mb-4" />}

      {mode === "forgot" && sent && (
        <div className="border border-border bg-surface rounded-xl p-5 mb-4">
          <p className="text-sm text-ink mb-2">Check your email</p>
          <p className="text-xs text-muted leading-relaxed mb-4">
            If an account exists for {email}, a reset email is on its way with a
            6-digit code. Enter it on the next screen. Check spam if it doesn&apos;t
            arrive in a couple of minutes.
          </p>
          <Link
            href={`/reset-password?email=${encodeURIComponent(email)}`}
            className="block w-full text-center bg-brand text-bg font-display font-600 rounded-lg py-2.5 hover:opacity-90 transition-opacity"
          >
            Enter my code
          </Link>
        </div>
      )}

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


      {!(mode === "forgot" && sent) && (
        <>
          <label className="block text-xs uppercase tracking-wide text-muted mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && mode === "forgot") submit();
            }}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-4"
          />
        </>
      )}

      {mode !== "forgot" && (
        <>
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
            <button
              onClick={() => {
                setMode("forgot");
                setError(null);
                setSent(false);
              }}
              className="text-xs text-muted hover:text-brand transition-colors mb-6"
            >
              Forgot your password?
            </button>
          )}
          {mode === "signup" && <div className="mb-6" />}
        </>
      )}

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

      {!(mode === "forgot" && sent) && (
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full bg-brand text-bg font-display font-600 rounded-lg py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40 mb-3"
        >
          {submitting
            ? "…"
            : mode === "signin"
            ? "Sign in"
            : mode === "signup"
            ? "Sign up"
            : "Email me a reset link"}
        </button>
      )}

      <button
        onClick={() => {
          setError(null);
          setSent(false);
          setMode(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup");
        }}
        className="w-full text-sm text-muted hover:text-ink transition-colors"
      >
        {mode === "signin"
          ? "Need an account? Sign up"
          : mode === "signup"
          ? "Already have an account? Sign in"
          : "Back to sign in"}
      </button>
    </div>
  );
}
