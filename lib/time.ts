/**
 * Close-time formatting, shared by the market cards and the market page so
 * they can't drift into saying different things about the same timestamp.
 *
 * Everything here renders in the viewer's own timezone. That matters more
 * than it sounds: close times are stored as UTC, and showing a raw UTC time
 * to someone at camp would be off by hours in a way that's easy to miss and
 * ugly when a market closes "early" from their point of view.
 */

/** e.g. "Sat, Aug 8, 7:30 PM" -- absolute, unambiguous, local. */
export function formatCloseTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * How far a close time is from now, as a rough magnitude plus whether it's
 * already passed. Callers phrase it ("Closes in 3h 20m" / "Closed 5m ago"),
 * since the same number reads differently in each direction.
 */
export function timeUntilClose(
  iso: string,
  now: number = Date.now()
): { closed: boolean; label: string } {
  const diffMs = new Date(iso).getTime() - now;
  const closed = diffMs <= 0;
  const seconds = Math.floor(Math.abs(diffMs) / 1000);

  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let label: string;
  if (seconds < 60) {
    label = `${seconds}s`;
  } else if (minutes < 60) {
    label = `${minutes}m`;
  } else if (hours < 24) {
    // Show minutes alongside hours -- "2h" when it's really 2h59m is the
    // difference between getting your bet in and missing it.
    const remainderMinutes = minutes % 60;
    label = remainderMinutes > 0 ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
  } else {
    const remainderHours = hours % 24;
    label = remainderHours > 0 ? `${days}d ${remainderHours}h` : `${days}d`;
  }

  return { closed, label };
}
