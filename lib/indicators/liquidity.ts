import type { OhlcvBar } from "@/lib/market-data/types";

export type LiquidityMetrics = {
  /** Estimated bid-ask spread as percentage of price (lower = more liquid). */
  estimatedSpreadPct: number;
  /** Average daily trading value in IDR over the lookback period. */
  avgDailyValue: number;
  /** Amihud illiquidity ratio — price impact per unit of volume. Higher = less liquid. */
  amihudRatio: number;
  /** Liquidity score 0-100 (100 = most liquid). */
  liquidityScore: number;
  /** Human-readable tier. */
  tier: "high" | "medium" | "low" | "illiquid";
};

/**
 * Estimates liquidity metrics from daily OHLCV data.
 *
 * Since we don't have order book data, we use established proxies:
 * - **Corwin-Schultz spread estimator**: estimates bid-ask spread from daily high/low prices.
 *   Based on the paper "A Simple Way to Estimate Bid-Ask Spreads from Daily High and Low Prices"
 *   (Corwin & Schultz, 2012, Journal of Finance).
 * - **Amihud illiquidity ratio**: |return| / volume, measuring price impact.
 * - **Average daily trading value**: straightforward volume × price.
 */
export function computeLiquidityMetrics(bars: OhlcvBar[], lookback = 20): LiquidityMetrics | null {
  if (bars.length < lookback + 1) return null;

  const recentBars = bars.slice(-lookback);
  const prevBars = bars.slice(-(lookback + 1), -1);

  // --- Corwin-Schultz Spread Estimator ---
  // Uses 2-day high-low ranges to separate volatility from spread
  let spreadSum = 0;
  let spreadCount = 0;

  for (let i = 0; i < recentBars.length - 1; i++) {
    const bar1 = recentBars[i];
    const bar2 = recentBars[i + 1];

    // Two-day high and low
    const h2 = Math.max(bar1.high, bar2.high);
    const l2 = Math.min(bar1.low, bar2.low);

    // Beta = sum of squared log(high/low) for individual days
    const beta =
      Math.log(bar1.high / bar1.low) ** 2 +
      Math.log(bar2.high / bar2.low) ** 2;

    // Gamma = squared log of 2-day high/low
    const gamma = Math.log(h2 / l2) ** 2;

    // Alpha from the Corwin-Schultz formula
    const sqrt2 = Math.sqrt(2);
    const denom = 3 - 2 * sqrt2;
    const alpha = (Math.sqrt(2 * beta) - Math.sqrt(beta)) / denom -
      Math.sqrt(gamma / denom);

    // Spread = 2(e^alpha - 1) / (1 + e^alpha)
    if (alpha > 0) {
      const eAlpha = Math.exp(alpha);
      const spread = (2 * (eAlpha - 1)) / (1 + eAlpha);
      if (spread > 0 && spread < 0.2) { // cap at 20% to filter outliers
        spreadSum += spread;
        spreadCount++;
      }
    }
  }

  const estimatedSpreadPct = spreadCount > 0
    ? Math.round((spreadSum / spreadCount) * 10000) / 100 // as percentage
    : 0;

  // --- Average daily trading value ---
  const avgDailyValue = Math.round(
    recentBars.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / recentBars.length
  );

  // --- Amihud Illiquidity Ratio ---
  let amihudSum = 0;
  let amihudCount = 0;

  for (let i = 0; i < recentBars.length; i++) {
    const bar = recentBars[i];
    const prev = i === 0 ? prevBars[prevBars.length - 1] : recentBars[i - 1];
    const dailyValue = bar.close * bar.volume;
    if (dailyValue > 0 && prev.close > 0) {
      const absReturn = Math.abs((bar.close - prev.close) / prev.close);
      amihudSum += absReturn / (dailyValue / 1e9); // normalize to billions IDR
      amihudCount++;
    }
  }

  const amihudRatio = amihudCount > 0
    ? Math.round((amihudSum / amihudCount) * 1000) / 1000
    : 0;

  // --- Liquidity Score (0-100) ---
  // Combine: trading value (50%), spread (30%), Amihud (20%)
  let score = 0;

  // Trading value score: IDX context (in IDR)
  if (avgDailyValue >= 50e9) score += 50;       // > 50B IDR/day = highly liquid
  else if (avgDailyValue >= 10e9) score += 40;   // > 10B
  else if (avgDailyValue >= 1e9) score += 25;    // > 1B
  else if (avgDailyValue >= 100e6) score += 10;  // > 100M
  // else: 0

  // Spread score: lower is better
  if (estimatedSpreadPct < 0.3) score += 30;       // very tight
  else if (estimatedSpreadPct < 0.8) score += 20;   // normal
  else if (estimatedSpreadPct < 2.0) score += 10;   // wide
  // else: 0 (very wide)

  // Amihud score: lower is better (less price impact per volume)
  if (amihudRatio < 0.01) score += 20;
  else if (amihudRatio < 0.1) score += 15;
  else if (amihudRatio < 0.5) score += 10;
  else if (amihudRatio < 1.0) score += 5;
  // else: 0

  let tier: LiquidityMetrics["tier"];
  if (score >= 70) tier = "high";
  else if (score >= 40) tier = "medium";
  else if (score >= 20) tier = "low";
  else tier = "illiquid";

  return {
    estimatedSpreadPct,
    avgDailyValue,
    amihudRatio,
    liquidityScore: score,
    tier,
  };
}
