import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddTickerForm } from "./add-ticker-form";
import { toggleTickerActive, deleteTicker } from "./actions";

export default async function TickersPage() {
  const supabase = await createClient();
  const { data: tickers, error } = await supabase
    .from("tickers")
    .select("id, symbol, name, sector, active, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Watchlist
          </h1>
          <p className="text-sm text-muted">Manage the tickers tracked by the pipeline</p>
        </div>
        <Link href="/" className="text-sm font-medium text-muted hover:text-amber">
          ← Dashboard
        </Link>
      </div>

      <AddTickerForm />

      {error && (
        <p className="rounded border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-loss">
          Failed to load tickers: {error.message}
        </p>
      )}

      {tickers?.length === 0 && (
        <div className="rounded border border-dashed border-line py-16 text-center text-muted">
          No tickers yet. Add one above to get started.
        </div>
      )}

      <div className="flex flex-col divide-y divide-line border-y border-line">
        {tickers?.map((ticker) => (
          <div
            key={ticker.id}
            className={`grid grid-cols-2 gap-x-4 gap-y-1.5 bg-surface px-4 py-3 sm:grid-cols-[7rem_1fr_6rem_auto] sm:items-center sm:gap-4 ${
              !ticker.active ? "opacity-50" : ""
            }`}
          >
            <span className="font-mono text-sm font-semibold text-ink">{ticker.symbol}</span>
            <span className="truncate text-sm text-ink">
              {ticker.name}
              {ticker.sector && <span className="ml-2 text-xs text-muted">{ticker.sector}</span>}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-xs text-muted">
              <span aria-hidden className={ticker.active ? "text-gain" : "text-muted"}>
                ●
              </span>
              {ticker.active ? "ACTIVE" : "PAUSED"}
            </span>
            <div className="flex justify-end gap-4">
              <form action={toggleTickerActive.bind(null, ticker.id, ticker.active)}>
                <button
                  type="submit"
                  className="font-mono text-xs font-medium text-muted hover:text-amber"
                >
                  {ticker.active ? "Deactivate" : "Activate"}
                </button>
              </form>
              <form action={deleteTicker.bind(null, ticker.id)}>
                <button type="submit" className="font-mono text-xs font-medium text-loss hover:underline">
                  Remove
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
