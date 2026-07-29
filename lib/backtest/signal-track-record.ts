/**
 * Signal track record — extends backtest summary with individual signal history.
 * Used for the "Signal Track Record" section on the ticker detail page.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RecentSignal = {
  date: string;
  outcome: "win" | "loss" | "neutral";
  return10d: number;
};

export type SignalTypeRecord = {
  signalType: string;
  count: number;
  winRate: number;
  avgReturn5d: number;
  avgReturn10d: number;
  avgReturn20d: number;
  recentSignals: RecentSignal[];
};

export type SignalTrackRecord = {
  overallAccuracy: number; // 0-100
  totalSignals: number;
  byType: SignalTypeRecord[];
};

export async function getSignalTrackRecord(
  supabase: SupabaseClient,
  tickerId: string
): Promise<SignalTrackRecord | null> {
  const { data: results } = await supabase
    .from("backtest_results")
    .select("signal_date, signal_type, outcome, forward_return_5d, forward_return_10d, forward_return_20d")
    .eq("ticker_id", tickerId)
    .order("signal_date", { ascending: false })
    .limit(500);

  if (!results || results.length === 0) return null;

  // Group by signal type
  const groups = new Map<string, typeof results>();
  for (const r of results) {
    const existing = groups.get(r.signal_type) ?? [];
    existing.push(r);
    groups.set(r.signal_type, existing);
  }

  const totalSignals = results.length;
  const totalWins = results.filter((r) => r.outcome === "win").length;
  const overallAccuracy = totalSignals > 0 ? Math.round((totalWins / totalSignals) * 100) : 0;

  const byType: SignalTypeRecord[] = [];
  for (const [signalType, signals] of groups) {
    const count = signals.length;
    const wins = signals.filter((s) => s.outcome === "win").length;
    const winRate = count > 0 ? Math.round((wins / count) * 100) : 0;

    const avg = (key: "forward_return_5d" | "forward_return_10d" | "forward_return_20d") => {
      const valid = signals.filter((s) => s[key] != null);
      if (valid.length === 0) return 0;
      return Number((valid.reduce((sum, s) => sum + (s[key] as number), 0) / valid.length).toFixed(2));
    };

    // Get last 5 signals for this type
    const recentSignals: RecentSignal[] = signals.slice(0, 5).map((s) => ({
      date: s.signal_date,
      outcome: (s.outcome as "win" | "loss" | "neutral") ?? "neutral",
      return10d: s.forward_return_10d ?? 0,
    }));

    byType.push({
      signalType,
      count,
      winRate,
      avgReturn5d: avg("forward_return_5d"),
      avgReturn10d: avg("forward_return_10d"),
      avgReturn20d: avg("forward_return_20d"),
      recentSignals,
    });
  }

  // Sort by count descending
  byType.sort((a, b) => b.count - a.count);

  return { overallAccuracy, totalSignals, byType };
}
