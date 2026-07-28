export type ComputedIndicators = {
  sma: {
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
  };
  rsi14: number | null;
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
