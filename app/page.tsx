"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Market } from "@/lib/types";
import MarketCard from "@/components/MarketCard";
import { useAuth } from "@/components/AuthProvider";
import { useNow } from "@/lib/useNow";
import WelcomePanel from "@/components/WelcomePanel";

export default function HomePage() {
  const { profile } = useAuth();
  // Ticks so a market moves itself out of "open" the moment it closes.
  const now = useNow(15000);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadMarkets() {
    const { data } = await supabase
      .from("markets")
      .select("*")
      .order("created_at", { ascending: false });
    setMarkets((data as Market[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadMarkets();
  }, []);

  // Three states now that markets can be closed by hand: taking bets,
  // closed but not yet called, and settled. Lumping the middle group in with
  // "open" would invite people to click in and find betting already shut.
  // Voided counts as settled: it's done, it just never had an outcome.
  const isSettled = (m: Market) => m.resolved || m.voided;
  const open = markets.filter(
    (m) => !isSettled(m) && new Date(m.close_time).getTime() > now
  );
  const awaitingResult = markets.filter(
    (m) => !isSettled(m) && new Date(m.close_time).getTime() <= now
  );
  const resolved = markets.filter(isSettled);

  return (
    <>
      <WelcomePanel />

      <h2 className="font-display text-2xl font-700 text-ink mb-1">Open markets</h2>
      <p className="text-muted text-sm mb-6">Prices move as bets come in.</p>

      {loading && <p className="text-muted text-sm">Loading markets…</p>}

      {!loading && open.length === 0 && (
        <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted">
          No open markets yet.{" "}
          {profile?.is_admin ? (
            <a href="/markets/new" className="text-brand hover:underline">
              Create the first one
            </a>
          ) : (
            "Check back once an admin opens one."
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mb-12">
        {open.map((m) => (
          <MarketCard key={m.id} market={m} />
        ))}
      </div>

      {awaitingResult.length > 0 && (
        <>
          <h2 className="font-display text-xl font-700 text-ink mb-1">Awaiting results</h2>
          <p className="text-muted text-sm mb-4">
            Closed to new bets, outcome not called yet.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 mb-12">
            {awaitingResult.map((m) => (
              <MarketCard key={m.id} market={m} />
            ))}
          </div>
        </>
      )}

      {resolved.length > 0 && (
        <>
          <h2 className="font-display text-xl font-700 text-ink mb-4">Resolved</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {resolved.map((m) => (
              <MarketCard key={m.id} market={m} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
