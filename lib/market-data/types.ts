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
