import { Market } from "./types";

/**
 * A market always has exactly two sides, stored as 'yes' and 'no'. These are
 * just what they're CALLED -- an admin can name them after teams ("Blue",
 * "Gold") without anything underneath changing.
 *
 * Null or blank falls back to YES / NO, so markets created before labels
 * existed keep reading the way they always did.
 */

export const DEFAULT_YES_LABEL = "YES";
export const DEFAULT_NO_LABEL = "NO";

export const MAX_LABEL_LENGTH = 20;

export function sideLabel(
  market: Pick<Market, "yes_label" | "no_label">,
  side: "yes" | "no"
): string {
  const raw = (side === "yes" ? market.yes_label : market.no_label) ?? "";
  const trimmed = raw.trim();
  if (trimmed !== "") return trimmed;
  return side === "yes" ? DEFAULT_YES_LABEL : DEFAULT_NO_LABEL;
}

/** The winning side's name on a resolved market, or null if unresolved. */
export function winningLabel(
  market: Pick<Market, "yes_label" | "no_label" | "winning_side">
): string | null {
  if (!market.winning_side) return null;
  return sideLabel(market, market.winning_side);
}

/** Returns an error message, or null when the name is usable. Blank is fine. */
export function validateSideLabel(input: string): string | null {
  const value = input.trim();
  if (value === "") return null;
  if (value.length > MAX_LABEL_LENGTH) {
    return `Side names must be ${MAX_LABEL_LENGTH} characters or fewer.`;
  }
  return null;
}

/** Blank becomes null so the database stores "unset" rather than "". */
export function normalizeSideLabel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().replace(/\s+/g, " ");
  return value === "" ? null : value.slice(0, MAX_LABEL_LENGTH);
}
