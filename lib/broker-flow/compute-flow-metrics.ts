import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyBroker } from "@/lib/market-data/broker-codes";
import type {
  BrokerActivity,
  DailyForeignFlow,
  FlowMetrics,
  FlowTrend,
} from "@/lib/market-data/types";

/**
 * Compute flow metrics from broker_flows data stored in the DB.
 * No API calls — reads from Supabase only.
 */
export async function computeFlowMetrics(
  supabase: SupabaseClient,
  tickerId: string,
  lookbackDays = 20
): Promise<FlowMetrics | null> {
  // Fetch all broker_flows for this ticker in the lookback window
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.ceil(lookbackDays * 1.5));

  const { data: rows, error } = await supabase
    .from("broker_flows")
    .select(
      "trade_date, broker_code, broker_type, buy_volume, buy_value, sell_volume, sell_value, net_value"
    )
    .eq("ticker_id", tickerId)
    .gte("trade_date", cutoff.toISOString().slice(0, 10))
    .order("trade_date", { ascending: true });

  if (error || !rows || rows.length === 0) {
    return null;
  }

  // Separate daily foreign flow entries from broker entries
  const foreignFlowRows = rows.filter(
    (r) => r.broker_code === "___FOREIGN_NET"
  );
  const brokerRows = rows.filter((r) => r.broker_code !== "___FOREIGN_NET");

  // --- Daily foreign flow ---
  const dailyForeignFlow: DailyForeignFlow[] = foreignFlowRows.map((r) => ({
    date: r.trade_date,
    foreignBuy: r.buy_value,
    foreignSell: r.sell_value,
    netForeign: r.buy_value - r.sell_value,
  }));

  // --- Consecutive foreign buy days ---
  let consecutiveForeignBuyDays = 0;
  for (let i = dailyForeignFlow.length - 1; i >= 0; i--) {
    if (dailyForeignFlow[i].netForeign > 0) {
      consecutiveForeignBuyDays++;
    } else {
      break;
    }
  }

  // --- Foreign flow score (-100 to +100) ---
  const totalForeignNet = dailyForeignFlow.reduce(
    (sum, d) => sum + d.netForeign,
    0
  );
  const avgDailyAbs =
    dailyForeignFlow.reduce((sum, d) => sum + Math.abs(d.netForeign), 0) /
    (dailyForeignFlow.length || 1);
  // Normalize: totalForeignNet relative to average daily magnitude × days
  const normalizer = avgDailyAbs * (dailyForeignFlow.length || 1);
  const rawScore = normalizer > 0 ? (totalForeignNet / normalizer) * 100 : 0;
  const foreignFlowScore = Math.max(-100, Math.min(100, Math.round(rawScore)));

  // --- Flow momentum ---
  const recent5 = dailyForeignFlow.slice(-5);
  const older = dailyForeignFlow.slice(0, -5);
  const avgRecent =
    recent5.reduce((s, d) => s + d.netForeign, 0) / (recent5.length || 1);
  const avgOlder =
    older.reduce((s, d) => s + d.netForeign, 0) / (older.length || 1);
  const momentumRatio =
    avgOlder !== 0 ? avgRecent / Math.abs(avgOlder) : avgRecent > 0 ? 2 : -2;

  let flowMomentum: "accelerating" | "steady" | "decelerating";
  if (Math.abs(momentumRatio) < 0.3) {
    flowMomentum = "steady";
  } else if (
    (avgRecent > 0 && momentumRatio > 1.3) ||
    (avgRecent < 0 && momentumRatio < -1.3)
  ) {
    flowMomentum = "accelerating";
  } else {
    flowMomentum = avgRecent > 0 && momentumRatio < 0.7 ? "decelerating" : "steady";
  }

  // --- Aggregate broker activity ---
  const brokerMap = new Map<
    string,
    {
      brokerCode: string;
      type: "foreign" | "domestic";
      buyVolume: number;
      buyValue: number;
      sellVolume: number;
      sellValue: number;
      netValue: number;
    }
  >();

  for (const r of brokerRows) {
    const existing = brokerMap.get(r.broker_code);
    if (existing) {
      existing.buyVolume += r.buy_volume;
      existing.buyValue += r.buy_value;
      existing.sellVolume += r.sell_volume;
      existing.sellValue += r.sell_value;
      existing.netValue += r.net_value;
    } else {
      brokerMap.set(r.broker_code, {
        brokerCode: r.broker_code,
        type: classifyBroker(r.broker_code),
        buyVolume: r.buy_volume,
        buyValue: r.buy_value,
        sellVolume: r.sell_volume,
        sellValue: r.sell_value,
        netValue: r.net_value,
      });
    }
  }

  const allBrokers = Array.from(brokerMap.values());
  const sortedByNet = [...allBrokers].sort((a, b) => b.netValue - a.netValue);

  const topBuyers: BrokerActivity[] = sortedByNet
    .filter((b) => b.netValue > 0)
    .slice(0, 5);
  const topSellers: BrokerActivity[] = sortedByNet
    .filter((b) => b.netValue < 0)
    .sort((a, b) => a.netValue - b.netValue)
    .slice(0, 5);

  // --- Broker concentration score (0-100) ---
  const totalAbsFlow = allBrokers.reduce(
    (sum, b) => sum + Math.abs(b.netValue),
    0
  );
  const topBrokerAbs = sortedByNet[0]
    ? Math.abs(sortedByNet[0].netValue)
    : 0;
  const brokerConcentrationScore =
    totalAbsFlow > 0
      ? Math.round((topBrokerAbs / totalAbsFlow) * 100)
      : 0;

  // --- Flow trend analysis (short-term vs medium-term) ---
  const shortTermDays = dailyForeignFlow.slice(-5);
  const mediumTermDays = dailyForeignFlow; // full 20-day window
  const shortTermAvg =
    shortTermDays.reduce((s, d) => s + d.netForeign, 0) / (shortTermDays.length || 1);
  const mediumTermAvg =
    mediumTermDays.reduce((s, d) => s + d.netForeign, 0) / (mediumTermDays.length || 1);

  const shortPositive = shortTermAvg > 0;
  const mediumPositive = mediumTermAvg > 0;

  let trendDirection: FlowTrend["trendDirection"] = "neutral";
  if (mediumTermAvg > 0 && shortTermAvg > 0) trendDirection = "accumulating";
  else if (mediumTermAvg < 0 && shortTermAvg < 0) trendDirection = "distributing";

  const reversalDetected = shortPositive !== mediumPositive && mediumTermDays.length >= 10;
  let reversalType: FlowTrend["reversalType"] = null;
  if (reversalDetected) {
    reversalType = shortPositive ? "bullish" : "bearish";
  }

  // Trend strength: how consistent is the daily flow direction over the window?
  const positiveDays = dailyForeignFlow.filter((d) => d.netForeign > 0).length;
  const totalDays = dailyForeignFlow.length || 1;
  const consistency = Math.abs(positiveDays / totalDays - 0.5) * 2; // 0 = mixed, 1 = all same direction
  const trendStrength = Math.round(consistency * 100);

  const flowTrend: FlowTrend = {
    shortTermAvg: Math.round(shortTermAvg),
    mediumTermAvg: Math.round(mediumTermAvg),
    trendDirection,
    reversalDetected,
    reversalType,
    trendStrength,
  };

  return {
    foreignFlowScore,
    brokerConcentrationScore,
    flowMomentum,
    consecutiveForeignBuyDays,
    topBuyers,
    topSellers,
    dailyForeignFlow,
    flowTrend,
  };
}
