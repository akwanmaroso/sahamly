/**
 * Query all active tickers with their latest snapshot + report data
 * for the screener table.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FlowMetrics, SmartMoneyMetrics, RawFundamentals, OhlcvBar } from "@/lib/market-data/types";

export type ScreenerRow = {
  tickerId: string;
  symbol: string;
  name: string;
  sector: string;
  // Price
  price: number;
  changePercent: number;
  volume: number;
  // Verdict
  verdict: string | null;
  confidence: string | null;
  compositeScore: number | null;
  // Flow
  foreignFlowScore: number | null;
  flowMomentum: string | null;
  smartMoneyScore: number | null;
  smartVsRetail: string | null;
  // Fundamentals
  pe: number | null;
  pbv: number | null;
  roe: number | null;
  dividendYield: number | null;
  marketCap: number | null;
  // Technical
  rsi: number | null;
  mfi: number | null;
  macdTrend: string | null;
};

export async function getScreenerData(
  supabase: SupabaseClient
): Promise<ScreenerRow[]> {
  const { data: tickers } = await supabase
    .from("tickers")
    .select("id, symbol, name, sector")
    .eq("active", true)
    .order("symbol");

  if (!tickers || tickers.length === 0) return [];

  const rows = await Promise.all(
    tickers.map(async (t) => {
      const [snapshotRes, reportRes] = await Promise.all([
        supabase
          .from("snapshots")
          .select("price_data, fundamental_data, flow_data")
          .eq("ticker_id", t.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("reports")
          .select("verdict, confidence, report_json")
          .eq("ticker_id", t.id)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const priceData = snapshotRes.data?.price_data as {
        ohlcv?: OhlcvBar[];
        indicators?: { rsi14: number | null; mfi14: number | null; macd: { trend: string } };
      } | null;
      const fundamentals = snapshotRes.data?.fundamental_data as RawFundamentals | null;
      const flowData = snapshotRes.data?.flow_data as {
        flowMetrics?: FlowMetrics;
      } | null;
      const fm = flowData?.flowMetrics;
      const sm = fm?.smartMoney as SmartMoneyMetrics | undefined;

      const ohlcv = priceData?.ohlcv ?? [];
      const lastBar = ohlcv[ohlcv.length - 1];
      const prevBar = ohlcv.length >= 2 ? ohlcv[ohlcv.length - 2] : null;

      const reportJson = reportRes.data?.report_json as { composite_score?: { total: number } } | null;

      const row: ScreenerRow = {
        tickerId: t.id,
        symbol: t.symbol,
        name: t.name,
        sector: t.sector ?? "",
        price: lastBar?.close ?? 0,
        changePercent: lastBar && prevBar ? ((lastBar.close - prevBar.close) / prevBar.close) * 100 : 0,
        volume: lastBar?.volume ?? 0,
        verdict: reportRes.data?.verdict ?? null,
        confidence: reportRes.data?.confidence ?? null,
        compositeScore: reportJson?.composite_score?.total ?? null,
        foreignFlowScore: fm?.foreignFlowScore ?? null,
        flowMomentum: fm?.flowMomentum ?? null,
        smartMoneyScore: sm?.smartMoneyScore ?? null,
        smartVsRetail: sm?.smartVsRetail ?? null,
        pe: fundamentals?.peRatio ?? null,
        pbv: fundamentals?.pbvRatio ?? null,
        roe: fundamentals?.roe ?? null,
        dividendYield: fundamentals?.dividendYield ?? null,
        marketCap: fundamentals?.marketCap ?? null,
        rsi: priceData?.indicators?.rsi14 ?? null,
        mfi: priceData?.indicators?.mfi14 ?? null,
        macdTrend: priceData?.indicators?.macd?.trend ?? null,
      };

      return row;
    })
  );

  return rows;
}
