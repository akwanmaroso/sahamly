import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTickerData } from "@/lib/market-data";
import { computeIndicators } from "@/lib/indicators/compute";

/**
 * Fetches raw market data, computes deterministic indicators, and inserts a
 * `snapshots` row for a ticker. Takes an injected Supabase client so it works
 * both from authenticated request contexts (server client) and from
 * cron/service-role contexts (admin client).
 */
export async function createSnapshot(
  supabase: SupabaseClient,
  ticker: { id: string; symbol: string }
) {
  const raw = await fetchTickerData(ticker.symbol);
  const indicators = computeIndicators(raw.ohlcv);

  const { data, error } = await supabase
    .from("snapshots")
    .insert({
      ticker_id: ticker.id,
      as_of_date: raw.asOfDate,
      price_data: { ohlcv: raw.ohlcv, indicators },
      fundamental_data: raw.fundamentals,
      flow_data: raw.flow,
    })
    .select("id, as_of_date")
    .single();

  if (error) {
    throw new Error(`Failed to create snapshot for ${ticker.symbol}: ${error.message}`);
  }

  return data;
}
