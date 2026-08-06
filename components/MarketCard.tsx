import Link from "next/link";
import { Market } from "@/lib/types";
import { formatProbability, impliedYesPrice } from "@/lib/calculations";
import { formatCloseTime, timeUntilClose } from "@/lib/time";

export default function MarketCard({ market }: { market: Market }) {
  const yes = impliedYesPrice(market);
  const totalPool = market.yes_pool + market.no_pool;
  const { closed, label } = timeUntilClose(market.close_time);

  return (
    <Link
      href={`/markets/${market.id}`}
      className="block border border-border bg-surface rounded-xl p-5 hover:border-brand/60 hover:bg-surfaceHover transition-colors focus-ring"
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-display font-600 text-ink leading-snug">{market.title}</h3>
        <div className="shrink-0 text-right">
          <div className={`font-mono text-2xl font-600 ${yes >= 0.5 ? "text-yes" : "text-no"}`}>
            {formatProbability(yes)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted">chance YES</div>
        </div>
      </div>

      {/* Probability bar */}
      <div className="mt-4 h-1.5 w-full rounded-full bg-bg overflow-hidden">
        <div className="h-full bg-yes" style={{ width: `${yes * 100}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{totalPool.toLocaleString()} cr staked</span>
        <span>
          {market.resolved ? (
            `Resolved: ${market.winning_side?.toUpperCase()}`
          ) : closed ? (
            "Closed — awaiting result"
          ) : (
            <span title={formatCloseTime(market.close_time)}>Closes in {label}</span>
          )}
        </span>
      </div>
    </Link>
  );
}
