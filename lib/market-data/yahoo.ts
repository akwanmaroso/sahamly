import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fetchYahooFundamentals, yahooToFundamentals } from "./yahoo-fundamentals";
import type { OhlcvBar, RawFlow, RawFundamentals, RawTickerData } from "./types";

// ---------------------------------------------------------------------------
// Yahoo Finance fallback source (via yfinance).
//
// Used when the IDX endpoints are unreachable. Covers OHLCV + fundamentals,
// but NOT same-day foreign buy/sell or foreign ownership — those are only
// published by IDX, so they come back as 0 and `source` is "yahoo" so
// downstream consumers can tell the difference.
//
// Broker/whale flow metrics are unaffected: computeFlowMetrics() reads the
// scraped broker tables from the database, not this module.
// ---------------------------------------------------------------------------

const OHLCV_SCRIPT_PATH = resolve(process.cwd(), "scripts/backfill-price-history.py");

const EMPTY_FUNDAMENTALS: RawFundamentals = {
  marketCap: 0,
  peRatio: 0,
  pbvRatio: 0,
  epsGrowthYoy: 0,
  revenueGrowthYoy: 0,
  roe: 0,
  debtToEquity: 0,
  dividendYield: 0,
  sectorAvgPe: 0,
  sectorAvgPbv: 0,
};

/** Fetch daily OHLCV for an IDX stock via yfinance. Returns [] on failure. */
async function fetchYahooOhlcv(symbol: string, period = "1y"): Promise<OhlcvBar[]> {
  return new Promise((res) => {
    execFile(
      "python3",
      [OHLCV_SCRIPT_PATH, symbol, period],
      { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          console.warn(`[yahoo] OHLCV script error for ${symbol}:`, err.message);
          res([]);
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          if (!Array.isArray(parsed)) {
            console.warn(
              `[yahoo] ${symbol}: ${parsed?.error ?? "unexpected OHLCV payload"}`
            );
            res([]);
            return;
          }
          res(parsed as OhlcvBar[]);
        } catch {
          console.warn(
            `[yahoo] Failed to parse OHLCV for ${symbol}:`,
            stdout.slice(0, 200)
          );
          res([]);
        }
      }
    );
  });
}

export async function fetchYahooTickerData(symbol: string): Promise<RawTickerData> {
  const [ohlcv, yf] = await Promise.all([
    fetchYahooOhlcv(symbol),
    fetchYahooFundamentals(symbol),
  ]);

  if (ohlcv.length === 0) {
    throw new Error(`No OHLCV data returned for ${symbol} from Yahoo Finance`);
  }

  const sorted = [...ohlcv].sort((a, b) => a.date.localeCompare(b.date));
  const lastBar = sorted[sorted.length - 1];

  const recent20 = sorted.slice(-20);
  const avgVolume20d = Math.round(
    recent20.reduce((s, b) => s + b.volume, 0) / (recent20.length || 1)
  );

  // Foreign flow is IDX-only — left at 0 here, flagged via `source`.
  const flow: RawFlow = {
    avgVolume20d,
    latestVolume: lastBar.volume,
    foreignNetBuyValue: 0,
    foreignNetBuyVolume: 0,
    foreignOwnershipPct: 0,
    consecutiveForeignBuyDays: 0,
  };

  return {
    symbol: symbol.toUpperCase(),
    asOfDate: lastBar.date,
    ohlcv: sorted,
    fundamentals: yf
      ? yahooToFundamentals(yf, EMPTY_FUNDAMENTALS)
      : EMPTY_FUNDAMENTALS,
    flow,
    source: "yahoo",
  };
}
