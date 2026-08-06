"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Mode =
  | "checking" // working out whether a link gave us a session
  | "code" // no session: ask for the emailed code
  | "password" // session established: set a new password
  | "done";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Password reset, two ways in.
 *
 * 1. The emailed link. Supabase puts the token in a ?code= param (PKCE) or a
 *    #access_token fragment (implicit) depending on project settings, so both
 *    are handled. When it works, this lands straight on the password form.
 *
 * 2. A 6-digit code typed in by hand. This exists because the link is fragile
 *    in ways that have nothing to do with the app: it only works if the exact
 *    redirect URL is on the project's allowlist, it has to be opened in the
 *    same browser that requested it, and it's single-use -- so any email
 *    scanner that pre-fetches URLs (Outlook Safe Links, corporate antivirus)
 *    burns the token before the user ever clicks, which surfaces as "link
 *    expired" seconds after it was sent.
 *
 *    A code has no URL to pre-fetch, doesn't care which browser or device it's
 *    typed into, and needs no allowlist. It's the more reliable path, and the
 *    fallback whenever the link path fails.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("checking");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !cancelled) {
        setMode((current) => (current === "done" ? current : "password"));
      }
    });

    async function establishSession() {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));

      const emailParam = url.searchParams.get("email");
      if (emailParam && !cancelled) setEmail(emailParam);

      // An expired or already-used link explains itself in the URL.
      const failure =
        url.searchParams.get("error_description") ?? hashParams.get("error_description");
      if (failure) {
        if (!cancelled) {
          setLinkError(failure);
          setMode("code");
        }
        return;
      }

      // Admin-issued reset link: verify the token directly against Supabase,
      // no redirect allowlist and no PKCE verifier involved.
      const tokenHash = url.searchParams.get("token_hash");
      if (tokenHash) {
        const { error: hashError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (cancelled) return;
        if (hashError) {
          setLinkError(hashError.message);
          setMode("code");
          return;
        }
        setMode("password");
        return;
      }

      const authCode = url.searchParams.get("code");
      if (authCode) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          authCode
        );
        if (exchangeError && !cancelled) {
          setLinkError(exchangeError.message);
          setMode("code");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setMode(data.session ? "password" : "code");
    }

    establishSession();

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  /** Trades the emailed code for a session, then moves to the password step. */
  async function verifyCode() {
    setError(null);

    const cleanedCode = code.replace(/\D/g, "");
    if (cleanedCode.length < 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    if (!email.trim()) {
      setError("Enter the email address you requested the reset for.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanedCode,
        type: "recovery",
      });
      if (verifyError) throw verifyError;

      setLinkError(null);
      setMode("password");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function sendNewCode() {
    setError(null);
    setResent(false);

    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/reset-password` }
      );
      if (sendError) throw sendError;
      setResent(true);
      setLinkError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function savePassword() {
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setMode("done");
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1800);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "checking") {
    return <p className="text-muted text-sm">Checking your reset link…</p>;
  }

  if (mode === "done") {
    return (
      <div className="max-w-sm mx-auto border border-yes/40 bg-yes/5 rounded-xl p-6">
        <h1 className="font-display font-600 text-ink mb-2">Password updated</h1>
        <p className="text-muted text-sm">
          You&apos;re signed in with your new password. Taking you back to the markets…
        </p>
      </div>
    );
  }

  if (mode === "password") {
    return (
      <div className="max-w-sm mx-auto">
        <h1 className="font-display text-2xl font-700 text-ink mb-1">
          Set a new password
        </h1>
        <p className="text-muted text-sm mb-6">
          Pick something at least {MIN_PASSWORD_LENGTH} characters long.
        </p>

        <label className="block text-xs uppercase tracking-wide text-muted mb-1">
          New password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-4"
        />

        <label className="block text-xs uppercase tracking-wide text-muted mb-1">
          Confirm new password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") savePassword();
          }}
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-6"
        />

        {error && <p className="text-xs text-no mb-3">{error}</p>}

        <button
          onClick={savePassword}
          disabled={submitting}
          className="w-full bg-brand text-bg font-display font-600 rounded-lg py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {submitting ? "Saving…" : "Update password"}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="font-display text-2xl font-700 text-ink mb-1">Reset your password</h1>
      <p className="text-muted text-sm mb-6">
        Enter your email and the 6-digit reset code. If you didn&apos;t get one by
        email, ask an admin — they can issue you a code on the spot.
      </p>

      {linkError && (
        <div className="border border-border bg-surface rounded-xl p-4 mb-5">
          <p className="text-xs text-ink mb-1">That link didn&apos;t work</p>
          <p className="text-[11px] text-muted leading-relaxed">
            {linkError} Reset codes are single-use and expire. Ask an admin for a
            fresh one, or request a new code below.
          </p>
        </div>
      )}

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-4"
      />

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        6-digit code
      </label>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => {
          if (e.key === "Enter") verifyCode();
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 font-mono text-lg tracking-[0.3em] text-ink focus-ring mb-4"
      />

      {error && <p className="text-xs text-no mb-3">{error}</p>}
      {resent && <p className="text-xs text-yes mb-3">New code sent. Check your email.</p>}

      <button
        onClick={verifyCode}
        disabled={submitting}
        className="w-full bg-brand text-bg font-display font-600 rounded-lg py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40 mb-3"
      >
        {submitting ? "Checking…" : "Continue"}
      </button>

      <button
        onClick={sendNewCode}
        disabled={submitting}
        className="w-full text-sm text-muted hover:text-ink transition-colors disabled:opacity-40"
      >
        Send me a new code
      </button>

      <p className="text-center mt-4">
        <Link href="/login" className="text-xs text-muted hover:text-brand transition-colors">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
