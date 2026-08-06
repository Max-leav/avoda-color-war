"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/lib/supabase";
import { Market } from "@/lib/types";
import { formatCloseTime } from "@/lib/time";
import {
  formatCredits,
  formatProbability,
  impliedNoPrice,
  impliedYesPrice,
  previewPayout,
  BROKER_FEE_RATE,
} from "@/lib/calculations";

export default function BetForm({
  market,
  onPlaced,
}: {
  market: Market;
  onPlaced: () => void;
}) {
  const { session, profile, refreshProfile } = useAuth();
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closed = market.resolved || new Date(market.close_time).getTime() <= Date.now();
  const price = side === "yes" ? impliedYesPrice(market) : impliedNoPrice(market);

  // Live preview state. Recomputed on every keystroke, before anything is
  // submitted, so you can see what a stake pays without committing to it.
  const parsed = Number(amount);
  const stake = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const balance = profile?.balance ?? 0;
  const overdrawn = !!profile && stake > balance;
  const preview = previewPayout(market, side, stake);
  const otherPool = side === "yes" ? market.no_pool : market.yes_pool;

  async function placeBet() {
    setError(null);
    const stake = Number(amount);

    if (!session) {
      setError("Sign in to place a bet.");
      return;
    }
    if (!Number.isFinite(stake) || stake <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (profile && stake > profile.balance) {
      setError("That's more credits than you have.");
      return;
    }

    setSubmitting(true);
    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/bets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshSession?.access_token}`,
        },
        body: JSON.stringify({ marketId: market.id, side, amount: stake }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not place bet.");

      setAmount("");
      await refreshProfile();
      onPlaced();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (closed) {
    return (
      <div className="border border-border bg-surface rounded-xl p-5 text-sm text-muted">
        {market.resolved
          ? `This market resolved to ${market.winning_side?.toUpperCase()}. Betting is closed.`
          : `Closed to new bets as of ${formatCloseTime(market.close_time)}.`}
      </div>
    );
  }

  return (
    <div className="border border-border bg-surface rounded-xl p-5">
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setSide("yes")}
          className={`rounded-lg py-3 font-display font-600 border transition-colors ${
            side === "yes"
              ? "bg-yes/10 border-yes text-yes"
              : "border-border text-muted hover:text-ink"
          }`}
        >
          YES · {formatProbability(impliedYesPrice(market))}
        </button>
        <button
          onClick={() => setSide("no")}
          className={`rounded-lg py-3 font-display font-600 border transition-colors ${
            side === "no"
              ? "bg-no/10 border-no text-no"
              : "border-border text-muted hover:text-ink"
          }`}
        >
          NO · {formatProbability(impliedNoPrice(market))}
        </button>
      </div>

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        Amount (credits)
      </label>
      <input
        type="number"
        min="1"
        step="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 font-mono text-ink focus-ring mb-3"
      />

      {profile && (
        <p className="text-xs text-muted mb-3">
          Balance: <span className="font-mono">{formatCredits(balance)}</span> credits
        </p>
      )}

      {stake > 0 && (
        <div className="border border-border rounded-lg bg-bg p-3 mb-3">
          <div className="flex items-baseline justify-between text-xs mb-1.5">
            <span className="text-muted">Your wager</span>
            <span className="font-mono tabular-nums text-ink">
              {formatCredits(preview.stake)}
            </span>
          </div>

          <div className="flex items-baseline justify-between text-xs mb-1.5">
            <span className="text-muted">
              Return if {side.toUpperCase()} wins
            </span>
            <span
              className={`font-mono tabular-nums ${
                preview.profit > 0 ? "text-yes" : "text-muted"
              }`}
            >
              +{formatCredits(preview.profit)}
            </span>
          </div>

          <div className="flex items-baseline justify-between text-xs mb-2">
            <span className="text-muted">
              Broker's fee ({Math.round(BROKER_FEE_RATE * 100)}% of winnings)
            </span>
            <span className="font-mono tabular-nums text-muted">
              −{formatCredits(preview.fee)}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-2 border-t border-border">
            <span className="text-xs text-muted">You get back</span>
            <span className="font-mono tabular-nums text-lg text-brand">
              {formatCredits(preview.total)}{" "}
              <span className="text-xs text-muted">
                ({preview.multiplier.toFixed(2)}×)
              </span>
            </span>
          </div>

          <p className="text-[11px] text-muted mt-2 leading-relaxed">
            {otherPool <= 0
              ? `No credits on ${side === "yes" ? "NO" : "YES"} yet, so there's nothing to win
                 off this bet -- you'd just get your stake back. It grows as bets land on
                 the other side.`
              : `Estimate at the current pool sizes, already net of the fee and of your
                 own stake joining the pool. It moves as more bets come in.`}
          </p>
        </div>
      )}

      {overdrawn && (
        <p className="text-xs text-no mb-3">
          That's more than your {formatCredits(balance)} credits.
        </p>
      )}

      {error && <p className="text-xs text-no mb-3">{error}</p>}

      <button
        onClick={placeBet}
        disabled={submitting || !session || overdrawn}
        className="w-full bg-brand text-bg font-display font-600 rounded-lg py-3 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {!session
          ? "Sign in to bet"
          : submitting
          ? "Placing..."
          : `Place ${side.toUpperCase()} bet at ${formatProbability(price)}`}
      </button>

      <p className="text-[11px] text-muted mt-3 leading-relaxed">
        Play-money credits only. Nothing here represents real currency or a
        withdrawable balance.
      </p>
    </div>
  );
}
