"use client";

import { useEffect, useState } from "react";

/**
 * A clock that re-renders on an interval, so countdowns tick down on their
 * own and a market visibly flips to closed at the moment it closes instead
 * of waiting for the next refresh.
 *
 * Starts from a fixed value and only begins ticking after mount, which keeps
 * server-rendered markup and the first client render identical.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
