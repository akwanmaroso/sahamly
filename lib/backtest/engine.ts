import type { SupabaseClient } from "@supabase/supabase-js";
import { computeIndicators } from "@/lib/indicators/compute";
import { computeCompositeScore } from "@/lib/reports/composite-score";
import type { OhlcvBar, RawFundamentals } from "@/lib/market-data/types";

type PriceRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type BacktestSignal = {
  ticker_id: string;
  signal_date: string;
  signal_type: string;
  signal_value: Record<string, unknown>;
  forward_return_5d: number | null;
  forward_return_10d: number | null;
  forward_return_20d: number | null;
  max_drawdown_20d: number | null;
  outcome: "win" | "loss" | "neutral";
};

export type BacktestSummary = {
  totalSignals: number;
  wins: number;
  losses: number;
  neutral: number;
  winRate: number; // 0–1
  avgReturn5d: number;
  avgReturn10d: number;
  avgReturn20d: number;
  avgMaxDrawdown: number;
  bySignalType: Record<string, {
    count: number;
    winRate: number;
    avgReturn10d: number;
  }>;
};

/**
 * Runs a backtest for a single ticker using its price_history.
 *
 * Slides a window across history, computes indicators + composite score at each
 * point, then measures forward returns 5/10/20 days out.
 *
 * @param lookback - number of bars to use for indicator computation (default 200)
 * @param step - how many days to advance between signal checks (default 5 = weekly)
 */
