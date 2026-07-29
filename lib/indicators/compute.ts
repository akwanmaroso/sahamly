import { ATR, BollingerBands, MACD, MFI, OBV, RSI, SMA } from "technicalindicators";
import type { OhlcvBar } from "@/lib/market-data";
import type { ComputedIndicators } from "./types";

function lastOrNull(values: number[]): number | null {
  return values.length ? Math.round(values[values.length - 1] * 100) / 100 : null;
}

/** A bar is a swing high/low if it is the extreme point within `window` bars on each side. */
function detectSwingPoints(bars: OhlcvBar[], window = 5) {
  const swingHighs: { index: number; value: number }[] = [];
  const swingLows: { index: number; value: number }[] = [];

  for (let i = window; i < bars.length - window; i++) {
    const slice = bars.slice(i - window, i + window + 1);
    const bar = bars[i];
    if (bar.high === Math.max(...slice.map((b) => b.high))) {
      swingHighs.push({ index: i, value: bar.high });
    }
    if (bar.low === Math.min(...slice.map((b) => b.low))) {
      swingLows.push({ index: i, value: bar.low });
    }
  }

  return { swingHighs, swingLows };
}

/** Merges nearby levels (within toleranceFrac of each other) into a single averaged level. */
function clusterLevels(levels: number[], toleranceFrac = 0.015): number[] {
  if (!levels.length) return [];

  const sorted = [...levels].sort((a, b) => a - b);
  const clusters: number[][] = [];

  for (const level of sorted) {
    const currentCluster = clusters[clusters.length - 1];
    const clusterTail = currentCluster?.[currentCluster.length - 1];
    if (clusterTail !== undefined && Math.abs(level - clusterTail) / clusterTail <= toleranceFrac) {
      currentCluster.push(level);
    } else {
      clusters.push([level]);
    }
  }

  return clusters.map((cluster) =>
    Math.round(cluster.reduce((sum, v) => sum + v, 0) / cluster.length)
  );
}

function computeSupportResistance(bars: OhlcvBar[], currentPrice: number) {
  const { swingHighs, swingLows } = detectSwingPoints(bars);

  const supportLevels = clusterLevels(swingLows.map((s) => s.value))
    .filter((level) => level < currentPrice)
    .sort((a, b) => b - a) // closest to price first
    .slice(0, 2)
    .sort((a, b) => a - b);

  const resistanceLevels = clusterLevels(swingHighs.map((s) => s.value))
    .filter((level) => level > currentPrice)
    .sort((a, b) => a - b) // closest to price first
    .slice(0, 2);

  return { supportLevels, resistanceLevels };
}

/**
 * Detect price/indicator divergence — one of the strongest reversal signals.
 * Bullish divergence: price makes lower low, but indicator makes higher low.
 * Bearish divergence: price makes higher high, but indicator makes lower high.
 */
function detectDivergence(
  bars: OhlcvBar[],
  indicatorValues: number[],
  lookback = 50
): "bullish" | "bearish" | null {
  if (bars.length < lookback || indicatorValues.length < lookback) return null;

  // Align indicator values to the end of bars
  const offset = bars.length - indicatorValues.length;
  const recentBars = bars.slice(-lookback);
  const recentIndicator = indicatorValues.slice(-lookback);

  // Find swing lows in price for bullish divergence
  const { swingLows, swingHighs } = detectSwingPoints(recentBars, 3);

  // Bullish divergence: last 2 swing lows — price lower, indicator higher
  if (swingLows.length >= 2) {
    const prev = swingLows[swingLows.length - 2];
    const curr = swingLows[swingLows.length - 1];
    const prevIdx = prev.index - offset;
    const currIdx = curr.index - offset;
    if (
      prevIdx >= 0 && currIdx >= 0 &&
      prevIdx < recentIndicator.length && currIdx < recentIndicator.length &&
      curr.value < prev.value && // price: lower low
      recentIndicator[currIdx] > recentIndicator[prevIdx] // indicator: higher low
    ) {
      return "bullish";
    }
  }

  // Bearish divergence: last 2 swing highs — price higher, indicator lower
  if (swingHighs.length >= 2) {
    const prev = swingHighs[swingHighs.length - 2];
    const curr = swingHighs[swingHighs.length - 1];
    const prevIdx = prev.index - offset;
    const currIdx = curr.index - offset;
    if (
      prevIdx >= 0 && currIdx >= 0 &&
      prevIdx < recentIndicator.length && currIdx < recentIndicator.length &&
      curr.value > prev.value && // price: higher high
      recentIndicator[currIdx] < recentIndicator[prevIdx] // indicator: lower high
    ) {
      return "bearish";
    }
  }

  return null;
}

