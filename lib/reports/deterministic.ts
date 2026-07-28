import type { ComputedIndicators } from "@/lib/indicators/types";

export type DeterministicTechnical = {
  supportLevels: [number, number];
  resistanceLevels: [number, number];
  entryZone: [number, number];
  stopLoss: number;
  targetZone: [number, number];
};

/**
 * Derives entry/exit levels and a 2-element support/resistance pair purely from
 * already-computed technical indicators (see lib/indicators/compute.ts). No AI
 * involvement — these are the numbers a report can be traded on, so they must
 * come from real price data, with sane fallbacks when swing points are sparse
 * (e.g. a stock near a new high/low with nothing recent to anchor to).
 */
export function computeDeterministicTechnical(
  indicators: Pick<ComputedIndicators, "supportLevels" | "resistanceLevels">,
  currentPrice: number
): DeterministicTechnical {
  const support = indicators.supportLevels;
  const nearSupport = support.length >= 1 ? support[support.length - 1] : Math.round(currentPrice * 0.95);
  const farSupport = support.length >= 2 ? support[0] : Math.round(nearSupport * 0.95);

  const resistance = indicators.resistanceLevels;
  const nearResistance = resistance.length >= 1 ? resistance[0] : Math.round(currentPrice * 1.08);
  const farResistance = resistance.length >= 2 ? resistance[1] : Math.round(nearResistance * 1.05);

  return {
    supportLevels: [farSupport, nearSupport],
    resistanceLevels: [nearResistance, farResistance],
    entryZone: [nearSupport, currentPrice],
    stopLoss: Math.round(nearSupport * 0.97),
    targetZone: [nearResistance, farResistance],
  };
}