export async function runBacktest(
  supabase: SupabaseClient,
  tickerId: string,
  fundamentals: RawFundamentals,
  options: { lookback?: number; step?: number } = {}
): Promise<BacktestSignal[]> {
  const lookback = options.lookback ?? 200;
  const step = options.step ?? 5;

  // Fetch all price history sorted by date
  const { data: history, error } = await supabase
    .from("price_history")
    .select("date, open, high, low, close, volume")
    .eq("ticker_id", tickerId)
    .order("date", { ascending: true });

  if (error) throw new Error(`Fetch history failed: ${error.message}`);
  if (!history || history.length < lookback + 20) {
    return []; // Not enough data
  }

  const prices = history as PriceRow[];
  const signals: BacktestSignal[] = [];

  // Slide window across history
  for (let i = lookback; i < prices.length - 20; i += step) {
    const window = prices.slice(i - lookback, i + 1);
    const ohlcv: OhlcvBar[] = window.map((p) => ({
      date: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));

    const currentPrice = ohlcv[ohlcv.length - 1].close;
    const signalDate = ohlcv[ohlcv.length - 1].date;

    // Compute indicators and score (no flow data for historical backtest)
    const indicators = computeIndicators(ohlcv);
    const composite = computeCompositeScore(
      indicators,
      currentPrice,
      fundamentals,
      undefined, // no historical flow data
      fundamentals.marketCap
    );

    // Measure forward returns
    const futureSlice = prices.slice(i + 1, i + 21);
    const forward5d = futureSlice.length >= 5
      ? ((futureSlice[4].close - currentPrice) / currentPrice) * 100
      : null;
    const forward10d = futureSlice.length >= 10
      ? ((futureSlice[9].close - currentPrice) / currentPrice) * 100
      : null;
    const forward20d = futureSlice.length >= 20
      ? ((futureSlice[19].close - currentPrice) / currentPrice) * 100
      : null;

    // Max drawdown in 20d window
    let maxDrawdown = 0;
    for (const bar of futureSlice) {
      const dd = ((bar.low - currentPrice) / currentPrice) * 100;
      if (dd < maxDrawdown) maxDrawdown = dd;
    }

    const r5d = forward5d !== null ? Math.round(forward5d * 100) / 100 : null;
    const r10d = forward10d !== null ? Math.round(forward10d * 100) / 100 : null;
    const r20d = forward20d !== null ? Math.round(forward20d * 100) / 100 : null;
    const mdd = Math.round(maxDrawdown * 100) / 100;

    /**
     * Directional outcome: a "win" depends on the signal's direction.
     * - Bullish signal → win if price goes up >1%
     * - Bearish signal → win if price goes down >1%
     */
    function directionalOutcome(
      isBullish: boolean,
      ret10d: number | null
    ): "win" | "loss" | "neutral" {
      if (ret10d === null) return "neutral";
      if (isBullish) return ret10d > 1 ? "win" : ret10d < -1 ? "loss" : "neutral";
      // Bearish: win when price drops
      return ret10d < -1 ? "win" : ret10d > 1 ? "loss" : "neutral";
    }

    // Composite score signal — only fire when score has a clear opinion
    // Bullish: score >= 20 (Accumulate territory)
    // Bearish: score <= -20 (Avoid territory)
    if (composite.total >= 20 || composite.total <= -20) {
      const isBullish = composite.total >= 20;
      signals.push({
        ticker_id: tickerId,
        signal_date: signalDate,
        signal_type: isBullish ? "composite_bullish" : "composite_bearish",
        signal_value: {
          total: composite.total,
          verdict: composite.suggestedVerdict,
          confidence: composite.suggestedConfidence,
          technicalScore: composite.technical.score,
          fundamentalScore: composite.fundamental.score,
        },
        forward_return_5d: r5d,
        forward_return_10d: r10d,
        forward_return_20d: r20d,
        max_drawdown_20d: mdd,
        outcome: directionalOutcome(isBullish, r10d),
      });
    }

    // Divergence signal — inherently directional
    const rsiDiv = indicators.divergence.rsiDivergence;
    const mfiDiv = indicators.divergence.mfiDivergence;
    if (rsiDiv || mfiDiv) {
      // Use RSI divergence direction, fallback to MFI
      const isBullish = (rsiDiv ?? mfiDiv) === "bullish";
      signals.push({
        ticker_id: tickerId,
        signal_date: signalDate,
        signal_type: isBullish ? "divergence_bullish" : "divergence_bearish",
        signal_value: {
          rsiDivergence: rsiDiv,
          mfiDivergence: mfiDiv,
          rsi: indicators.rsi14,
          mfi: indicators.mfi14,
        },
        forward_return_5d: r5d,
        forward_return_10d: r10d,
        forward_return_20d: r20d,
        max_drawdown_20d: mdd,
        outcome: directionalOutcome(isBullish, r10d),
      });
    }

    // MACD crossover — directional
    if (indicators.macd.trend !== "neutral") {
      const isBullish = indicators.macd.trend === "bullish";
      signals.push({
        ticker_id: tickerId,
        signal_date: signalDate,
        signal_type: isBullish ? "macd_bullish" : "macd_bearish",
        signal_value: {
          trend: indicators.macd.trend,
          macd: indicators.macd.macd,
          signal: indicators.macd.signal,
          histogram: indicators.macd.histogram,
        },
        forward_return_5d: r5d,
        forward_return_10d: r10d,
        forward_return_20d: r20d,
        max_drawdown_20d: mdd,
        outcome: directionalOutcome(isBullish, r10d),
      });
    }

    // Bollinger Band extreme — directional mean reversion
    if (indicators.bollingerBands.percentB !== null &&
        (indicators.bollingerBands.percentB < 0.05 || indicators.bollingerBands.percentB > 0.95)) {
      // Lower band = bullish (expect bounce), upper band = bearish (expect pullback)
      const isBullish = indicators.bollingerBands.percentB < 0.05;
      signals.push({
        ticker_id: tickerId,
        signal_date: signalDate,
        signal_type: isBullish ? "bb_oversold" : "bb_overbought",
        signal_value: {
          percentB: indicators.bollingerBands.percentB,
          bandwidth: indicators.bollingerBands.bandwidth,
          side: isBullish ? "lower" : "upper",
        },
        forward_return_5d: r5d,
        forward_return_10d: r10d,
        forward_return_20d: r20d,
        max_drawdown_20d: mdd,
        outcome: directionalOutcome(isBullish, r10d),
      });
    }
  }

  return signals;
}

/** Persists backtest results to the database. */
export async function saveBacktestResults(
  supabase: SupabaseClient,
  signals: BacktestSignal[]
): Promise<number> {
  if (signals.length === 0) return 0;

  const BATCH = 500;
  let saved = 0;

  for (let i = 0; i < signals.length; i += BATCH) {
    const batch = signals.slice(i, i + BATCH);
    const { error } = await supabase
      .from("backtest_results")
      .upsert(batch, { onConflict: "ticker_id,signal_date,signal_type" });
    if (error) throw new Error(`Save backtest failed: ${error.message}`);
    saved += batch.length;
  }

  return saved;
}

/** Computes summary statistics from stored backtest results. */
export async function getBacktestSummary(
  supabase: SupabaseClient,
  tickerId: string
): Promise<BacktestSummary | null> {
  const { data, error } = await supabase
    .from("backtest_results")
    .select("signal_type, signal_value, forward_return_5d, forward_return_10d, forward_return_20d, max_drawdown_20d, outcome")
    .eq("ticker_id", tickerId);

  if (error || !data || data.length === 0) return null;

  const wins = data.filter((r) => r.outcome === "win").length;
  const losses = data.filter((r) => r.outcome === "loss").length;
  const neutral = data.filter((r) => r.outcome === "neutral").length;

  const avg = (arr: (number | null)[]): number => {
    const valid = arr.filter((v): v is number => v !== null);
    return valid.length > 0 ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100 : 0;
  };

  // Per signal-type breakdown
  const byType: Record<string, typeof data> = {};
  for (const r of data) {
    const t = r.signal_type;
    if (!byType[t]) byType[t] = [];
    byType[t].push(r);
  }

  const bySignalType: BacktestSummary["bySignalType"] = {};
  for (const [type, rows] of Object.entries(byType)) {
    const typeWins = rows.filter((r) => r.outcome === "win").length;
    bySignalType[type] = {
      count: rows.length,
      winRate: rows.length > 0 ? Math.round((typeWins / rows.length) * 100) / 100 : 0,
      avgReturn10d: avg(rows.map((r) => r.forward_return_10d)),
    };
  }

  return {
    totalSignals: data.length,
    wins,
    losses,
    neutral,
    winRate: data.length > 0 ? Math.round((wins / data.length) * 100) / 100 : 0,
    avgReturn5d: avg(data.map((r) => r.forward_return_5d)),
    avgReturn10d: avg(data.map((r) => r.forward_return_10d)),
    avgReturn20d: avg(data.map((r) => r.forward_return_20d)),
    avgMaxDrawdown: avg(data.map((r) => r.max_drawdown_20d)),
    bySignalType,
  };
}
