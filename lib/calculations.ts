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
// The house takes a cut (BROKER_FEE_RATE) out of the losing pool before
// it's split among the winners, so winners collect their stake plus 95%
// of what they'd otherwise have won.
//
// This is simpler and more transparent than an order-book or AMM model
// (like Kalshi/Polymarket use), which is why it's a good starting point for
// a small self-hosted market. It has one tradeoff worth knowing: the price
// only updates in discrete jumps as bets come in, and early bettors on a
// side that ends up crowded get diluted the same as everyone else on that
// side (there's no "locking in" a price the way an order book allows).
// ============================================================================

const DEFAULT_PROBABILITY = 0.5;

/**
 * The house's cut, taken on winnings only -- not on the stake coming back,
 * and not on refunds.
 *
 * Taking it off the gross payout instead would mean a narrow win could
 * return less than was staked: bet 100, win 2 in profit, and 5% of 102 is
 * 5.10, so you'd hand back 96.90 having *won* the bet. Charging the rake on
 * winnings alone keeps "I was right" and "I made money" the same statement,
 * which is the version people can reason about. It's also how a tote board
 * does it: the takeout comes out of the losing pool before it's split up.
 *
 * To switch to a cut of the gross payout instead, apply the rate to the
 * whole return in calculatePayout rather than to shareOfLosingPool.
 */
export const BROKER_FEE_RATE = 0.05;

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
  if (!market.winning_side) return 0;

  const winningPool = market.winning_side === "yes" ? market.yes_pool : market.no_pool;
  const losingPool = market.winning_side === "yes" ? market.no_pool : market.yes_pool;

  // Nobody backed the winning side, so there's no one to hand the losing pool
  // to. Refund every stake instead of destroying it -- the alternative is a
  // market where everyone piles onto the obvious answer, the upset lands, and
  // the entire pot silently vanishes. No fee on a refund: nothing was won.
  if (winningPool <= 0) return round2(bet.amount);

  if (bet.side !== market.winning_side) return 0;

  const shareOfLosingPool = (bet.amount / winningPool) * losingPool;
  const fee = shareOfLosingPool * BROKER_FEE_RATE;
  return round2(bet.amount + shareOfLosingPool - fee);
}

/**
 * The broker's fee withheld from a winning bet, for showing people what was
 * taken. Zero for losing bets and for refunds.
 */
export function calculateFee(
  bet: Pick<Bet, "amount" | "side">,
  market: Pick<Market, "yes_pool" | "no_pool" | "winning_side">
): number {
  if (!market.winning_side || bet.side !== market.winning_side) return 0;

  const winningPool = market.winning_side === "yes" ? market.yes_pool : market.no_pool;
  const losingPool = market.winning_side === "yes" ? market.no_pool : market.yes_pool;
  if (winningPool <= 0) return 0;

  return round2((bet.amount / winningPool) * losingPool * BROKER_FEE_RATE);
}

/**
 * True when a resolved market had no bets on the winning side, meaning every
 * stake gets refunded rather than paid out. Callers use this to label the
 * result honestly instead of showing a "loss" that was actually returned.
 */
export function isRefundedMarket(
  market: Pick<Market, "yes_pool" | "no_pool" | "winning_side">
): boolean {
  if (!market.winning_side) return false;
  const winningPool = market.winning_side === "yes" ? market.yes_pool : market.no_pool;
  return winningPool <= 0;
}

/**
 * What a hypothetical stake would return if its side won, priced against the
 * pools *including* that stake -- because the moment you bet, your own money
 * joins the winning pool and dilutes your share of the losing one. Pricing it
 * against the current pools instead would overstate the payout, and worse,
 * would overstate it most on small markets where it matters most.
 *
 * This is an estimate, not a lock. Every bet placed after yours moves it:
 * more money on your side shrinks it, more on the other side grows it.
 */
export function previewPayout(
  market: Pick<Market, "yes_pool" | "no_pool">,
  side: "yes" | "no",
  stake: number
): {
  stake: number;
  profit: number;
  fee: number;
  total: number;
  multiplier: number;
} {
  if (!Number.isFinite(stake) || stake <= 0) {
    return { stake: 0, profit: 0, fee: 0, total: 0, multiplier: 1 };
  }

  const otherPool = side === "yes" ? market.no_pool : market.yes_pool;
  const sidePoolAfter = (side === "yes" ? market.yes_pool : market.no_pool) + stake;

  // Nobody on the other side yet means there's nothing to win -- you'd just
  // get your own stake back, and there's no fee on that.
  const grossProfit = otherPool > 0 ? (stake / sidePoolAfter) * otherPool : 0;
  const fee = round2(grossProfit * BROKER_FEE_RATE);
  const profit = round2(grossProfit - fee);
  const total = round2(stake + profit);

  return { stake: round2(stake), profit, fee, total, multiplier: total / stake };
}

/** Round to 2 decimal places (credits behave like currency amounts). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The payout rate a side is showing right now, per credit staked, net of the
 * broker's fee. This is the marginal rate -- what a small bet would earn
 * against the pools as they stand.
 *
 * It's a quote, not a promise, and it moves the instant you act on it: your
 * own stake joins the pool you're backing, which dilutes your share of the
 * other one. A big bet on a thin side will come in noticeably under the
 * number shown here, which is why the bet form prices your actual stake
 * separately instead of just multiplying by this.
 *
 * Returns null when nothing is staked on that side yet -- the first bet takes
 * the entire opposing pool, so the rate depends on how big that bet is and
 * there's no single number to show.
 */
export function currentPayoutMultiplier(
  market: Pick<Market, "yes_pool" | "no_pool">,
  side: "yes" | "no"
): number | null {
  const sidePool = side === "yes" ? market.yes_pool : market.no_pool;
  const otherPool = side === "yes" ? market.no_pool : market.yes_pool;

  if (sidePool <= 0) return null;
  if (otherPool <= 0) return 1;

  return 1 + (otherPool / sidePool) * (1 - BROKER_FEE_RATE);
}

/** e.g. 1.9475 -> "1.95x", or "--" when there's no meaningful rate yet. */
export function formatMultiplier(multiplier: number | null): string {
  if (multiplier === null) return "—";
  return `${multiplier.toFixed(2)}×`;
}

/** Format a probability (0-1) as a percentage string, e.g. 0.634 -> "63%". */
export function formatProbability(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Format a credits amount, e.g. 1234.5 -> "1,234.50". */
export function formatCredits(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
