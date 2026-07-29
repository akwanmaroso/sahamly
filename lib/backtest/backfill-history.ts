import { execFile } from "node:child_process";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

type HistoryRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const SCRIPT_PATH = join(process.cwd(), "scripts", "backfill-price-history.py");

/**
 * Fetches 2 years of daily OHLCV from yfinance and upserts into price_history.
 * Returns the number of rows inserted/updated.
 */
export async function backfillPriceHistory(
  supabase: SupabaseClient,
  tickerId: string,
  symbol: string,
  period = "2y"
): Promise<number> {
  const rows = await fetchHistory(symbol, period);
  if (rows.length === 0) return 0;

  // Upsert in batches of 500
  const BATCH = 500;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      ticker_id: tickerId,
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      source: "yfinance",
    }));

    const { error } = await supabase
      .from("price_history")
      .upsert(batch, { onConflict: "ticker_id,date" });

    if (error) throw new Error(`Upsert failed: ${error.message}`);
    upserted += batch.length;
  }

  return upserted;
}

/**
 * Also sync daily OHLCV from the latest snapshot into price_history,
 * so the table stays current without re-running the full backfill.
 */
export async function syncDailyOhlcv(
  supabase: SupabaseClient,
  tickerId: string,
  ohlcv: HistoryRow[]
): Promise<number> {
  if (ohlcv.length === 0) return 0;

  // Only sync the last 5 days to avoid large upserts
  const recent = ohlcv.slice(-5).map((r) => ({
    ticker_id: tickerId,
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    source: "idx",
  }));

  const { error } = await supabase
    .from("price_history")
    .upsert(recent, { onConflict: "ticker_id,date" });

  if (error) throw new Error(`Sync failed: ${error.message}`);
  return recent.length;
}

function fetchHistory(symbol: string, period: string): Promise<HistoryRow[]> {
  return new Promise((resolve, reject) => {
    execFile(
      "python3",
      [SCRIPT_PATH, symbol, period],
      { timeout: 30_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`backfill script failed: ${stderr || error.message}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.error) {
            reject(new Error(parsed.error));
            return;
          }
          if (!Array.isArray(parsed)) {
            reject(new Error("Expected array from backfill script"));
            return;
          }
          resolve(parsed);
        } catch {
          reject(new Error(`Failed to parse backfill output: ${stdout.slice(0, 200)}`));
        }
      }
    );
  });
}
