import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Default weights for each signal type in the composite scoring.
 * These are overridden when backtesting data is available.
 */
const DEFAULT_WEIGHTS: Record<string, number> = {
  composite_bullish: 1.0,
  composite_bearish: 1.0,
  divergence_bullish: 1.0,
  divergence_bearish: 1.0,
  macd_bullish: 1.0,
  macd_bearish: 1.0,
  bb_oversold: 1.0,
  bb_overbought: 1.0,
};

export type SignalWeights = Record<string, number>;

/**
 * Computes adaptive signal weights based on backtest accuracy.
 *
 * Signals with higher win rates get boosted (up to 1.5x), signals with
 * lower win rates get penalized (down to 0.5x). Requires at least 10
 * backtest results per signal type to adjust.
 *
 * Returns weights keyed by signal_type, normalized so average = 1.0.
 */
export async function computeAdaptiveWeights(
  supabase: SupabaseClient,
  tickerId?: string
): Promise<SignalWeights> {
  // Fetch aggregated win rates per signal type
  let query = supabase
    .from("backtest_results")
    .select("signal_type, outcome");

  if (tickerId) {
    query = query.eq("ticker_id", tickerId);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return { ...DEFAULT_WEIGHTS };
  }

  // Group by signal type
  const grouped: Record<string, { wins: number; total: number }> = {};
  for (const row of data) {
    if (!grouped[row.signal_type]) {
      grouped[row.signal_type] = { wins: 0, total: 0 };
    }
    grouped[row.signal_type].total++;
    if (row.outcome === "win") grouped[row.signal_type].wins++;
  }

  const weights: SignalWeights = { ...DEFAULT_WEIGHTS };

  for (const [type, stats] of Object.entries(grouped)) {
    // Need minimum sample size for statistical relevance
    if (stats.total < 10) continue;

    const winRate = stats.wins / stats.total;

    // Map win rate to weight multiplier:
    // 60%+ win rate → 1.5x (boost)
    // 50% win rate → 1.0x (neutral)
    // 40% win rate → 0.7x (penalize)
    // 30% or less → 0.5x (heavy penalize)
    let multiplier: number;
    if (winRate >= 0.6) multiplier = 1.5;
    else if (winRate >= 0.55) multiplier = 1.3;
    else if (winRate >= 0.5) multiplier = 1.0;
    else if (winRate >= 0.4) multiplier = 0.7;
    else multiplier = 0.5;

    weights[type] = multiplier;
  }

  // Normalize so average weight = 1.0
  const values = Object.values(weights);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  if (avg > 0) {
    for (const key of Object.keys(weights)) {
      weights[key] = Math.round((weights[key] / avg) * 100) / 100;
    }
  }

  return weights;
}

/**
 * Apply adaptive weights to composite score factors.
 * Returns an adjustment value to add to the technical score.
 */
export function applySignalWeights(
  weights: SignalWeights,
  signals: {
    hasDivergence: boolean;
    divergenceDirection?: "bullish" | "bearish";
    macdTrend: "bullish" | "bearish" | "neutral";
    bollingerExtreme: boolean;
    bollingerSide?: "lower" | "upper";
  }
): { adjustment: number; factors: string[] } {
  let adjustment = 0;
  const factors: string[] = [];

  // Use directional weights — bullish divergence uses divergence_bullish weight, etc.
  if (signals.hasDivergence) {
    const key = signals.divergenceDirection === "bullish" ? "divergence_bullish" : "divergence_bearish";
    const w = weights[key] ?? 1;
    if (w !== 1) {
      const delta = Math.round((w - 1) * 10);
      adjustment += delta;
      factors.push(`${key.replace(/_/g, " ")} weight: ${w}x (backtested)`);
    }
  }

  if (signals.macdTrend !== "neutral") {
    const key = signals.macdTrend === "bullish" ? "macd_bullish" : "macd_bearish";
    const w = weights[key] ?? 1;
    if (w !== 1) {
      const delta = Math.round((w - 1) * 8);
      adjustment += delta;
      factors.push(`${key.replace(/_/g, " ")} weight: ${w}x (backtested)`);
    }
  }

  if (signals.bollingerExtreme) {
    const key = signals.bollingerSide === "lower" ? "bb_oversold" : "bb_overbought";
    const w = weights[key] ?? 1;
    if (w !== 1) {
      const delta = Math.round((w - 1) * 8);
      adjustment += delta;
      factors.push(`${key.replace(/_/g, " ")} weight: ${w}x (backtested)`);
    }
  }

  return { adjustment, factors };
}
