import type { ComputedIndicators } from "@/lib/indicators/types";

export type DeterministicTechnical = {
  supportLevels: [number, number];
  resistanceLevels: [number, number];
  entryZone: [number, number];
  stopLoss: number;
  targetZone: [number, number];
  riskRewardRatio: number | null;
};

/**
 * Derives entry/exit levels and a 2-element support/resistance pair purely from
 * already-computed technical indicators (see lib/indicators/compute.ts). No AI
 * involvement — these are the numbers a report can be traded on, so they must
 * come from real price data, with sane fallbacks when swing points are sparse
 * (e.g. a stock near a new high/low with nothing recent to anchor to).
 *
 * Stop-loss uses ATR (Average True Range) when available — this adapts to the
 * stock's actual volatility rather than using a fixed percentage. A volatile
 * stock gets a wider stop, a stable one gets a tighter stop.
 */
export function computeDeterministicTechnical(
  indicators: Pick<ComputedIndicators, "supportLevels" | "resistanceLevels" | "atr14">,
  currentPrice: number
): DeterministicTechnical {
  const support = indicators.supportLevels;
  const nearSupport = support.length >= 1 ? support[support.length - 1] : Math.round(currentPrice * 0.95);
  const farSupport = support.length >= 2 ? support[0] : Math.round(nearSupport * 0.95);

  const resistance = indicators.resistanceLevels;
  const nearResistance = resistance.length >= 1 ? resistance[0] : Math.round(currentPrice * 1.08);
  const farResistance = resistance.length >= 2 ? resistance[1] : Math.round(nearResistance * 1.05);

  // ATR-based stop-loss: 2× ATR below nearest support.
  // This adapts to volatility — high-volatility stocks get wider stops.
  // Fallback: 3% below support if ATR unavailable.
  const atr = indicators.atr14;
  const stopLoss = atr
    ? Math.round(nearSupport - atr * 2)
    : Math.round(nearSupport * 0.97);

  // Entry zone: between near support and current price
  const entryZone: [number, number] = [nearSupport, currentPrice];

  // Target zone: between near and far resistance
  const targetZone: [number, number] = [nearResistance, farResistance];

  // Risk/reward: potential gain vs potential loss from entry midpoint
  const entryMid = (entryZone[0] + entryZone[1]) / 2;
  const potentialGain = nearResistance - entryMid;
  const potentialLoss = entryMid - stopLoss;
  const riskRewardRatio = potentialLoss > 0
    ? Math.round((potentialGain / potentialLoss) * 100) / 100
    : null;

  return {
    supportLevels: [farSupport, nearSupport],
    resistanceLevels: [nearResistance, farResistance],
    entryZone,
    stopLoss,
    targetZone,
    riskRewardRatio,
  };
}
