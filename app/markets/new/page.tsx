"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";

export default function NewMarketPage() {
  const { session, profile, loading } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!session) {
      setError("Sign in first.");
      return;
    }
    setSubmitting(true);
    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/markets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshSession?.access_token}`,
        },
        body: JSON.stringify({
          title,
          description,
          closeTime: new Date(closeTime).toISOString(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not create market.");
      router.push(`/markets/${body.market.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-muted text-sm">Loading…</p>;
  }

  // Matches the server-side check in POST /api/markets.
  if (!session || !profile?.is_admin) {
    return (
      <div className="border border-border bg-surface rounded-xl p-6">
        <h1 className="font-display font-600 text-ink mb-1">Admins only</h1>
        <p className="text-muted text-sm">
          Only admin accounts can create markets.{" "}
          <Link href="/" className="text-brand hover:underline">
            Back to markets
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl font-700 text-ink mb-6">Create a market</h1>

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        Question (resolves YES or NO)
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Will it rain in Boston on Saturday?"
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-4"
      />

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        Description (resolution criteria)
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Explain exactly how this will be judged, e.g. which source decides."
        rows={4}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-4"
      />

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        Closes at
      </label>
      <input
        type="datetime-local"
        value={closeTime}
        onChange={(e) => setCloseTime(e.target.value)}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-6"
      />

      {error && <p className="text-xs text-no mb-3">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="bg-brand text-bg font-display font-600 rounded-lg px-5 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {submitting ? "Creating…" : "Create market"}
      </button>

      <p className="text-[11px] text-muted mt-4 leading-relaxed">
        As the creator, you'll be responsible for resolving this market to YES
        or NO once the outcome is known — do that from the market page.
      </p>
    </div>
  );
}
