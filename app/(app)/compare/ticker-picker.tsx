"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type Ticker = { id: string; symbol: string };

export function TickerPicker({ tickers }: { tickers: Ticker[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("tickers")?.split(",").filter(Boolean) ?? [];
  const [selected, setSelected] = useState<string[]>(current);

  function toggle(symbol: string) {
    setSelected((prev) => {
      if (prev.includes(symbol)) return prev.filter((s) => s !== symbol);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, symbol];
    });
  }

  function go() {
    if (selected.length >= 2) {
      router.push(`/compare?tickers=${selected.join(",")}`);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tickers.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => toggle(t.symbol)}
          className={`rounded border px-3 py-1.5 font-mono text-xs font-medium transition-colors ${
            selected.includes(t.symbol)
              ? "border-amber bg-amber/15 text-amber"
              : "border-line bg-surface text-muted hover:text-ink"
          }`}
        >
          {t.symbol}
        </button>
      ))}
      <button
        type="button"
        onClick={go}
        disabled={selected.length < 2}
        className="ml-2 rounded bg-amber px-4 py-1.5 font-mono text-xs font-bold text-bg transition-opacity disabled:opacity-30"
      >
        Compare {selected.length >= 2 ? `(${selected.length})` : ""}
      </button>
    </div>
  );
}