/** Computes deterministic technical indicators from raw OHLCV. No AI, no invented numbers. */
export function computeIndicators(ohlcv: OhlcvBar[]): ComputedIndicators {
  const highs = ohlcv.map((bar) => bar.high);
  const lows = ohlcv.map((bar) => bar.low);
  const closes = ohlcv.map((bar) => bar.close);
  const volumes = ohlcv.map((bar) => bar.volume);
  const currentPrice = closes[closes.length - 1];
  const latestVolume = volumes[volumes.length - 1];

  // --- Moving Averages ---
  const sma20 = lastOrNull(SMA.calculate({ period: 20, values: closes }));
  const sma50 = lastOrNull(SMA.calculate({ period: 50, values: closes }));
  const sma200 = lastOrNull(SMA.calculate({ period: 200, values: closes }));

  // --- RSI ---
  const rsiValues = RSI.calculate({ period: 14, values: closes });
  const rsi14 = lastOrNull(rsiValues);

  // --- MFI (14-period) — like RSI but volume-weighted ---
  const mfiValues = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 });
  const mfi14 = lastOrNull(mfiValues);

  // --- MACD (12, 26, 9) — trend direction + momentum ---
  const macdResults = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const lastMacd = macdResults.length > 0 ? macdResults[macdResults.length - 1] : null;
  let macdTrend: "bullish" | "bearish" | "neutral" = "neutral";
  if (lastMacd?.MACD != null && lastMacd?.signal != null) {
    const histogram = lastMacd.MACD - lastMacd.signal;
    // Check if MACD just crossed signal (look at last 2 values)
    if (macdResults.length >= 2) {
      const prevMacd = macdResults[macdResults.length - 2];
      const prevHist = (prevMacd.MACD ?? 0) - (prevMacd.signal ?? 0);
      // Bullish: histogram crossed from negative to positive
      if (histogram > 0 && prevHist <= 0) macdTrend = "bullish";
      // Bearish: histogram crossed from positive to negative
      else if (histogram < 0 && prevHist >= 0) macdTrend = "bearish";
      // Sustained trend
      else if (histogram > 0) macdTrend = "bullish";
      else if (histogram < 0) macdTrend = "bearish";
    }
  }

  // --- ATR (14-period) — volatility measure ---
  const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const atr14 = lastOrNull(atrValues);

  // --- Bollinger Bands (20, 2σ) ---
  const bbResults = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const lastBB = bbResults.length > 0 ? bbResults[bbResults.length - 1] : null;
  let percentB: number | null = null;
  let bandwidth: number | null = null;
  if (lastBB) {
    const range = lastBB.upper - lastBB.lower;
    percentB = range > 0 ? Math.round(((currentPrice - lastBB.lower) / range) * 100) / 100 : null;
    bandwidth = lastBB.middle > 0 ? Math.round((range / lastBB.middle) * 10000) / 100 : null;
  }

  // --- OBV ---
  const obvValues = OBV.calculate({ close: closes, volume: volumes });
  const obvCurrent = obvValues.length > 0 ? obvValues[obvValues.length - 1] : 0;
  const obvSma20 = lastOrNull(SMA.calculate({ period: 20, values: obvValues }));
  let obvTrend: "rising" | "falling" | "flat" = "flat";
  if (obvValues.length >= 5) {
    const recent5 = obvValues.slice(-5);
    const obvSlope = recent5[4] - recent5[0];
    const avgObv = recent5.reduce((s, v) => s + Math.abs(v), 0) / 5;
    const threshold = avgObv * 0.02;
    if (obvSlope > threshold) obvTrend = "rising";
    else if (obvSlope < -threshold) obvTrend = "falling";
  }

  // --- Divergence Detection ---
  const rsiDivergence = detectDivergence(ohlcv, rsiValues);
  const mfiDivergence = detectDivergence(ohlcv, mfiValues);

  // --- Volume ---
  const volumeSma20 = lastOrNull(SMA.calculate({ period: 20, values: volumes })) ?? latestVolume;
  const volumeRatio = volumeSma20 > 0 ? Number((latestVolume / volumeSma20).toFixed(2)) : 1;

  const { supportLevels, resistanceLevels } = computeSupportResistance(ohlcv, currentPrice);

  return {
    sma: { sma20, sma50, sma200 },
    rsi14,
    mfi14,
    macd: {
      macd: lastMacd?.MACD != null ? Math.round(lastMacd.MACD * 100) / 100 : null,
      signal: lastMacd?.signal != null ? Math.round(lastMacd.signal * 100) / 100 : null,
      histogram: lastMacd?.MACD != null && lastMacd?.signal != null
        ? Math.round((lastMacd.MACD - lastMacd.signal) * 100) / 100
        : null,
      trend: macdTrend,
    },
    atr14,
    bollingerBands: {
      upper: lastBB ? Math.round(lastBB.upper) : null,
      middle: lastBB ? Math.round(lastBB.middle) : null,
      lower: lastBB ? Math.round(lastBB.lower) : null,
      percentB,
      bandwidth,
    },
    obv: { current: obvCurrent, sma20: obvSma20, trend: obvTrend },
    divergence: { rsiDivergence, mfiDivergence },
    volume: { avg20d: Math.round(volumeSma20), latest: latestVolume, ratio: volumeRatio },
    supportLevels,
    resistanceLevels,
  };
}
