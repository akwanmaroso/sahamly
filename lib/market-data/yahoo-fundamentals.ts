import { execFile } from "node:child_process";
import { resolve } from "node:path";
import type { RawFundamentals } from "./types";

type YFinanceResult = {
  symbol: string;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  returnOnEquity: number | null;
  debtToEquity: number | null;
  dividendYield: number | null;
  trailingEps: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  error?: string;
};

const SCRIPT_PATH = resolve(process.cwd(), "scripts/fetch-fundamentals.py");

/**
 * Fetch fundamental data for an IDX stock via yfinance (Python).
 * Returns null if the script fails or yfinance is not installed.
 */
export async function fetchYahooFundamentals(
  symbol: string
): Promise<YFinanceResult | null> {
  return new Promise((resolve) => {
    execFile(
      "python3",
      [SCRIPT_PATH, symbol],
      { timeout: 30_000 },
      (err, stdout, stderr) => {
        if (err) {
          console.warn(
            `[yahoo-fundamentals] Script error for ${symbol}:`,
            err.message
          );
          resolve(null);
          return;
        }

        try {
          const data: YFinanceResult = JSON.parse(stdout.trim());
          if (data.error) {
            console.warn(
              `[yahoo-fundamentals] ${symbol}: ${data.error}`
            );
            resolve(null);
            return;
          }
          resolve(data);
        } catch {
          console.warn(
            `[yahoo-fundamentals] Failed to parse output for ${symbol}:`,
            stdout.slice(0, 200)
          );
          resolve(null);
        }
      }
    );
  });
}

/**
 * Convert Yahoo Finance data to RawFundamentals.
 * Falls back to zeros for any missing fields.
 */
export function yahooToFundamentals(
  yf: YFinanceResult,
  fallback: RawFundamentals
): RawFundamentals {
  return {
    marketCap: yf.marketCap ?? fallback.marketCap,
    peRatio: yf.trailingPE ?? fallback.peRatio,
    pbvRatio: yf.priceToBook ?? fallback.pbvRatio,
    epsGrowthYoy: yf.earningsGrowth ?? fallback.epsGrowthYoy,
    revenueGrowthYoy: yf.revenueGrowth ?? fallback.revenueGrowthYoy,
    roe: yf.returnOnEquity ?? fallback.roe,
    debtToEquity: yf.debtToEquity ?? fallback.debtToEquity,
    dividendYield: yf.dividendYield ?? fallback.dividendYield,
    // Keep IDX sector averages from the existing pipeline (if available)
    sectorAvgPe: fallback.sectorAvgPe,
    sectorAvgPbv: fallback.sectorAvgPbv,
  };
}
