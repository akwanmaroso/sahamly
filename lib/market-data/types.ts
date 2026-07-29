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
  buyAvgSize?: number; // average buy transaction size (IDR)
  sellAvgSize?: number; // average sell transaction size (IDR)
  buyFreq?: number; // number of buy transactions
  sellFreq?: number; // number of sell transactions
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

export type SmartMoneyMetrics = {
  smartMoneyScore: number; // -100 to +100 (whale-weighted)
  whaleNetFlow: number; // IDR net from tier-1 brokers
  retailNetFlow: number; // IDR net from tier-3 brokers
  smartVsRetail: "aligned" | "divergent" | "neutral";
  topWhaleActivity: { code: string; name: string; netValue: number }[];
};

export type AccumulationPattern = {
  detected: boolean;
  type: "stealth_accumulation" | "stealth_distribution" | "absorption" | "coordinated_entry" | null;
  description: string;
  brokerCode?: string; // the broker doing it
  daysActive?: number;
  confidence: "high" | "medium" | "low";
};

export type BlockTradeInfo = {
  detected: boolean;
  signals: {
    brokerCode: string;
    brokerName: string;
    direction: "buy" | "sell";
    avgTransactionSize: number;
    totalValue: number;
    isBlockTrade: boolean;
    description: string;
  }[];
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
  smartMoney?: SmartMoneyMetrics;
  accumulationPatterns?: AccumulationPattern[];
  blockTrades?: BlockTradeInfo;
};
