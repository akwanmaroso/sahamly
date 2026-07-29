import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTickerData } from "@/lib/market-data";
import { computeIndicators } from "@/lib/indicators/compute";
import { computeFlowMetrics } from "@/lib/broker-flow/compute-flow-metrics";
import { fetchYahooFundamentals, yahooToFundamentals } from "@/lib/market-data/yahoo-fundamentals";
import { fetchInsiderData } from "@/lib/market-data/insider-trades";
import { readScrapedFundamentals, readScrapedInsiderData } from "@/lib/market-data/scraped-data";

/**
 * Fetches raw market data, computes deterministic indicators, and inserts a
 * `snapshots` row for a ticker. Takes an injected Supabase client so it works
 * both from authenticated request contexts (server client) and from
 * cron/service-role contexts (admin client).
 *
 * Data priority: own scraper tables → external APIs (Yahoo/yfinance) → IDX raw.
 */
export async function createSnapshot(
  supabase: SupabaseClient,
  ticker: { id: string; symbol: string }
) {
  // Fetch all data sources in parallel — scraped data + external APIs + raw IDX
  const [raw, scrapedFundamentals, scrapedInsider, yahooData, externalInsider] =
    await Promise.all([
      fetchTickerData(ticker.symbol),
      readScrapedFundamentals(supabase, ticker.id).catch(() => null),
      readScrapedInsiderData(supabase, ticker.id).catch(() => null),
      fetchYahooFundamentals(ticker.symbol).catch(() => null),
      fetchInsiderData(ticker.symbol).catch(() => null),
    ]);
  const indicators = computeIndicators(raw.ohlcv);

  // Use scraped insider data first, fall back to yfinance
  const insiderData = scrapedInsider ?? externalInsider;

  // Fundamentals priority: scraped → Yahoo → raw IDX
  const fundamentals = scrapedFundamentals
    ? { ...raw.fundamentals, ...scrapedFundamentals, marketCap: raw.fundamentals.marketCap }
    : yahooData
      ? yahooToFundamentals(yahooData, raw.fundamentals)
      : raw.fundamentals;

  // Compute broker flow metrics from DB (no API call)
  const flowMetrics = await computeFlowMetrics(supabase, ticker.id);

  // Merge flow metrics into raw flow data
  const flowData = {
    ...raw.flow,
    ...(flowMetrics
      ? {
          consecutiveForeignBuyDays: flowMetrics.consecutiveForeignBuyDays,
          flowMetrics,
        }
      : {}),
  };

  const { data, error } = await supabase
    .from("snapshots")
    .insert({
      ticker_id: ticker.id,
      as_of_date: raw.asOfDate,
      price_data: { ohlcv: raw.ohlcv, indicators, source: raw.source },
      fundamental_data: fundamentals,
      flow_data: flowData,
      ...(insiderData ? { insider_data: insiderData } : {}),
    })
    .select("id, as_of_date")
    .single();

  if (error) {
    throw new Error(`Failed to create snapshot for ${ticker.symbol}: ${error.message}`);
  }

  return data;
}
