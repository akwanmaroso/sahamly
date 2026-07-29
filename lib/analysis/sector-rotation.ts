import type { ReportJson } from "@/lib/reports/schema";

export type SectorFlow = {
  sector: string;
  tickerCount: number;
  avgFlowScore: number; // -100 to +100
  avgTrendStrength: number; // 0-100
  netDirection: "inflow" | "outflow" | "neutral";
  dominantMomentum: "accelerating" | "steady" | "decelerating";
  tickers: { symbol: string; flowScore: number; verdict: string }[];
};

export type SectorRotationResult = {
  sectors: SectorFlow[];
  rotation: {
    inflowSectors: string[];
    outflowSectors: string[];
    signal: string | null; // human-readable rotation signal
  };
};

type TickerInput = {
  symbol: string;
  sector: string | null;
  reportJson: ReportJson | null;
};

/**
 * Analyze sector rotation from watchlist data.
 * Groups tickers by sector, aggregates flow scores, and detects
 * which sectors money is flowing into/out of.
 */
export function analyzeSectorRotation(
  tickers: TickerInput[]
): SectorRotationResult {
  // Group by sector
  const sectorMap = new Map<string, TickerInput[]>();
  for (const t of tickers) {
    const sector = t.sector || "Unknown";
    const list = sectorMap.get(sector) ?? [];
    list.push(t);
    sectorMap.set(sector, list);
  }

  const sectors: SectorFlow[] = [];

  for (const [sector, group] of sectorMap) {
    const withFlow = group.filter((t) => t.reportJson?.money_flow);
    if (withFlow.length === 0) {
      sectors.push({
        sector,
        tickerCount: group.length,
        avgFlowScore: 0,
        avgTrendStrength: 0,
        netDirection: "neutral",
        dominantMomentum: "steady",
        tickers: group.map((t) => ({
          symbol: t.symbol,
          flowScore: 0,
          verdict: t.reportJson?.verdict ?? "—",
        })),
      });
      continue;
    }

    const flowScores = withFlow.map(
      (t) => t.reportJson!.money_flow!.foreign_flow_score
    );
    const avgFlowScore =
      Math.round(
        flowScores.reduce((s, v) => s + v, 0) / flowScores.length
      );

    const trendStrengths = withFlow
      .map((t) => t.reportJson!.money_flow!.flow_trend?.trend_strength)
      .filter((v): v is number => v != null);
    const avgTrendStrength =
      trendStrengths.length > 0
        ? Math.round(
            trendStrengths.reduce((s, v) => s + v, 0) / trendStrengths.length
          )
        : 0;

    // Count momentum types
    const momentumCounts = { accelerating: 0, steady: 0, decelerating: 0 };
    for (const t of withFlow) {
      const m = t.reportJson!.money_flow!.flow_momentum;
      momentumCounts[m]++;
    }
    const dominantMomentum = (
      Object.entries(momentumCounts) as [keyof typeof momentumCounts, number][]
    ).sort((a, b) => b[1] - a[1])[0][0];

    const netDirection: SectorFlow["netDirection"] =
      avgFlowScore > 15
        ? "inflow"
        : avgFlowScore < -15
          ? "outflow"
          : "neutral";

    sectors.push({
      sector,
      tickerCount: group.length,
      avgFlowScore,
      avgTrendStrength,
      netDirection,
      dominantMomentum,
      tickers: group.map((t) => ({
        symbol: t.symbol,
        flowScore: t.reportJson?.money_flow?.foreign_flow_score ?? 0,
        verdict: t.reportJson?.verdict ?? "—",
      })),
    });
  }

  // Sort by flow score (strongest inflow first)
  sectors.sort((a, b) => b.avgFlowScore - a.avgFlowScore);

  const inflowSectors = sectors
    .filter((s) => s.netDirection === "inflow")
    .map((s) => s.sector);
  const outflowSectors = sectors
    .filter((s) => s.netDirection === "outflow")
    .map((s) => s.sector);

  let signal: string | null = null;
  if (inflowSectors.length > 0 && outflowSectors.length > 0) {
    signal = `Money rotating from ${outflowSectors.join(", ")} into ${inflowSectors.join(", ")}`;
  } else if (inflowSectors.length > 0) {
    signal = `Foreign inflow concentrated in ${inflowSectors.join(", ")}`;
  } else if (outflowSectors.length > 0) {
    signal = `Foreign outflow from ${outflowSectors.join(", ")}`;
  }

  return {
    sectors,
    rotation: { inflowSectors, outflowSectors, signal },
  };
}
