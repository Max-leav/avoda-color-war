"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { User } from "@/lib/types";
import { formatCredits } from "@/lib/calculations";

export default function AdminPage() {
  const { session, profile, loading } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [target, setTarget] = useState<User | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function search() {
    setError(null);
    setMessage(null);
    const { data } = await supabase
      .from("users")
      .select("*")
      .or(`username.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(10);
    setResults((data as User[]) ?? []);
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
          className="bg-surface border border-border rounded-lg px-4 text-sm text-ink hover:border-brand transition-colors"
        >
          Search
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
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surfaceHover transition-colors text-left"
            >
              <span className="text-ink">{u.username}</span>
              <span className="text-muted text-xs">{u.email}</span>
              <span className="font-mono text-brand">{formatCredits(u.balance)}</span>
            </button>
          ))}
        </div>
      )}

      {target && (
        <div className="border border-border bg-surface rounded-xl p-5">
          <p className="text-sm text-ink mb-4">
            Adjusting <span className="font-600">{target.username}</span> — current balance{" "}
            <span className="font-mono text-brand">{formatCredits(target.balance)}</span>
          </p>

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
