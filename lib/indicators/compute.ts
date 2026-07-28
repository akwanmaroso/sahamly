import { RSI, SMA } from "technicalindicators";
import type { OhlcvBar } from "@/lib/market-data";
import type { ComputedIndicators } from "./types";

function lastOrNull(values: number[]): number | null {
  return values.length ? Math.round(values[values.length - 1] * 100) / 100 : null;
}

/** A bar is a swing high/low if it is the extreme point within `window` bars on each side. */
function detectSwingPoints(bars: OhlcvBar[], window = 5) {
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = window; i < bars.length - window; i++) {
    const slice = bars.slice(i - window, i + window + 1);
    const bar = bars[i];
    if (bar.high === Math.max(...slice.map((b) => b.high))) {
      swingHighs.push(bar.high);
    }
    if (bar.low === Math.min(...slice.map((b) => b.low))) {
      swingLows.push(bar.low);
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

  const supportLevels = clusterLevels(swingLows)
    .filter((level) => level < currentPrice)
    .sort((a, b) => b - a) // closest to price first
    .slice(0, 2)
    .sort((a, b) => a - b);

  const resistanceLevels = clusterLevels(swingHighs)
    .filter((level) => level > currentPrice)
    .sort((a, b) => a - b) // closest to price first
    .slice(0, 2);

  return { supportLevels, resistanceLevels };
}

/** Computes deterministic technical indicators from raw OHLCV. No AI, no invented numbers. */
export function computeIndicators(ohlcv: OhlcvBar[]): ComputedIndicators {
  const closes = ohlcv.map((bar) => bar.close);
  const volumes = ohlcv.map((bar) => bar.volume);
  const currentPrice = closes[closes.length - 1];
  const latestVolume = volumes[volumes.length - 1];

  const sma20 = lastOrNull(SMA.calculate({ period: 20, values: closes }));
  const sma50 = lastOrNull(SMA.calculate({ period: 50, values: closes }));
  const sma200 = lastOrNull(SMA.calculate({ period: 200, values: closes }));
  const rsi14 = lastOrNull(RSI.calculate({ period: 14, values: closes }));

  const volumeSma20 = lastOrNull(SMA.calculate({ period: 20, values: volumes })) ?? latestVolume;
  const volumeRatio = volumeSma20 > 0 ? Number((latestVolume / volumeSma20).toFixed(2)) : 1;

  const { supportLevels, resistanceLevels } = computeSupportResistance(ohlcv, currentPrice);

  return {
    sma: { sma20, sma50, sma200 },
    rsi14,
    volume: { avg20d: Math.round(volumeSma20), latest: latestVolume, ratio: volumeRatio },
    supportLevels,
    resistanceLevels,
  };
}
