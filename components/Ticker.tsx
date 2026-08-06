"use client";

import { Market } from "@/lib/types";
import { formatProbability, impliedYesPrice } from "@/lib/calculations";
import { sideLabel } from "@/lib/labels";

// Signature element: a scrolling ticker tape of live market prices, styled
// after a stock exchange board -- fitting for a prediction market. Duplicates
// the list once so the CSS animation loop has no visible seam.
export default function Ticker({ markets }: { markets: Market[] }) {
  if (markets.length === 0) return null;
  const items = [...markets, ...markets];

  return (
    <div className="border-b border-border bg-surface overflow-hidden py-2">
      <div className="ticker-track flex gap-8 whitespace-nowrap w-max">
        {items.map((m, i) => {
          const yes = impliedYesPrice(m);
          return (
            <span key={`${m.id}-${i}`} className="font-mono text-xs flex items-center gap-2">
              <span className="text-muted uppercase tracking-wide">{m.title.slice(0, 40)}</span>
              <span className={yes >= 0.5 ? "text-yes" : "text-no"}>
                {sideLabel(m, "yes")} {formatProbability(yes)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
