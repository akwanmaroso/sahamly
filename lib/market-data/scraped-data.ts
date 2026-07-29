/**
 * Read data from scraper tables (replaces external API calls when available).
 *
 * The Python scraper writes to ticker_fundamentals, ticker_insider_data,
 * foreign_daily_flow, and running_trades. This module reads from those
 * tables so the Next.js pipeline doesn't need external API keys.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RawFundamentals } from "./types";
import type { InsiderData } from "./insider-trades";

/**
 * Read cached fundamentals from the scraper's ticker_fundamentals table.
 * Returns null if no scraped data exists (caller should fall back to Yahoo).
 */
export async function readScrapedFundamentals(
  supabase: SupabaseClient,
  tickerId: string
): Promise<RawFundamentals | null> {
  const { data, error } = await supabase
    .from("ticker_fundamentals")
    .select("data")
    .eq("ticker_id", tickerId)
    .single();

  if (error || !data?.data) return null;

  const d = data.data as Record<string, unknown>;

  return {
    marketCap: 0, // computed from price × listed shares in create-snapshot
    peRatio: Number(d.pe_ratio ?? 0),
    pbvRatio: Number(d.pbv_ratio ?? 0),
    epsGrowthYoy: 0,
    revenueGrowthYoy: 0,
    roe: Number(d.roe ?? 0),
    debtToEquity: Number(d.de_ratio ?? 0),
    dividendYield: 0,
    sectorAvgPe: Number(d.sector_avg_pe ?? 0),
    sectorAvgPbv: Number(d.sector_avg_pbv ?? 0),
  };
}

/**
 * Read cached insider data from the scraper's ticker_insider_data table.
 * Returns null if no scraped data exists (caller should fall back to yfinance).
 */
export async function readScrapedInsiderData(
  supabase: SupabaseClient,
  tickerId: string
): Promise<InsiderData | null> {
  const { data, error } = await supabase
    .from("ticker_insider_data")
    .select("data")
    .eq("ticker_id", tickerId)
    .single();

  if (error || !data?.data) return null;

  const d = data.data as Record<string, unknown>;
  const transactions = Array.isArray(d.transactions) ? d.transactions : [];
  const holders = Array.isArray(d.holders) ? d.holders : [];

  return {
    transactions: transactions.map((t: Record<string, unknown>) => ({
      date: String(t.date ?? ""),
      insider: String(t.insider ?? "Unknown"),
      position: String(t.position ?? ""),
      transaction: String(t.transaction ?? ""),
      shares: Number(t.shares ?? 0),
      value: Number(t.value ?? 0),
    })),
    holders: {
      insiderPct: undefined,
      institutionPct: undefined,
    },
    institutions: holders.map((h: Record<string, unknown>) => ({
      holder: String(h.name ?? ""),
      shares: Number(h.shares ?? 0),
      pctHeld: Number(h.pct ?? 0),
      value: 0,
    })),
    netInsiderSentiment: (d.net_sentiment as InsiderData["netInsiderSentiment"]) ?? "neutral",
    recentActivityScore: Number(d.activity_score ?? 0),
  };
}
