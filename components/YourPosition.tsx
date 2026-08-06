"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/lib/supabase";
import { Bet, Market } from "@/lib/types";
import { sideLabel, winningLabel } from "@/lib/labels";
import {
  BROKER_FEE_RATE,
  calculatePayout,
  formatCredits,
  isRefundedMarket,
  round2,
} from "@/lib/calculations";

type SidePosition = {
  side: "yes" | "no";
  staked: number;
  /** Actual payout once resolved, or what this side would pay if it wins. */
  returns: number;
};

/**
 * What the signed-in user has riding on this specific market, and what comes
 * back. Three states, and the difference between them matters:
 *
 *  - Open: the return is a moving estimate, since later bets change the pools.
 *  - Closed, not resolved: pools are frozen, so the numbers are now firm --
 *    this is exactly the "what do I get if I'm right" question people ask
 *    while waiting on a result.
 *  - Resolved: the real, already-paid figures straight off the bets rows.
 */
export default function YourPosition({ market }: { market: Market }) {
  const { session, profile } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    supabase
      .from("bets")
      .select("*")
      .eq("market_id", market.id)
      .eq("user_id", session.user.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("[position] could not load your bets:", error.message);
        setBets((data as Bet[]) ?? []);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Refetch after the market resolves, which is when payouts get written.
  }, [session?.user?.id, market.id, market.resolved]);

  if (loading || !session || profile?.is_admin || bets.length === 0) return null;

  const closedToBets = new Date(market.close_time).getTime() <= Date.now();

  // Collapse multiple bets on the same side into one line -- betting three
  // times on YES is one position, not three.
  const positions: SidePosition[] = (["yes", "no"] as const)
    .map((side) => {
      const sideBets = bets.filter((b) => b.side === side);
      if (sideBets.length === 0) return null;

      const staked = round2(sideBets.reduce((sum, b) => sum + b.amount, 0));

      // Once resolved, the bets rows carry what was actually paid. Trust
      // those over recomputing: they're what actually moved the balance,
      // and recomputing could disagree if pools shifted during settlement.
      const returns = market.resolved
        ? round2(sideBets.reduce((sum, b) => sum + (b.payout ?? 0), 0))
        : calculatePayout({ amount: staked, side }, { ...market, winning_side: side });

      return { side, staked, returns };
    })
    .filter((p): p is SidePosition => p !== null);

  const totalStaked = round2(positions.reduce((sum, p) => sum + p.staked, 0));

  if (market.resolved || market.voided) {
    const returned = round2(positions.reduce((sum, p) => sum + p.returns, 0));
    const net = round2(returned - totalStaked);
    const won = net > 0;
    // Nobody bet the winning side, so everyone got their stake back. Calling
    // that a "loss" would be wrong -- the money came home.
    const refunded = market.voided || isRefundedMarket(market);

    return (
      <section
        className={`border rounded-xl p-5 mb-6 ${
          won ? "border-yes/40 bg-yes/5" : "border-border bg-surface"
        }`}
      >
        <h2 className="font-display font-600 text-ink mb-3">Your position</h2>

        {positions.map((p) => (
          <div
            key={p.side}
            className="flex items-center justify-between text-sm mb-2"
          >
            <span className={p.side === "yes" ? "text-yes" : "text-no"}>
              {sideLabel(market, p.side)}
              {refunded
                ? " · refunded"
                : p.side === market.winning_side
                ? " · won"
                : " · lost"}
            </span>
            <span className="font-mono text-muted">
              {formatCredits(p.staked)} staked
            </span>
          </div>
        ))}

        <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-border">
          <span className="text-xs text-muted">{refunded ? "Refunded" : "Paid out"}</span>
          <span className="font-mono tabular-nums text-lg text-ink">
            {formatCredits(returned)}
            <span className={`ml-2 text-sm ${won ? "text-yes" : "text-no"}`}>
              {net >= 0 ? "+" : ""}
              {formatCredits(net)}
            </span>
          </span>
        </div>

        <p className="text-[11px] text-muted mt-2">
          {market.voided
            ? "This market was voided, so every stake came back in full. Already in your balance."
            : refunded
            ? `Nobody bet ${winningLabel(market)}, so every stake was returned
               in full. Already back in your balance.`
            : "Already credited to your balance when the market resolved."}
        </p>
      </section>
    );
  }

  return (
    <section className="border border-border bg-surface rounded-xl p-5 mb-6">
      <h2 className="font-display font-600 text-ink mb-1">Your position</h2>
      <p className="text-xs text-muted mb-4">
        {closedToBets
          ? `Betting is closed, so the pools are final -- these are exact, after the
             ${Math.round(BROKER_FEE_RATE * 100)}% broker's fee.`
          : `Estimates, net of the ${Math.round(BROKER_FEE_RATE * 100)}% broker's fee.
             They move as more bets come in.`}
      </p>

      {positions.map((p) => (
        <div key={p.side} className="mb-3 last:mb-0">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className={p.side === "yes" ? "text-yes" : "text-no"}>
              {sideLabel(market, p.side)}
            </span>
            <span className="font-mono text-muted text-xs">
              {formatCredits(p.staked)} staked
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted">
              If {sideLabel(market, p.side)} wins
            </span>
            <span className="font-mono tabular-nums text-brand">
              {formatCredits(p.returns)}
              <span className="text-xs text-muted ml-1.5">
                ({p.staked > 0 ? (p.returns / p.staked).toFixed(2) : "1.00"}×)
              </span>
            </span>
          </div>
        </div>
      ))}

      {positions.length === 2 && (
        <p className="text-[11px] text-muted mt-3 pt-3 border-t border-border">
          You're on both sides, so {formatCredits(totalStaked)} is staked in total and
          one of these two returns is the one you'll get.
        </p>
      )}
    </section>
  );
}
