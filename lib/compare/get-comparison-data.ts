/**
 * Fetch data for side-by-side stock comparison.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportJson } from "@/lib/reports/schema";
import type { FlowMetrics, SmartMoneyMetrics } from "@/lib/market-data/types";
import {
  detectCrossStockCorrelation,
  type CrossStockCorrelation,
} from "@/lib/broker-flow/cross-stock-correlation";

export type ComparedTicker = {
  tickerId: string;
  symbol: string;
  name: string;
  sector: string;
  verdict?: string;
  confidence?: string;
  compositeTotal?: number;
  technicalScore?: number;
  fundamentalScore?: number;
  flowScore?: number;
  foreignFlowScore?: number;
  flowMomentum?: string;
  smartMoneyScore?: number;
  whaleNetFlow?: number;
  smartVsRetail?: string;
  entryZone?: number[];
  stopLoss?: number;
  targetZone?: number[];
  riskReward?: number;
  summary?: string;
};

export type ComparisonData = {
  tickers: ComparedTicker[];
  crossStock: CrossStockCorrelation;
};

export async function getComparisonData(
  supabase: SupabaseClient,
  symbols: string[]
): Promise<ComparisonData> {
  // Resolve ticker IDs from symbols
  const { data: tickerRows } = await supabase
    .from("tickers")
    .select("id, symbol, name, sector")
    .in("symbol", symbols);

  if (!tickerRows || tickerRows.length === 0) {
    return { tickers: [], crossStock: { rotations: [], coordinatedMoves: [] } };
  }

  // Fetch latest report + snapshot for each in parallel
  const compared = await Promise.all(
    tickerRows.map(async (t) => {
      const [reportRes, snapshotRes] = await Promise.all([
        supabase
          .from("reports")
          .select("verdict, confidence, report_json")
          .eq("ticker_id", t.id)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("snapshots")
          .select("flow_data")
          .eq("ticker_id", t.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const rj = reportRes.data?.report_json as ReportJson | undefined;
      const flowData = snapshotRes.data?.flow_data as {
        flowMetrics?: FlowMetrics;
      } | null;
      const fm = flowData?.flowMetrics;
      const sm = fm?.smartMoney as SmartMoneyMetrics | undefined;

      const result: ComparedTicker = {
        tickerId: t.id,
        symbol: t.symbol,
        name: t.name,
        sector: t.sector,
        verdict: rj?.verdict,
        confidence: rj?.confidence,
        compositeTotal: rj?.composite_score?.total,
        technicalScore: rj?.composite_score?.technical.score,
        fundamentalScore: rj?.composite_score?.fundamental.score,
        flowScore: rj?.composite_score?.flow.score,
        foreignFlowScore: fm?.foreignFlowScore,
        flowMomentum: fm?.flowMomentum,
        smartMoneyScore: sm?.smartMoneyScore,
        whaleNetFlow: sm?.whaleNetFlow,
        smartVsRetail: sm?.smartVsRetail,
        entryZone: rj?.entry_exit.entry_zone,
        stopLoss: rj?.entry_exit.stop_loss,
        targetZone: rj?.entry_exit.target_zone,
        riskReward: rj?.entry_exit.risk_reward_ratio ?? undefined,
        summary: rj?.summary,
      };
      return result;
    })
  );

  const crossStock = await detectCrossStockCorrelation(supabase);

  return { tickers: compared, crossStock };
}
