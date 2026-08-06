"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { AdminUserResult } from "@/lib/types";
import { formatCredits } from "@/lib/calculations";

export default function AdminPage() {
  const { session, profile, loading } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminUserResult[]>([]);
  const [target, setTarget] = useState<AdminUserResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [access, setAccess] = useState<
    { mode: string; username: string; code?: string; link?: string } | null
  >(null);
  const [accessWorking, setAccessWorking] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Goes through the API rather than querying Supabase directly, because
  // payment details are RLS-restricted to their owner -- the browser client
  // genuinely can't read another user's Venmo handle, by design. The route
  // re-checks that the caller is an admin before returning anything.
  // Gets a locked-out camper back in without touching email. Supabase's
  // default sender only delivers to the project org's own addresses, so an
  // emailed reset never reaches them in the first place.
  async function restoreAccess(mode: "code" | "link") {
    if (!target) return;
    setError(null);
    setMessage(null);
    setAccess(null);
    setAccessWorking(true);
    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/user-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshSession?.access_token}`,
        },
        body: JSON.stringify({ userId: target.id, mode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not update access.");
      setAccess(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAccessWorking(false);
    }
  }

  async function search() {
    setError(null);
    setMessage(null);
    if (!query.trim()) return;

    setSearching(true);
    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/search-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshSession?.access_token}`,
        },
        body: JSON.stringify({ query }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Search failed.");

      setResults(body.results as AdminUserResult[]);
      setAccess(null);
      if (body.results.length === 0) setMessage("No users matched that.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function submitAdjustment() {
    setError(null);
    setMessage(null);
    const delta = Number(amount);
    if (!target || !Number.isFinite(delta) || delta === 0) {
      setError("Pick a user and enter a non-zero amount.");
      return;
    }
    if (!description.trim()) {
      setError("Add a short description for the ledger.");
      return;
    }
    setSubmitting(true);
    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/adjust-balance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshSession?.access_token}`,
        },
        body: JSON.stringify({ targetUserId: target.id, amount: delta, description }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not adjust balance.");
      setMessage(`Done — ${target.username}'s new balance is ${formatCredits(body.newBalance)}.`);
      setTarget({ ...target, balance: body.newBalance });
      setAmount("");
      setDescription("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-muted text-sm">Loading…</p>;

  if (!session || !profile?.is_admin) {
    return (
      <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted">
        Admin access required.
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl font-700 text-ink mb-1">Admin: adjust balance</h1>
      <p className="text-muted text-sm mb-6">
        Credit or debit a user's play-money balance. Every adjustment is logged
        to their transaction history.
      </p>

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        Find user (username or email)
      </label>
      <div className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-ink focus-ring"
        />
        <button
          onClick={search}
          disabled={searching}
          className="bg-surface border border-border rounded-lg px-4 text-sm text-ink hover:border-brand transition-colors disabled:opacity-40"
        >
          {searching ? "…" : "Search"}
        </button>
      </div>

      {results.length > 0 && (
        <div className="border border-border rounded-xl divide-y divide-border overflow-hidden mb-6">
          {results.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                setTarget(u);
                setResults([]);
                setQuery(u.username);
              }}
              className="w-full px-4 py-3 text-sm hover:bg-surfaceHover transition-colors text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink truncate">{u.username}</span>
                <span className="font-mono text-brand shrink-0">
                  {formatCredits(u.balance)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 mt-1">
                <span className="text-muted text-xs truncate">{u.email}</span>
                <span className="font-mono text-xs shrink-0">
                  {u.venmo_handle ? (
                    <span className="text-ink">@{u.venmo_handle}</span>
                  ) : (
                    <span className="text-muted">no venmo</span>
                  )}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {target && (
        <div className="border border-border bg-surface rounded-xl p-5">
          <p className="text-sm text-ink mb-3">
            Adjusting <span className="font-600">{target.username}</span> — current balance{" "}
            <span className="font-mono text-brand">{formatCredits(target.balance)}</span>
          </p>

          <div className="border border-border rounded-lg bg-bg p-3 mb-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Venmo</span>
              <span className="font-mono text-ink">
                {target.venmo_handle ? `@${target.venmo_handle}` : "— not provided"}
              </span>
            </div>
          </div>

          <div className="border border-border rounded-lg bg-bg p-3 mb-4">
            <p className="text-xs text-muted mb-2 leading-relaxed">
              Locked out? Neither of these sends an email — you hand the result over
              yourself, and neither lets you see or choose their password.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => restoreAccess("code")}
                disabled={accessWorking}
                className="flex-1 border border-border rounded-lg py-2 text-xs text-ink hover:border-brand transition-colors disabled:opacity-40"
              >
                Reset code
              </button>
              <button
                onClick={() => restoreAccess("link")}
                disabled={accessWorking}
                className="flex-1 border border-border rounded-lg py-2 text-xs text-ink hover:border-brand transition-colors disabled:opacity-40"
              >
                Sign-in link
              </button>
            </div>

            {access?.code && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[11px] text-muted mb-1">
                  Reset code for {access.username}. Read it out — they go to Sign in,
                  click &quot;Forgot your password?&quot;, then enter their email and this
                  code and pick their own password. Single use, and it expires.

                  Length is set by Supabase (Authentication &rarr; Providers &rarr; Email
                  &rarr; Email OTP Length), not by this app.
                </p>
                <p className="font-mono text-2xl tracking-[0.25em] text-brand select-all">
                  {access.code}
                </p>
              </div>
            )}

            {access?.link && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[11px] text-muted mb-1">
                  One-time sign-in link for {access.username}. Text it to them. It
                  works once, and signs them in for good — the session survives closing
                  the tab.
                </p>
                <textarea
                  readOnly
                  value={access.link}
                  rows={3}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 font-mono text-[11px] text-ink focus-ring"
                />
              </div>
            )}
          </div>

          <label className="block text-xs uppercase tracking-wide text-muted mb-1">
            Amount (negative to debit, e.g. -50)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 font-mono text-ink focus-ring mb-4"
          />

          <label className="block text-xs uppercase tracking-wide text-muted mb-1">
            Description (shown on their ledger)
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Correcting duplicate bet"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-4"
          />

          {error && <p className="text-xs text-no mb-3">{error}</p>}
          {message && <p className="text-xs text-yes mb-3">{message}</p>}

          <button
            onClick={submitAdjustment}
            disabled={submitting}
            className="w-full bg-brand text-bg font-display font-600 rounded-lg py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? "Applying…" : "Apply adjustment"}
          </button>
        </div>
      )}
    </div>
  );
}
