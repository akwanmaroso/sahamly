import type { ComputedIndicators } from "@/lib/indicators/types";
import type { RawFundamentals } from "@/lib/market-data/types";
import type { FlowMetrics } from "@/lib/market-data/types";

export type SubScore = {
  score: number; // -100 to +100
  label: string;
  factors: string[];
};

export type CompositeScore = {
  total: number; // -100 to +100
  technical: SubScore;
  fundamental: SubScore;
  flow: SubScore;
  suggestedVerdict: "Accumulate" | "Hold" | "Watch" | "Avoid";
  suggestedConfidence: "High" | "Medium" | "Low";
};

const WEIGHTS = { technical: 0.35, fundamental: 0.35, flow: 0.3 };

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function scoreTechnical(
  indicators: ComputedIndicators,
  currentPrice: number
): SubScore {
  const factors: string[] = [];
  let score = 0;

  // SMA alignment: price above/below moving averages
  const { sma20, sma50, sma200 } = indicators.sma;
  if (sma20 && sma50 && sma200) {
    if (currentPrice > sma20 && sma20 > sma50 && sma50 > sma200) {
      score += 30;
      factors.push("Bullish SMA alignment (price > SMA20 > SMA50 > SMA200)");
    } else if (currentPrice < sma20 && sma20 < sma50 && sma50 < sma200) {
      score -= 30;
      factors.push("Bearish SMA alignment (price < SMA20 < SMA50 < SMA200)");
    } else if (currentPrice > sma200) {
      score += 10;
      factors.push("Price above SMA200 (long-term uptrend)");
    } else {
      score -= 10;
      factors.push("Price below SMA200 (long-term downtrend)");
    }
  }

  // RSI
  const rsi = indicators.rsi14;
  if (rsi != null) {
    if (rsi < 30) {
      score += 20;
      factors.push(`RSI oversold (${rsi})`);
    } else if (rsi > 70) {
      score -= 20;
      factors.push(`RSI overbought (${rsi})`);
    } else if (rsi >= 40 && rsi <= 60) {
      score += 5;
      factors.push(`RSI neutral (${rsi})`);
    }
  }

  // MFI
  const mfi = indicators.mfi14;
  if (mfi != null) {
    if (mfi < 20) {
      score += 15;
      factors.push(`MFI oversold (${mfi}) — volume-weighted buying pressure`);
    } else if (mfi > 80) {
      score -= 15;
      factors.push(`MFI overbought (${mfi}) — volume-weighted selling pressure`);
    }
  }

  // OBV trend
  if (indicators.obv.trend === "rising") {
    score += 15;
    factors.push("OBV rising — volume confirms upward price movement");
  } else if (indicators.obv.trend === "falling") {
    score -= 15;
    factors.push("OBV falling — volume confirms downward price movement");
  }

  // Volume ratio
  if (indicators.volume.ratio > 2) {
    score += 10;
    factors.push(`High volume (${indicators.volume.ratio}x avg) — strong interest`);
  } else if (indicators.volume.ratio < 0.5) {
    score -= 5;
    factors.push(`Low volume (${indicators.volume.ratio}x avg) — weak interest`);
  }

  return { score: clamp(score, -100, 100), label: "Technical", factors };
}

function scoreFundamental(f: RawFundamentals): SubScore {
  const factors: string[] = [];
  let score = 0;

  // PE valuation vs sector
  if (f.peRatio > 0 && f.sectorAvgPe > 0) {
    const peDiscount = (f.sectorAvgPe - f.peRatio) / f.sectorAvgPe;
    if (peDiscount > 0.2) {
      score += 20;
      factors.push(`P/E ${f.peRatio.toFixed(1)} undervalued vs sector avg ${f.sectorAvgPe.toFixed(1)}`);
    } else if (peDiscount < -0.2) {
      score -= 15;
      factors.push(`P/E ${f.peRatio.toFixed(1)} overvalued vs sector avg ${f.sectorAvgPe.toFixed(1)}`);
    }
  } else if (f.peRatio > 0) {
    // No sector avg, use absolute PE
    if (f.peRatio < 10) {
      score += 15;
      factors.push(`Low P/E (${f.peRatio.toFixed(1)})`);
    } else if (f.peRatio > 30) {
      score -= 10;
      factors.push(`High P/E (${f.peRatio.toFixed(1)})`);
    }
  }

  // PBV
  if (f.pbvRatio > 0) {
    if (f.pbvRatio < 1) {
      score += 15;
      factors.push(`P/BV below 1 (${f.pbvRatio.toFixed(2)}) — trading below book value`);
    } else if (f.pbvRatio > 5) {
      score -= 10;
      factors.push(`High P/BV (${f.pbvRatio.toFixed(2)})`);
    }
  }

  // ROE
  if (f.roe > 0.15) {
    score += 15;
    factors.push(`Strong ROE (${(f.roe * 100).toFixed(1)}%)`);
  } else if (f.roe > 0 && f.roe < 0.08) {
    score -= 10;
    factors.push(`Weak ROE (${(f.roe * 100).toFixed(1)}%)`);
  }

  // EPS growth
  if (f.epsGrowthYoy > 0.15) {
    score += 20;
    factors.push(`Strong EPS growth (${(f.epsGrowthYoy * 100).toFixed(1)}% YoY)`);
  } else if (f.epsGrowthYoy < -0.1) {
    score -= 20;
    factors.push(`EPS declining (${(f.epsGrowthYoy * 100).toFixed(1)}% YoY)`);
  }

  // Revenue growth
  if (f.revenueGrowthYoy > 0.1) {
    score += 10;
    factors.push(`Revenue growing (${(f.revenueGrowthYoy * 100).toFixed(1)}% YoY)`);
  } else if (f.revenueGrowthYoy < -0.05) {
    score -= 10;
    factors.push(`Revenue declining (${(f.revenueGrowthYoy * 100).toFixed(1)}% YoY)`);
  }

  // Debt/Equity
  if (f.debtToEquity > 0) {
    if (f.debtToEquity > 2) {
      score -= 15;
      factors.push(`High leverage (D/E ${f.debtToEquity.toFixed(2)})`);
    } else if (f.debtToEquity < 0.5) {
      score += 10;
      factors.push(`Low leverage (D/E ${f.debtToEquity.toFixed(2)})`);
    }
  }

  // Dividend yield
  if (f.dividendYield > 0.05) {
    score += 10;
    factors.push(`Attractive dividend yield (${(f.dividendYield * 100).toFixed(1)}%)`);
  }

  return { score: clamp(score, -100, 100), label: "Fundamental", factors };
}

