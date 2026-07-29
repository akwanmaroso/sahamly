import type { OhlcvBar } from "@/lib/market-data/types";
import { computeIndicators } from "./compute";
import type { ComputedIndicators } from "./types";

export type TimeframeAlignment = {
  daily: { rsiZone: string; macdTrend: string; smaAlignment: string };
  weekly: { rsiZone: string; macdTrend: string; smaAlignment: string };
  aligned: boolean;
  direction: "bullish" | "bearish" | "mixed";
  confidence: "strong" | "moderate" | "weak";
};

/** Resample daily bars into weekly bars (Mon-Fri grouping). */
export function resampleWeekly(dailyBars: OhlcvBar[]): OhlcvBar[] {
  if (dailyBars.length === 0) return [];

  const weeks: OhlcvBar[][] = [];
  let currentWeek: OhlcvBar[] = [];

  for (const bar of dailyBars) {
    const dayOfWeek = new Date(bar.date).getDay();
    // Start a new week on Monday (or if first bar)
    if (dayOfWeek === 1 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(bar);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  return weeks.map((week) => ({
    date: week[week.length - 1].date, // use last day as the week's date
    open: week[0].open,
    high: Math.max(...week.map((b) => b.high)),
    low: Math.min(...week.map((b) => b.low)),
    close: week[week.length - 1].close,
    volume: week.reduce((sum, b) => sum + b.volume, 0),
  }));
}

function classifyRsi(rsi: number | null): string {
  if (rsi == null) return "unknown";
  if (rsi < 30) return "oversold";
  if (rsi > 70) return "overbought";
  if (rsi >= 40 && rsi <= 60) return "neutral";
  return rsi < 40 ? "weak" : "strong";
}

function classifySmaAlignment(indicators: ComputedIndicators, price: number): string {
  const { sma20, sma50, sma200 } = indicators.sma;
  if (sma20 && sma50 && sma200) {
    if (price > sma20 && sma20 > sma50 && sma50 > sma200) return "bullish";
    if (price < sma20 && sma20 < sma50 && sma50 < sma200) return "bearish";
  }
  if (sma200 && price > sma200) return "above-200";
  if (sma200 && price < sma200) return "below-200";
  return "mixed";
}

/**
 * Computes indicators on both daily and weekly timeframes, then checks alignment.
 * Signals are more reliable when both timeframes agree on direction.
 */
export function computeTimeframeAlignment(dailyBars: OhlcvBar[]): TimeframeAlignment | null {
  if (dailyBars.length < 50) return null; // need enough data

  const weeklyBars = resampleWeekly(dailyBars);
  if (weeklyBars.length < 30) return null; // need ~30 weeks

  const dailyIndicators = computeIndicators(dailyBars);
  const weeklyIndicators = computeIndicators(weeklyBars);

  const currentPrice = dailyBars[dailyBars.length - 1].close;

  const daily = {
    rsiZone: classifyRsi(dailyIndicators.rsi14),
    macdTrend: dailyIndicators.macd.trend,
    smaAlignment: classifySmaAlignment(dailyIndicators, currentPrice),
  };

  const weekly = {
    rsiZone: classifyRsi(weeklyIndicators.rsi14),
    macdTrend: weeklyIndicators.macd.trend,
    smaAlignment: classifySmaAlignment(weeklyIndicators, currentPrice),
  };

  // Determine alignment
  const bullishSignals = [
    daily.macdTrend === "bullish",
    weekly.macdTrend === "bullish",
    daily.smaAlignment === "bullish" || daily.smaAlignment === "above-200",
    weekly.smaAlignment === "bullish" || weekly.smaAlignment === "above-200",
    daily.rsiZone === "oversold", // contrarian bullish
    weekly.rsiZone === "oversold",
  ].filter(Boolean).length;

  const bearishSignals = [
    daily.macdTrend === "bearish",
    weekly.macdTrend === "bearish",
    daily.smaAlignment === "bearish" || daily.smaAlignment === "below-200",
    weekly.smaAlignment === "bearish" || weekly.smaAlignment === "below-200",
    daily.rsiZone === "overbought",
    weekly.rsiZone === "overbought",
  ].filter(Boolean).length;

  // Daily + weekly MACD must agree for "aligned"
  const macdAligned = daily.macdTrend === weekly.macdTrend && daily.macdTrend !== "neutral";
  const smaAligned =
    (daily.smaAlignment === weekly.smaAlignment) ||
    (daily.smaAlignment.includes("bullish") && weekly.smaAlignment.includes("bullish")) ||
    (daily.smaAlignment.includes("bearish") && weekly.smaAlignment.includes("bearish"));

  const aligned = macdAligned || smaAligned;

  let direction: TimeframeAlignment["direction"] = "mixed";
  if (bullishSignals >= 4 && bullishSignals > bearishSignals) direction = "bullish";
  else if (bearishSignals >= 4 && bearishSignals > bullishSignals) direction = "bearish";

  let confidence: TimeframeAlignment["confidence"] = "weak";
  if (aligned && Math.abs(bullishSignals - bearishSignals) >= 3) confidence = "strong";
  else if (aligned) confidence = "moderate";

  return { daily, weekly, aligned, direction, confidence };
}

/**
 * Compute a score adjustment based on timeframe alignment.
 * Used by composite scoring to boost/penalize signals.
 */
export function timeframeAlignmentScore(alignment: TimeframeAlignment | null): {
  adjustment: number;
  factor: string | null;
} {
  if (!alignment) return { adjustment: 0, factor: null };

  if (alignment.aligned && alignment.confidence === "strong") {
    const sign = alignment.direction === "bullish" ? 1 : alignment.direction === "bearish" ? -1 : 0;
    return {
      adjustment: sign * 10,
      factor: `Multi-timeframe ${alignment.direction} alignment (daily + weekly ${alignment.confidence})`,
    };
  }

  if (alignment.aligned && alignment.confidence === "moderate") {
    const sign = alignment.direction === "bullish" ? 1 : alignment.direction === "bearish" ? -1 : 0;
    return {
      adjustment: sign * 5,
      factor: `Multi-timeframe ${alignment.direction} alignment (daily + weekly ${alignment.confidence})`,
    };
  }

  if (!alignment.aligned && alignment.direction === "mixed") {
    return {
      adjustment: 0,
      factor: "Timeframe conflict — daily and weekly disagree (lower conviction)",
    };
  }

  return { adjustment: 0, factor: null };
}
