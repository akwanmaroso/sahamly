export type OhlcvBar = {
  date: string; // ISO date, e.g. "2026-07-28"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type RawFundamentals = {
  marketCap: number;
  peRatio: number;
  pbvRatio: number;
  epsGrowthYoy: number; // fraction, e.g. 0.12 = +12%
  revenueGrowthYoy: number;
  roe: number;
  debtToEquity: number;
  dividendYield: number;
  sectorAvgPe: number;
  sectorAvgPbv: number;
};

export type RawFlow = {
  avgVolume20d: number;
  latestVolume: number;
  foreignNetBuyValue: number; // IDR, negative means net sell
  foreignNetBuyVolume: number; // shares, negative means net sell
  foreignOwnershipPct: number;
  consecutiveForeignBuyDays: number;
};

export type RawTickerData = {
  symbol: string;
  asOfDate: string; // ISO date
  ohlcv: OhlcvBar[];
  fundamentals: RawFundamentals;
  flow: RawFlow;
  source: string;
};

// ---------------------------------------------------------------------------
// Broker flow types (Index Alpha API + computed metrics)
// ---------------------------------------------------------------------------

export type BrokerActivity = {
  brokerCode: string;
  type: "foreign" | "domestic";
  buyVolume: number;
  buyValue: number;
  sellVolume: number;
  sellValue: number;
  netValue: number;
};

export type DailyForeignFlow = {
  date: string;
  foreignBuy: number;
  foreignSell: number;
  netForeign: number;
};

export type FlowTrend = {
  shortTermAvg: number; // 5-day avg net foreign
  mediumTermAvg: number; // 20-day avg net foreign
  trendDirection: "accumulating" | "distributing" | "neutral";
  reversalDetected: boolean; // true if short-term direction differs from medium-term
  reversalType: "bullish" | "bearish" | null; // bullish = was distributing, now accumulating
  trendStrength: number; // 0-100
};

export type FlowMetrics = {
  foreignFlowScore: number; // -100 to +100
  brokerConcentrationScore: number; // 0 to 100
  flowMomentum: "accelerating" | "steady" | "decelerating";
  consecutiveForeignBuyDays: number;
  topBuyers: BrokerActivity[];
  topSellers: BrokerActivity[];
  dailyForeignFlow: DailyForeignFlow[];
  flowTrend: FlowTrend;
};
