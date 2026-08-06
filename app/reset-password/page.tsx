"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Status = "checking" | "ready" | "invalid" | "done";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Where the emailed reset link lands. Supabase hands the recovery token over
 * in one of two ways depending on the project's flow type: a `?code=` query
 * param (PKCE) or an `#access_token=...&type=recovery` URL fragment
 * (implicit). Both are handled below, since which one you get depends on
 * project settings rather than anything in this code.
 *
 * Once either produces a session, the user is temporarily signed in with
 * enough privilege to call updateUser({ password }) -- that's the whole
 * mechanism behind a password reset.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // detectSessionInUrl handles the #fragment case on its own, but it does
    // so asynchronously -- so listen for the result rather than racing it.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !cancelled) {
        setStatus((current) => (current === "done" ? current : "ready"));
      }
    });

    async function establishSession() {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));

      // Expired or already-used links come back with the reason attached.
      const linkError =
        url.searchParams.get("error_description") ?? hashParams.get("error_description");
      if (linkError) {
        if (!cancelled) {
          setError(linkError);
          setStatus("invalid");
        }
        return;
      }

      const code = url.searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError && !cancelled) {
          setError(exchangeError.message);
          setStatus("invalid");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setStatus(data.session ? "ready" : "invalid");
    }

    establishSession();

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit() {
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

      setStatus("done");
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

  if (status === "checking") {
    return <p className="text-muted text-sm">Checking your reset link…</p>;
  }

  if (status === "invalid") {
    return (
      <div className="max-w-sm mx-auto border border-border bg-surface rounded-xl p-6">
        <h1 className="font-display font-600 text-ink mb-2">This link didn't work</h1>
        <p className="text-muted text-sm mb-4 leading-relaxed">
          {error ?? "The reset link is invalid or has expired."} Reset links are
          single-use and time-limited, and they have to be opened in the same browser you
          requested them from.
        </p>
        <Link
          href="/login"
          className="inline-block bg-brand text-bg font-display font-600 rounded-lg px-4 py-2 text-sm hover:opacity-90 transition-opacity"
        >
          Request a new one
        </Link>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="max-w-sm mx-auto border border-yes/40 bg-yes/5 rounded-xl p-6">
        <h1 className="font-display font-600 text-ink mb-2">Password updated</h1>
        <p className="text-muted text-sm">
          You're signed in with your new password. Taking you back to the markets…
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="font-display text-2xl font-700 text-ink mb-1">Set a new password</h1>
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
          if (e.key === "Enter") submit();
        }}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-6"
      />

      {error && <p className="text-xs text-no mb-3">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full bg-brand text-bg font-display font-600 rounded-lg py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {submitting ? "Saving…" : "Update password"}
      </button>
    </div>
  );
}
