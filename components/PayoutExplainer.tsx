"use client";

import { BROKER_FEE_RATE } from "@/lib/calculations";

const FEE_PERCENT = Math.round(BROKER_FEE_RATE * 100);

/**
 * The house rules, in plain language. Sits on the market page as a
 * collapsible block so it's available without shouting over the market
 * itself.
 *
 * The point of this existing at all: the displayed rate is a quote against
 * the current pools, and a real bet almost always comes in under it. That's
 * inherent to pool betting, not a bug, but it feels like a bait-and-switch to
 * anyone who wasn't told up front -- so tell them up front.
 */
export default function PayoutExplainer({ className = "" }: { className?: string }) {
  return (
    <details
      className={`border border-border bg-surface rounded-xl overflow-hidden group ${className}`}
    >
      <summary className="px-4 py-3 text-sm text-ink cursor-pointer select-none hover:bg-surfaceHover transition-colors focus-ring">
        How payouts are calculated
      </summary>

      <div className="px-4 pb-4 pt-1 text-xs text-muted leading-relaxed space-y-3">
        <p>
          Every credit bet on a side goes into that side's pool. When the market
          resolves, the winning side splits the losing pool between them, in
          proportion to how much each person staked, on top of getting their own
          stake back.
        </p>

        <p>
          <span className="text-ink">Your odds aren't locked in.</span> The rate shown
          on a market is what it pays right now, and it keeps moving until betting
          closes. More money joining your side shrinks your share; more money on the
          other side grows it. What you actually collect is worked out from the pools
          as they stand when the market closes — not from the number that was showing
          when you placed your bet.
        </p>

        <p>
          Your own bet moves it too. Staking 100 on a market showing 1.95× won't pay
          1.95×, because your 100 joins the pool you're backing and dilutes it. The
          bet form prices your specific stake as you type it, and that figure is the
          honest one.
        </p>

        <p>
          The house keeps <span className="text-ink">{FEE_PERCENT}% of winnings</span> as
          a broker's fee. It comes out of what you win, never out of your stake coming
          back — so a win is always a win, even a narrow one.
        </p>

        <p>
          If nobody bet the winning side, there's no one to pay, so every stake is
          refunded in full with no fee taken.
        </p>

        <p className="text-[11px] pt-1 border-t border-border">
          Credits are for the game only. They aren't currency and carry no cash value.
        </p>
      </div>
    </details>
  );
}
