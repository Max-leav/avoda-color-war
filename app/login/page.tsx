"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
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
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
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
        <p className="text-muted text-sm mb-6">
          Enter your email and we'll send you a link to set a new password.
        </p>
      )}
      {mode !== "forgot" && <div className="mb-4" />}

      {mode === "forgot" && sent && (
        <div className="border border-border bg-surface rounded-xl p-5 mb-4">
          <p className="text-sm text-ink mb-2">Check your email</p>
          <p className="text-xs text-muted leading-relaxed">
            If an account exists for {email}, a reset link is on its way. It expires
            after a while and only works once, so use it soon. Check spam if it doesn't
            show up in a couple of minutes.
          </p>
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
