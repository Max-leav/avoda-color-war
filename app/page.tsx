"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Market } from "@/lib/types";
import MarketCard from "@/components/MarketCard";
import Ticker from "@/components/Ticker";

export default function HomePage() {
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

  const open = markets.filter((m) => !m.resolved);
  const resolved = markets.filter((m) => m.resolved);

  return (
    <>
      <div className="-mx-4 -mt-8 mb-8">
        <Ticker markets={open} />
      </div>

      <h1 className="font-display text-3xl font-700 text-ink mb-1">Open markets</h1>
      <p className="text-muted text-sm mb-6">
        All credits are play-money. Prices move as bets come in.
      </p>

      {loading && <p className="text-muted text-sm">Loading markets…</p>}

      {!loading && open.length === 0 && (
        <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted">
          No open markets yet.{" "}
          <a href="/markets/new" className="text-brand hover:underline">
            Create the first one
          </a>
          .
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mb-12">
        {open.map((m) => (
          <MarketCard key={m.id} market={m} />
        ))}
      </div>

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
