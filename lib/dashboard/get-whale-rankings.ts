/**
 * Query the latest snapshot for each active ticker and extract whale rankings.
 * Returns ranked lists for the Big Money Dashboard.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FlowMetrics,
  SmartMoneyMetrics,
  AccumulationPattern,
} from "@/lib/market-data/types";

export type WhaleRankedTicker = {
  tickerId: string;
  symbol: string;
  name: string;
  sector: string;
  smartMoneyScore: number;
  foreignFlowScore: number;
  flowMomentum: string;
  whaleNetFlow: number;
  smartVsRetail: string;
  verdict?: string;
  confidence?: string;
};

export type WhaleRankings = {
  topInflows: WhaleRankedTicker[];
  topOutflows: WhaleRankedTicker[];
  foreignLeaderboard: WhaleRankedTicker[];
  activeAccumulation: {
    symbol: string;
    tickerId: string;
    patterns: AccumulationPattern[];
  }[];
  recentBlockTrades: {
    symbol: string;
    tickerId: string;
    signals: {
      brokerCode: string;
      direction: string;
      totalValue: number;
      description: string;
    }[];
  }[];
};

export async function getWhaleRankings(
  supabase: SupabaseClient
): Promise<WhaleRankings> {
  // Get all active tickers
  const { data: tickers } = await supabase
    .from("tickers")
    .select("id, symbol, name, sector")
    .eq("active", true);

  if (!tickers || tickers.length === 0) {
    return {
      topInflows: [],
      topOutflows: [],
      foreignLeaderboard: [],
      activeAccumulation: [],
      recentBlockTrades: [],
    };
  }

  // Fetch latest snapshot + latest report for each ticker in parallel
  const results = await Promise.all(
    tickers.map(async (t) => {
      const [snapshotRes, reportRes] = await Promise.all([
        supabase
          .from("snapshots")
          .select("flow_data")
          .eq("ticker_id", t.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("reports")
          .select("verdict, confidence")
          .eq("ticker_id", t.id)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const flowData = snapshotRes.data?.flow_data as
        | (Record<string, unknown> & { flowMetrics?: FlowMetrics })
        | null;
      const fm = flowData?.flowMetrics ?? null;
      const report = reportRes.data;

      return { ticker: t, flowMetrics: fm, report };
    })
  );

  // Build ranked lists
  const ranked: WhaleRankedTicker[] = results
    .filter((r) => r.flowMetrics)
    .map((r) => {
      const fm = r.flowMetrics!;
      const sm = fm.smartMoney as SmartMoneyMetrics | undefined;
      return {
        tickerId: r.ticker.id,
        symbol: r.ticker.symbol,
        name: r.ticker.name,
        sector: r.ticker.sector,
        smartMoneyScore: sm?.smartMoneyScore ?? 0,
        foreignFlowScore: fm.foreignFlowScore,
        flowMomentum: fm.flowMomentum,
        whaleNetFlow: sm?.whaleNetFlow ?? 0,
        smartVsRetail: sm?.smartVsRetail ?? "neutral",
        verdict: r.report?.verdict ?? undefined,
        confidence: r.report?.confidence ?? undefined,
      };
    });

  const topInflows = [...ranked]
    .filter((t) => t.smartMoneyScore > 0)
    .sort((a, b) => b.smartMoneyScore - a.smartMoneyScore)
    .slice(0, 5);

  const topOutflows = [...ranked]
    .filter((t) => t.smartMoneyScore < 0)
    .sort((a, b) => a.smartMoneyScore - b.smartMoneyScore)
    .slice(0, 5);

  const foreignLeaderboard = [...ranked]
    .sort((a, b) => b.foreignFlowScore - a.foreignFlowScore);

  // Accumulation patterns
  const activeAccumulation = results
    .filter((r) => {
      const patterns = r.flowMetrics?.accumulationPatterns;
      return (
        patterns &&
        patterns.some(
          (p) =>
            p.detected &&
            (p.type === "stealth_accumulation" || p.type === "coordinated_entry") &&
            (p.confidence === "high" || p.confidence === "medium")
        )
      );
    })
    .map((r) => ({
      symbol: r.ticker.symbol,
      tickerId: r.ticker.id,
      patterns: (r.flowMetrics!.accumulationPatterns ?? []).filter(
        (p) => p.detected
      ),
    }));

  // Block trades
  const recentBlockTrades = results
    .filter((r) => r.flowMetrics?.blockTrades?.detected)
    .map((r) => ({
      symbol: r.ticker.symbol,
      tickerId: r.ticker.id,
      signals: (r.flowMetrics!.blockTrades!.signals ?? []).map((s) => ({
        brokerCode: s.brokerCode,
        direction: s.direction,
        totalValue: s.totalValue,
        description: s.description,
      })),
    }));

  return {
    topInflows,
    topOutflows,
    foreignLeaderboard,
    activeAccumulation,
    recentBlockTrades,
  };
}
