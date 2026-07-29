import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchBatchBrokerSummary,
  fetchBatchForeignFlow,
} from "@/lib/market-data/index-alpha";
import { classifyBroker } from "@/lib/market-data/broker-codes";

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function tradingDaysAgo(days: number): string {
  // Approximate: weekdays only, overshoot slightly to account for holidays
  const calendar = Math.ceil(days * 1.5);
  const d = new Date();
  d.setDate(d.getDate() - calendar);
  return toIsoDate(d);
}

/**
 * Batch-fetch broker summary + foreign flow for all given tickers
 * from Index Alpha, then upsert into the broker_flows table.
 *
 * Uses 2 API calls total (batch endpoints) regardless of ticker count.
 * Skips gracefully if INDEX_ALPHA_API_KEY is not set.
 */
export async function fetchAndStoreBrokerFlows(
  supabase: SupabaseClient,
  tickers: { id: string; symbol: string }[],
  lookbackDays = 20
): Promise<void> {
  if (!process.env.INDEX_ALPHA_API_KEY) {
    console.warn(
      "[broker-flow] INDEX_ALPHA_API_KEY not set, skipping broker flow fetch"
    );
    return;
  }

  if (tickers.length === 0) return;

  const symbols = tickers.map((t) => t.symbol);
  const symbolToId = new Map(tickers.map((t) => [t.symbol, t.id]));
  const from = tradingDaysAgo(lookbackDays);
  const to = toIsoDate(new Date());

  // 2 API calls total
  const [brokerData, flowData] = await Promise.all([
    fetchBatchBrokerSummary(symbols, from, to),
    fetchBatchForeignFlow(symbols, from, to),
  ]);

  // Build upsert rows from broker summary data
  const rows: Array<{
    ticker_id: string;
    trade_date: string;
    broker_code: string;
    broker_type: "foreign" | "domestic";
    buy_volume: number;
    buy_value: number;
    sell_volume: number;
    sell_value: number;
  }> = [];

  for (const [symbol, brokers] of brokerData) {
    const tickerId = symbolToId.get(symbol);
    if (!tickerId) continue;

    for (const b of brokers) {
      rows.push({
        ticker_id: tickerId,
        trade_date: to, // broker summary is aggregated over the range
        broker_code: b.brokerCode,
        broker_type: b.type,
        buy_volume: b.buyVolume,
        buy_value: b.buyValue,
        sell_volume: b.sellVolume,
        sell_value: b.sellValue,
      });
    }
  }

  // Build upsert rows from daily foreign flow (per-date granularity)
  // We store foreign flow as a pseudo-broker "___FOREIGN" for easy querying
  for (const [symbol, days] of flowData) {
    const tickerId = symbolToId.get(symbol);
    if (!tickerId) continue;

    for (const day of days) {
      rows.push({
        ticker_id: tickerId,
        trade_date: day.date,
        broker_code: "___FOREIGN_NET",
        broker_type: "foreign",
        buy_volume: 0,
        buy_value: Math.max(day.netForeign, 0),
        sell_volume: 0,
        sell_value: Math.max(-day.netForeign, 0),
      });
    }
  }

  if (rows.length === 0) return;

  // Upsert in chunks to avoid payload limits
  const CHUNK_SIZE = 500;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("broker_flows").upsert(chunk, {
      onConflict: "ticker_id,trade_date,broker_code",
      ignoreDuplicates: false,
    });
    if (error) {
      console.error("[broker-flow] Upsert error:", error.message);
    }
  }
}
