import { Market, Bet } from "./types";

// ============================================================================
// PARI-MUTUEL PRICING
//
// This market uses a pari-mutuel pool model, the same math used by horse-race
// tote boards: every stake on a side goes into that side's pool. The
// "price" (implied probability) is just each side's share of the total pool.
// When a market resolves, the losing pool is split among winners in
// proportion to how much each of them staked, on top of getting their own
// stake back.
//
// This is simpler and more transparent than an order-book or AMM model
// (like Kalshi/Polymarket use), which is why it's a good starting point for
// a small self-hosted market. It has one tradeoff worth knowing: the price
// only updates in discrete jumps as bets come in, and early bettors on a
// side that ends up crowded get diluted the same as everyone else on that
// side (there's no "locking in" a price the way an order book allows).
// ============================================================================

const DEFAULT_PROBABILITY = 0.5;

/** Implied probability of YES, given the current pools. */
export function impliedYesPrice(market: Pick<Market, "yes_pool" | "no_pool">): number {
  const total = market.yes_pool + market.no_pool;
  if (total <= 0) return DEFAULT_PROBABILITY;
  return market.yes_pool / total;
}

/** Implied probability of NO. */
export function impliedNoPrice(market: Pick<Market, "yes_pool" | "no_pool">): number {
  return 1 - impliedYesPrice(market);
}

/** Price (0-1) for whichever side is passed in. */
export function priceForSide(
  market: Pick<Market, "yes_pool" | "no_pool">,
  side: "yes" | "no"
): number {
  return side === "yes" ? impliedYesPrice(market) : impliedNoPrice(market);
}

/**
 * Payout for a single winning bet once a market resolves.
 * Winners get their own stake back, plus a proportional share of the
 * entire losing pool based on how big their stake was relative to the
 * total winning pool.
 */
export function calculatePayout(
  bet: Pick<Bet, "amount" | "side">,
  market: Pick<Market, "yes_pool" | "no_pool" | "winning_side">
): number {
  if (!market.winning_side || bet.side !== market.winning_side) return 0;

  const winningPool = market.winning_side === "yes" ? market.yes_pool : market.no_pool;
  const losingPool = market.winning_side === "yes" ? market.no_pool : market.yes_pool;

  if (winningPool <= 0) return 0;

  const shareOfLosingPool = (bet.amount / winningPool) * losingPool;
  return round2(bet.amount + shareOfLosingPool);
}

/** Round to 2 decimal places (credits behave like currency amounts). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Format a probability (0-1) as a percentage string, e.g. 0.634 -> "63%". */
export function formatProbability(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Format a credits amount, e.g. 1234.5 -> "1,234.50". */
export function formatCredits(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
