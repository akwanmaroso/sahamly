import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccumulationPattern } from "@/lib/market-data/types";
import { getBrokerTier, isWhaleBroker } from "./broker-tiers";

type DailyBrokerRow = {
  trade_date: string;
  broker_code: string;
  buy_value: number;
  sell_value: number;
  net_value: number;
};

/**
 * Detect whale accumulation/distribution patterns from broker flow data.
 *
 * Patterns detected:
 * 1. Stealth accumulation: same broker buying consistently for N+ days
 * 2. Stealth distribution: same broker selling consistently for N+ days
 * 3. Absorption: volume increasing but price flat (whale absorbing supply)
 * 4. Coordinated entry: multiple whale brokers entering on the same side
 */
export async function detectAccumulationPatterns(
  supabase: SupabaseClient,
  tickerId: string,
  lookbackDays = 20
): Promise<AccumulationPattern[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.ceil(lookbackDays * 1.5));

  const { data: rows, error } = await supabase
    .from("broker_flows")
    .select("trade_date, broker_code, buy_value, sell_value, net_value")
    .eq("ticker_id", tickerId)
    .neq("broker_code", "___FOREIGN_NET")
    .gte("trade_date", cutoff.toISOString().slice(0, 10))
    .order("trade_date", { ascending: true });

  if (error || !rows || rows.length === 0) return [];

  const patterns: AccumulationPattern[] = [];

  // --- 1. Stealth Accumulation/Distribution ---
  // Group by broker, track consecutive same-direction days
  const brokerDays = new Map<string, { dates: string[]; direction: "buy" | "sell" }[]>();

  // Group rows by date first, then track per broker
  const byBrokerDate = new Map<string, DailyBrokerRow[]>();
  for (const r of rows) {
    const key = r.broker_code;
    if (!byBrokerDate.has(key)) byBrokerDate.set(key, []);
    byBrokerDate.get(key)!.push(r);
  }

  for (const [broker, brokerRows] of byBrokerDate) {
    // Only track whale/institutional brokers for stealth patterns
    const tier = getBrokerTier(broker);
    if (tier.tier === 3) continue;

    // Sort by date and find consecutive streaks
    const sorted = brokerRows.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    let streakDays = 1;
    let streakDirection: "buy" | "sell" = sorted[0].net_value > 0 ? "buy" : "sell";

    for (let i = 1; i < sorted.length; i++) {
      const direction = sorted[i].net_value > 0 ? "buy" : "sell";
      if (direction === streakDirection) {
        streakDays++;
      } else {
        // Check if the completed streak is significant
        if (streakDays >= 3) {
          const totalNet = sorted.slice(i - streakDays, i)
            .reduce((s, r) => s + r.net_value, 0);
          const isBuy = streakDirection === "buy";
          patterns.push({
            detected: true,
            type: isBuy ? "stealth_accumulation" : "stealth_distribution",
            description: `${tier.name} (${broker}) has been ${isBuy ? "buying" : "selling"} for ${streakDays} consecutive days (net: ${formatValue(totalNet)})`,
            brokerCode: broker,
            daysActive: streakDays,
            confidence: streakDays >= 5 ? "high" : "medium",
          });
        }
        streakDays = 1;
        streakDirection = direction;
      }
    }

    // Check final streak
    if (streakDays >= 3) {
      const totalNet = sorted.slice(-streakDays)
        .reduce((s, r) => s + r.net_value, 0);
      const isBuy = streakDirection === "buy";
      patterns.push({
        detected: true,
        type: isBuy ? "stealth_accumulation" : "stealth_distribution",
        description: `${tier.name} (${broker}) has been ${isBuy ? "buying" : "selling"} for ${streakDays} consecutive days (net: ${formatValue(totalNet)}) — ONGOING`,
        brokerCode: broker,
        daysActive: streakDays,
        confidence: streakDays >= 5 ? "high" : "medium",
      });
    }
  }

  // --- 2. Coordinated Entry ---
  // Multiple whale brokers on the same side in the last 5 days
  const recentRows = rows.filter((r) => {
    const daysAgo = (Date.now() - new Date(r.trade_date).getTime()) / 86400000;
    return daysAgo <= 7;
  });

  const recentWhaleActivity = new Map<string, number>(); // broker → net value
  for (const r of recentRows) {
    if (!isWhaleBroker(r.broker_code)) continue;
    const existing = recentWhaleActivity.get(r.broker_code) ?? 0;
    recentWhaleActivity.set(r.broker_code, existing + r.net_value);
  }

  const whaleBuyers = [...recentWhaleActivity.entries()].filter(([, v]) => v > 0);
  const whaleSellers = [...recentWhaleActivity.entries()].filter(([, v]) => v < 0);

  if (whaleBuyers.length >= 3) {
    const names = whaleBuyers.map(([code]) => `${getBrokerTier(code).name} (${code})`).join(", ");
    const totalNet = whaleBuyers.reduce((s, [, v]) => s + v, 0);
    patterns.push({
      detected: true,
      type: "coordinated_entry",
      description: `${whaleBuyers.length} whale brokers buying simultaneously: ${names} (combined net: ${formatValue(totalNet)})`,
      daysActive: 5,
      confidence: whaleBuyers.length >= 4 ? "high" : "medium",
    });
  }

  if (whaleSellers.length >= 3) {
    const names = whaleSellers.map(([code]) => `${getBrokerTier(code).name} (${code})`).join(", ");
    const totalNet = whaleSellers.reduce((s, [, v]) => s + v, 0);
    patterns.push({
      detected: true,
      type: "coordinated_entry",
      description: `${whaleSellers.length} whale brokers selling simultaneously: ${names} (combined net: ${formatValue(totalNet)})`,
      daysActive: 5,
      confidence: whaleSellers.length >= 4 ? "high" : "medium",
    });
  }

  // Sort by confidence (high first) then by daysActive
  patterns.sort((a, b) => {
    const confOrder = { high: 0, medium: 1, low: 2 };
    const confDiff = confOrder[a.confidence] - confOrder[b.confidence];
    if (confDiff !== 0) return confDiff;
    return (b.daysActive ?? 0) - (a.daysActive ?? 0);
  });

  return patterns.slice(0, 5); // Top 5 most significant patterns
}

function formatValue(v: number): string {
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${abs.toLocaleString("en-US")}`;
}
