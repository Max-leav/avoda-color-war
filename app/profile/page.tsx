"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Transaction, Bet, Market } from "@/lib/types";
import { formatCredits, formatProbability } from "@/lib/calculations";
import PaymentInfoForm from "@/components/PaymentInfoForm";
import { sideLabel } from "@/lib/labels";

export default function ProfilePage() {
  const { session, profile } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bets, setBets] = useState<
    (Bet & { markets: Pick<Market, "title" | "yes_label" | "no_label"> | null })[]
  >([]);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("transactions")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(20)
      .then(({ data }) => setTransactions((data as Transaction[]) ?? []));

    supabase
      .from("bets")
      // Pull the side names along so bet history reads "BLUE" rather than
      // "YES" on a market whose sides were renamed.
      .select("*, markets(title, yes_label, no_label)")
      .eq("user_id", session.user.id)
      .order("timestamp", { ascending: false })
      .limit(20)
      .then(({ data }) => setBets((data as any) ?? []));
  }, [session]);

  if (!session) {
    return <p className="text-muted text-sm">Sign in to view your profile.</p>;
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-700 text-ink mb-1">{profile?.username}</h1>
      <p className="font-mono text-brand text-lg mb-8">
        {profile ? formatCredits(profile.balance) : "…"} credits
      </p>

      <PaymentInfoForm />

      <h2 className="font-display font-600 text-ink mb-3">Your bets</h2>
      <div className="border border-border rounded-xl divide-y divide-border overflow-hidden mb-8">
        {bets.length === 0 && <p className="text-muted text-sm p-4">No bets yet.</p>}
        {bets.map((b) => (
          <div key={b.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-ink truncate max-w-[40%]">{b.markets?.title ?? "Market"}</span>
            <span className={b.side === "yes" ? "text-yes" : "text-no"}>
              {sideLabel(
                {
                  yes_label: b.markets?.yes_label ?? null,
                  no_label: b.markets?.no_label ?? null,
                },
                b.side
              )}
            </span>
            <span className="font-mono text-ink">{b.amount.toLocaleString()} cr</span>
            <span className="font-mono text-muted text-xs">@ {formatProbability(b.price)}</span>
            <span className="font-mono text-xs">
              {b.payout != null ? (
                <span className={b.payout > 0 ? "text-yes" : "text-no"}>
                  {b.payout > 0 ? `+${b.payout}` : "0"}
                </span>
              ) : (
                <span className="text-muted">pending</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <h2 className="font-display font-600 text-ink mb-3">Transaction history</h2>
      <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
        {transactions.length === 0 && <p className="text-muted text-sm p-4">No activity yet.</p>}
        {transactions.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-muted">{t.description}</span>
            <span className={`font-mono ${t.amount >= 0 ? "text-yes" : "text-no"}`}>
              {t.amount >= 0 ? "+" : ""}
              {t.amount.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
