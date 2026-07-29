export type ComputedIndicators = {
  sma: {
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
  };
  rsi14: number | null;
  mfi14: number | null;
  macd: {
    macd: number | null;
    signal: number | null;
    histogram: number | null;
    trend: "bullish" | "bearish" | "neutral";
  };
  atr14: number | null;
  bollingerBands: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    percentB: number | null; // 0-1, where price sits within bands
    bandwidth: number | null; // band width as % of middle
  };
  obv: {
    current: number;
    sma20: number | null;
    trend: "rising" | "falling" | "flat";
  };
  divergence: {
    rsiDivergence: "bullish" | "bearish" | null;
    mfiDivergence: "bullish" | "bearish" | null;
  };
  volume: {
    avg20d: number;
    latest: number;
    ratio: number;
  };
  /** Ascending, below the current price. May have fewer than 2 entries near new lows. */
  supportLevels: number[];
  /** Ascending, above the current price. May have fewer than 2 entries near new highs. */
  resistanceLevels: number[];
};
