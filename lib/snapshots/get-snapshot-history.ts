/**
 * Query snapshot history for charting flow timelines.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FlowMetrics, SmartMoneyMetrics, OhlcvBar } from "@/lib/market-data/types";

export type SnapshotPoint = {
  date: string;
  whaleScore: number;
  foreignFlowScore: number;
  price: number;
  volume: number;
  dailyForeignFlow: number;
};

export async function getSnapshotHistory(
  supabase: SupabaseClient,
  tickerId: string,
  limit = 30
): Promise<SnapshotPoint[]> {
  const { data: snapshots } = await supabase
    .from("snapshots")
    .select("as_of_date, flow_data, price_data")
    .eq("ticker_id", tickerId)
    .order("as_of_date", { ascending: true })
    .limit(limit);

  if (!snapshots || snapshots.length === 0) return [];

  return snapshots.map((s) => {
    const flowData = s.flow_data as Record<string, unknown> & {
      flowMetrics?: FlowMetrics;
    };
    const priceData = s.price_data as Record<string, unknown> & {
      ohlcv?: OhlcvBar[];
    };

    const fm = flowData?.flowMetrics;
    const sm = fm?.smartMoney as SmartMoneyMetrics | undefined;
    const ohlcv = priceData?.ohlcv ?? [];
    const lastBar = ohlcv[ohlcv.length - 1];

    // Compute daily foreign flow from the dailyForeignFlow array
    const dailyFlows = fm?.dailyForeignFlow ?? [];
    const latestDailyFlow = dailyFlows[dailyFlows.length - 1]?.netForeign ?? 0;

    return {
      date: s.as_of_date,
      whaleScore: sm?.smartMoneyScore ?? 0,
      foreignFlowScore: fm?.foreignFlowScore ?? 0,
      price: lastBar?.close ?? 0,
      volume: lastBar?.volume ?? 0,
      dailyForeignFlow: latestDailyFlow,
    };
  });
}