function scoreFlow(flowMetrics: FlowMetrics | undefined): SubScore {
  if (!flowMetrics) {
    return { score: 0, label: "Flow", factors: ["No broker flow data available"] };
  }

  const factors: string[] = [];
  let score = 0;

  // Foreign flow score is already -100 to +100, use it directly (weighted)
  score += flowMetrics.foreignFlowScore * 0.4;
  if (flowMetrics.foreignFlowScore > 30) {
    factors.push(`Strong foreign inflow (score: +${flowMetrics.foreignFlowScore})`);
  } else if (flowMetrics.foreignFlowScore < -30) {
    factors.push(`Heavy foreign outflow (score: ${flowMetrics.foreignFlowScore})`);
  }

  // Momentum
  if (flowMetrics.flowMomentum === "accelerating") {
    score += 15;
    factors.push("Flow momentum accelerating");
  } else if (flowMetrics.flowMomentum === "decelerating") {
    score -= 10;
    factors.push("Flow momentum decelerating");
  }

  // Consecutive buy days
  if (flowMetrics.consecutiveForeignBuyDays >= 5) {
    score += 20;
    factors.push(`${flowMetrics.consecutiveForeignBuyDays} consecutive foreign buy days`);
  } else if (flowMetrics.consecutiveForeignBuyDays === 0) {
    score -= 5;
    factors.push("No consecutive foreign buy streak");
  }

  // Trend reversal
  if (flowMetrics.flowTrend.reversalDetected) {
    if (flowMetrics.flowTrend.reversalType === "bullish") {
      score += 15;
      factors.push("Bullish flow reversal detected (short-term turning positive)");
    } else {
      score -= 15;
      factors.push("Bearish flow reversal detected (short-term turning negative)");
    }
  }

  // Broker concentration
  if (flowMetrics.brokerConcentrationScore > 50) {
    factors.push(`High broker concentration (${flowMetrics.brokerConcentrationScore}/100) — single broker dominates`);
  }

  return { score: clamp(Math.round(score), -100, 100), label: "Flow", factors };
}

export function computeCompositeScore(
  indicators: ComputedIndicators,
  currentPrice: number,
  fundamentals: RawFundamentals,
  flowMetrics: FlowMetrics | undefined
): CompositeScore {
  const technical = scoreTechnical(indicators, currentPrice);
  const fundamental = scoreFundamental(fundamentals);
  const flow = scoreFlow(flowMetrics);

  const total = Math.round(
    technical.score * WEIGHTS.technical +
    fundamental.score * WEIGHTS.fundamental +
    flow.score * WEIGHTS.flow
  );

  // Map score to verdict
  let suggestedVerdict: CompositeScore["suggestedVerdict"];
  if (total >= 30) suggestedVerdict = "Accumulate";
  else if (total >= 0) suggestedVerdict = "Hold";
  else if (total >= -20) suggestedVerdict = "Watch";
  else suggestedVerdict = "Avoid";

  // Confidence based on agreement between sub-scores
  const signs = [
    Math.sign(technical.score),
    Math.sign(fundamental.score),
    Math.sign(flow.score),
  ];
  const agreement = signs.filter((s) => s === Math.sign(total)).length;
  let suggestedConfidence: CompositeScore["suggestedConfidence"];
  if (agreement === 3 && Math.abs(total) >= 30) suggestedConfidence = "High";
  else if (agreement >= 2) suggestedConfidence = "Medium";
  else suggestedConfidence = "Low";

  return {
    total: clamp(total, -100, 100),
    technical,
    fundamental,
    flow,
    suggestedVerdict,
    suggestedConfidence,
  };
}
