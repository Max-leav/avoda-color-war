"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Market, Bet } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import BetForm from "@/components/BetForm";
import YourPosition from "@/components/YourPosition";
import {
  formatProbability,
  impliedYesPrice,
  impliedNoPrice,
  isRefundedMarket,
} from "@/lib/calculations";
import { formatCloseTime, timeUntilClose } from "@/lib/time";
import { useNow } from "@/lib/useNow";

export default function MarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, profile } = useAuth();
  const [market, setMarket] = useState<Market | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCloseTime, setNewCloseTime] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleNote, setScheduleNote] = useState<string | null>(null);
  const now = useNow();

  async function load() {
    const [{ data: m }, { data: b }] = await Promise.all([
      supabase.from("markets").select("*").eq("id", id).single(),
      supabase
        .from("bets")
        .select("*")
        .eq("market_id", id)
        .order("timestamp", { ascending: false })
        .limit(25),
    ]);
    setMarket(m as Market | null);
    setBets((b as Bet[]) ?? []);
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function updateSchedule(payload: { closeNow?: true; closeTime?: string }) {
    setScheduleError(null);
    setScheduleNote(null);

    if (
      payload.closeNow &&
      !confirm("Close this market to new bets right now? This can't be undone.")
    ) {
      return;
    }

    setScheduling(true);
    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/markets/${id}/schedule`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshSession?.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not update the market.");

      setNewCloseTime("");
      setScheduleNote(
        payload.closeNow
          ? "Market closed. No new bets can be placed."
          : "Close time updated."
      );
      await load();
    } catch (e: any) {
      setScheduleError(e.message);
    } finally {
      setScheduling(false);
    }
  }

  async function resolve(winningSide: "yes" | "no") {
    setError(null);
    if (!confirm(`Resolve this market to ${winningSide.toUpperCase()}? This cannot be undone.`)) {
      return;
    }
    setResolving(true);
    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/markets/${id}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshSession?.access_token}`,
        },
        body: JSON.stringify({ winningSide }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not resolve market.");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setResolving(false);
    }
  }

  if (!market) return <p className="text-muted text-sm">Loading…</p>;

  const yes = impliedYesPrice(market);
  const no = impliedNoPrice(market);
  const isCreator = session?.user?.id === market.creator_id;
  const canManage = !!session && (isCreator || !!profile?.is_admin);
  const { closed: closedToBets, label: closeLabel } = timeUntilClose(
    market.close_time,
    now
  );
  // Closed but not yet resolved -- the state manual closing creates a lot of.
  const awaitingResult = closedToBets && !market.resolved;

  // datetime-local wants "YYYY-MM-DDTHH:mm" in *local* time, and toISOString
  // returns UTC, so slicing an ISO string here would silently shift the
  // prefilled value by your timezone offset.
  function toLocalInputValue(date: Date) {
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  return (
    <div className="grid md:grid-cols-3 gap-8">
      <div className="md:col-span-2">
        <h1 className="font-display text-2xl font-700 text-ink mb-2">{market.title}</h1>
        {market.description && (
          <p className="text-muted text-sm mb-4 leading-relaxed">{market.description}</p>
        )}

        {/* Close time, for everyone. Read-only -- changing it lives in the
            manage panel further down, which only admins and the creator see. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs mb-6">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              market.resolved ? "bg-muted" : closedToBets ? "bg-no" : "bg-yes"
            }`}
            aria-hidden="true"
          />
          <span className={market.resolved || closedToBets ? "text-muted" : "text-yes"}>
            {market.resolved ? "Resolved" : closedToBets ? "Closed" : "Open for bets"}
          </span>
          <span className="text-muted">·</span>
          <span className="text-muted">
            {closedToBets ? "Closed" : "Closes"} {formatCloseTime(market.close_time)}
          </span>
          {!market.resolved && (
            <>
              <span className="text-muted">·</span>
              <span className={closedToBets ? "text-muted" : "text-ink font-mono"}>
                {closedToBets ? `${closeLabel} ago` : `${closeLabel} left`}
              </span>
            </>
          )}
        </div>

        <div className="flex gap-6 mb-6">
          <div>
            <div className="font-mono text-3xl font-600 text-yes">{formatProbability(yes)}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted">YES</div>
          </div>
          <div>
            <div className="font-mono text-3xl font-600 text-no">{formatProbability(no)}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted">NO</div>
          </div>
          <div className="ml-auto text-right">
            <div className="font-mono text-lg text-ink">
              {(market.yes_pool + market.no_pool).toLocaleString()}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted">credits staked</div>
          </div>
        </div>

        <YourPosition market={market} />

        {market.resolved && (
          <div className="border border-border bg-surface rounded-xl p-4 mb-6 text-sm">
            Resolved:{" "}
            <span className={market.winning_side === "yes" ? "text-yes" : "text-no"}>
              {market.winning_side?.toUpperCase()}
            </span>{" "}
            won.{" "}
            {isRefundedMarket(market)
              ? `Nobody bet that side, so every stake was refunded in full.`
              : "Payouts have been credited to winning bettors."}
          </div>
        )}

        {awaitingResult && (
          <div className="border border-brand/40 bg-brand/5 rounded-xl p-4 mb-6 text-sm text-ink">
            Closed to new bets. Waiting on the result.
          </div>
        )}

        {canManage && !market.resolved && !closedToBets && (
          <div className="border border-border bg-surface rounded-xl p-4 mb-6">
            <h2 className="font-display font-600 text-ink mb-1">Manage this market</h2>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              You can move the close time or shut this market early -- but only while
              it's still open, since reopening a closed market would let people bet on
              something they might already know.
            </p>

            <button
              onClick={() => updateSchedule({ closeNow: true })}
              disabled={scheduling}
              className="w-full bg-no/10 border border-no text-no rounded-lg py-2 text-sm font-600 hover:bg-no/20 transition-colors disabled:opacity-40 mb-4"
            >
              {scheduling ? "Working…" : "Close now"}
            </button>

            <label className="block text-xs uppercase tracking-wide text-muted mb-1">
              Or move the close time
            </label>
            <input
              type="datetime-local"
              value={newCloseTime || toLocalInputValue(new Date(market.close_time))}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setNewCloseTime(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-2"
            />
            <button
              onClick={() =>
                updateSchedule({ closeTime: new Date(newCloseTime).toISOString() })
              }
              disabled={scheduling || !newCloseTime}
              className="w-full border border-border text-ink rounded-lg py-2 text-sm font-600 hover:border-brand transition-colors disabled:opacity-40"
            >
              Update close time
            </button>

            {scheduleError && <p className="text-xs text-no mt-2">{scheduleError}</p>}
            {scheduleNote && <p className="text-xs text-yes mt-2">{scheduleNote}</p>}
          </div>
        )}

        {isCreator && !market.resolved && (
          <div className="border border-brand/40 bg-brand/5 rounded-xl p-4 mb-6">
            <p className="text-sm text-ink mb-3">
              You created this market. Resolve it once the outcome is known:
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => resolve("yes")}
                disabled={resolving}
                className="flex-1 bg-yes/10 border border-yes text-yes rounded-lg py-2 text-sm font-600 hover:bg-yes/20 transition-colors disabled:opacity-40"
              >
                Resolve YES
              </button>
              <button
                onClick={() => resolve("no")}
                disabled={resolving}
                className="flex-1 bg-no/10 border border-no text-no rounded-lg py-2 text-sm font-600 hover:bg-no/20 transition-colors disabled:opacity-40"
              >
                Resolve NO
              </button>
            </div>
            {error && <p className="text-xs text-no mt-2">{error}</p>}
          </div>
        )}

        <h2 className="font-display font-600 text-ink mb-3">Recent bets</h2>
        <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
          {bets.length === 0 && (
            <p className="text-muted text-sm p-4">No bets placed yet — be the first.</p>
          )}
          {bets.map((b) => (
            <div key={b.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className={b.side === "yes" ? "text-yes" : "text-no"}>
                {b.side.toUpperCase()}
              </span>
              <span className="font-mono text-ink">{b.amount.toLocaleString()} cr</span>
              <span className="font-mono text-muted text-xs">
                @ {formatProbability(b.price)}
              </span>
              <span className="text-muted text-xs">
                {new Date(b.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <BetForm market={market} onPlaced={load} />
      </div>
    </div>
  );
}
