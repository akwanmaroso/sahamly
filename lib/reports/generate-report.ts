import type { SupabaseClient } from "@supabase/supabase-js";
import { createGeminiClient } from "@/lib/gemini/client";
import type { ComputedIndicators } from "@/lib/indicators/types";
import type { OhlcvBar, RawFlow, RawFundamentals } from "@/lib/market-data";
import type { FlowMetrics } from "@/lib/market-data/types";
import { computeCompositeScore, type CompositeScore } from "./composite-score";
import { computeDeterministicTechnical, type DeterministicTechnical } from "./deterministic";
import { geminiNarrativeSchema, narrativeReportSchema, reportJsonSchema, type ReportJson } from "./schema";

const GEMINI_MODEL = "gemini-2.5-flash";

type SnapshotForReport = {
  id: string;
  as_of_date: string;
  price_data: { ohlcv: OhlcvBar[]; indicators: ComputedIndicators; source?: string };
  fundamental_data: RawFundamentals;
  flow_data: RawFlow & { flowMetrics?: FlowMetrics };
};

type TickerForReport = {
  id: string;
  symbol: string;
  name: string;
  sector: string | null;
};

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function buildPrompt(
  ticker: TickerForReport,
  snapshot: SnapshotForReport,
  currentPrice: number,
  technical: DeterministicTechnical,
  composite: CompositeScore
): string {
  const { indicators } = snapshot.price_data;
  const f = snapshot.fundamental_data;
  const flow = snapshot.flow_data;
  const fm = flow.flowMetrics;

  let flowSection = `Flow facts:
- Foreign net buy/sell value: ${flow.foreignNetBuyValue.toLocaleString("en-US")} IDR (positive = net buy)
- Foreign net buy/sell volume: ${flow.foreignNetBuyVolume.toLocaleString("en-US")} shares
- Foreign ownership: ${pct(flow.foreignOwnershipPct)}
- Consecutive foreign net-buy days: ${flow.consecutiveForeignBuyDays}`;

  if (fm) {
    const topBuyersList = fm.topBuyers
      .map((b) => `${b.brokerCode} (${b.type}): net ${b.netValue.toLocaleString("en-US")} IDR`)
      .join("; ");
    const topSellersList = fm.topSellers
      .map((b) => `${b.brokerCode} (${b.type}): net ${b.netValue.toLocaleString("en-US")} IDR`)
      .join("; ");

    flowSection += `

Broker flow metrics (20-day window):
- Foreign flow score: ${fm.foreignFlowScore} (scale: -100 = heavy selling, +100 = heavy buying)
- Broker concentration score: ${fm.brokerConcentrationScore} (0-100, higher = more concentrated in one broker)
- Flow momentum: ${fm.flowMomentum}
- Flow trend: ${fm.flowTrend.trendDirection} (strength: ${fm.flowTrend.trendStrength}/100)
- 5-day avg net foreign: ${fm.flowTrend.shortTermAvg.toLocaleString("en-US")} IDR
- 20-day avg net foreign: ${fm.flowTrend.mediumTermAvg.toLocaleString("en-US")} IDR${fm.flowTrend.reversalDetected ? `\n- ⚠ REVERSAL DETECTED: ${fm.flowTrend.reversalType} (short-term direction differs from medium-term)` : ""}
- Top buyers: ${topBuyersList || "none"}
- Top sellers: ${topSellersList || "none"}`;
  }

  const moneyFlowInstruction = fm
    ? `
- money_flow.flow_interpretation: interpret the broker flow data — who is accumulating/distributing, is the flow supportive of the verdict?
- money_flow.notable_brokers: mention any standout brokers (e.g. large foreign houses accumulating), or null if nothing notable`
    : "";

  return `You are a disciplined equity research assistant writing an internal note about an Indonesian (IDX) stock, for a single retail investor's personal watchlist dashboard. This is not investment advice — write plainly and avoid hype.

Use ONLY the facts below. Every number here was computed deterministically from real market data, not by you — do not invent, restate differently, or adjust any numbers. Your job is to write the narrative reasoning fields only.

Ticker: ${ticker.symbol} — ${ticker.name} (${ticker.sector ?? "sector unknown"})
As of: ${snapshot.as_of_date}
Current price: ${currentPrice}

Technical facts:
- SMA20: ${indicators.sma.sma20}, SMA50: ${indicators.sma.sma50}, SMA200: ${indicators.sma.sma200}
- RSI14: ${indicators.rsi14}
- MFI14: ${indicators.mfi14} (0-100, like RSI but volume-weighted; >80 overbought, <20 oversold)
- MACD: ${indicators.macd.macd ?? "N/A"} (signal: ${indicators.macd.signal ?? "N/A"}, histogram: ${indicators.macd.histogram ?? "N/A"}, trend: ${indicators.macd.trend})
- Bollinger Bands: upper ${indicators.bollingerBands.upper ?? "N/A"}, middle ${indicators.bollingerBands.middle ?? "N/A"}, lower ${indicators.bollingerBands.lower ?? "N/A"} (%B: ${indicators.bollingerBands.percentB ?? "N/A"}, bandwidth: ${indicators.bollingerBands.bandwidth ?? "N/A"}%)
- OBV trend: ${indicators.obv.trend} (current: ${indicators.obv.current.toLocaleString("en-US")}, 20d avg: ${indicators.obv.sma20?.toLocaleString("en-US") ?? "N/A"})
- Divergence: RSI ${indicators.divergence.rsiDivergence ?? "none"}, MFI ${indicators.divergence.mfiDivergence ?? "none"}
- Volume: latest ${indicators.volume.latest}, 20-day average ${indicators.volume.avg20d}, ratio ${indicators.volume.ratio}x
- Support levels: ${technical.supportLevels.join(", ")}
- Resistance levels: ${technical.resistanceLevels.join(", ")}
- ATR14: ${indicators.atr14 ?? "N/A"} (average true range — daily volatility measure)
- Deterministic entry zone: ${technical.entryZone.join("-")}, stop-loss: ${technical.stopLoss} (ATR-based), target zone: ${technical.targetZone.join("-")}
- Risk/reward ratio: ${technical.riskRewardRatio ?? "N/A"}

Fundamental facts:
- P/E: ${f.peRatio} (sector average ${f.sectorAvgPe})
- P/BV: ${f.pbvRatio} (sector average ${f.sectorAvgPbv})
- EPS growth YoY: ${pct(f.epsGrowthYoy)}
- Revenue growth YoY: ${pct(f.revenueGrowthYoy)}
- ROE: ${pct(f.roe)}
- Debt/Equity: ${f.debtToEquity}
- Dividend yield: ${pct(f.dividendYield)}
- Market cap: ${f.marketCap.toLocaleString("en-US")} IDR

${flowSection}

Composite score (deterministic, weighted 35% technical + 35% fundamental + 30% flow):
- Total: ${composite.total} (scale: -100 to +100)
- Technical sub-score: ${composite.technical.score} — ${composite.technical.factors.join("; ")}
- Fundamental sub-score: ${composite.fundamental.score} — ${composite.fundamental.factors.join("; ")}
- Flow sub-score: ${composite.flow.score} — ${composite.flow.factors.join("; ")}
- Suggested verdict: ${composite.suggestedVerdict} (${composite.suggestedConfidence} confidence)

You should generally follow the suggested verdict unless you see a clear reason to deviate based on the data above. If you deviate, explain why in the summary.

Write, in the required JSON shape:
- verdict and confidence, based on the composite score and overall picture above
- summary: a one-line reason for the verdict
- technical.phase: accumulation / markup / distribution / markdown, based on the price/volume/moving-average facts
- technical.volume_note: what the volume ratio and recent volume imply
- technical.unusual_activity: anything unusual in volume or foreign flow, or null if nothing stands out
- fundamental fields: compare to sector averages, describe growth and balance-sheet health, and dividend profile
- catalysts_and_risks: recent_drivers, bear_case, and a short (possibly empty) list of upcoming_events — keep these sector-general since no news feed is wired up yet
- entry_exit.position_sizing_note: brief risk-sizing guidance consistent with the entry zone and stop-loss given above${moneyFlowInstruction}`;
}

export async function generateReport(
  supabase: SupabaseClient,
  ticker: TickerForReport,
  snapshot: SnapshotForReport
): Promise<{ id: string }> {
  const currentPrice = snapshot.price_data.ohlcv.at(-1)!.close;
  const technical = computeDeterministicTechnical(snapshot.price_data.indicators, currentPrice);
  const composite = computeCompositeScore(
    snapshot.price_data.indicators,
    currentPrice,
    snapshot.fundamental_data,
    snapshot.flow_data.flowMetrics,
    snapshot.fundamental_data.marketCap
  );

  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: buildPrompt(ticker, snapshot, currentPrice, technical, composite),
    config: {
      responseMimeType: "application/json",
      responseSchema: geminiNarrativeSchema,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error(`Gemini returned no text output for ${ticker.symbol}`);
  }

  const narrative = narrativeReportSchema.parse(JSON.parse(text));

  const flowMetrics = snapshot.flow_data.flowMetrics;
  const dataSources = ["IDX official market data (idx.co.id)"];
  if (flowMetrics) {
    dataSources.push("Index Alpha broker flow data (indexalpha.id)");
  }

  const reportJson: ReportJson = {
    verdict: narrative.verdict,
    confidence: narrative.confidence,
    summary: narrative.summary,
    technical: {
      phase: narrative.technical.phase,
      support_levels: technical.supportLevels,
      resistance_levels: technical.resistanceLevels,
      volume_note: narrative.technical.volume_note,
      unusual_activity: narrative.technical.unusual_activity,
    },
    fundamental: narrative.fundamental,
    catalysts_and_risks: narrative.catalysts_and_risks,
    entry_exit: {
      entry_zone: technical.entryZone,
      stop_loss: technical.stopLoss,
      target_zone: technical.targetZone,
      risk_reward_ratio: technical.riskRewardRatio,
      position_sizing_note: narrative.entry_exit.position_sizing_note,
    },
    ...(flowMetrics
      ? {
          money_flow: {
            foreign_flow_score: flowMetrics.foreignFlowScore,
            broker_concentration_score: flowMetrics.brokerConcentrationScore,
            flow_momentum: flowMetrics.flowMomentum,
            consecutive_foreign_buy_days: flowMetrics.consecutiveForeignBuyDays,
            top_buyers: flowMetrics.topBuyers.map((b) => ({
              broker_code: b.brokerCode,
              type: b.type,
              net_value: b.netValue,
            })),
            top_sellers: flowMetrics.topSellers.map((b) => ({
              broker_code: b.brokerCode,
              type: b.type,
              net_value: b.netValue,
            })),
            daily_foreign_flow: flowMetrics.dailyForeignFlow.map((d) => ({
              date: d.date,
              net_foreign: d.netForeign,
            })),
            flow_trend: {
              trend_direction: flowMetrics.flowTrend.trendDirection,
              reversal_detected: flowMetrics.flowTrend.reversalDetected,
              reversal_type: flowMetrics.flowTrend.reversalType,
              trend_strength: flowMetrics.flowTrend.trendStrength,
              short_term_avg: flowMetrics.flowTrend.shortTermAvg,
              medium_term_avg: flowMetrics.flowTrend.mediumTermAvg,
            },
            flow_interpretation: narrative.money_flow?.flow_interpretation ?? "",
            notable_brokers: narrative.money_flow?.notable_brokers ?? null,
          },
        }
      : {}),
    composite_score: {
      total: composite.total,
      technical: { score: composite.technical.score, factors: composite.technical.factors },
      fundamental: { score: composite.fundamental.score, factors: composite.fundamental.factors },
      flow: { score: composite.flow.score, factors: composite.flow.factors },
      suggested_verdict: composite.suggestedVerdict,
      suggested_confidence: composite.suggestedConfidence,
    },
    data_as_of: snapshot.as_of_date,
    data_sources: dataSources,
  };

  const validated = reportJsonSchema.parse(reportJson);

  const { data, error } = await supabase
    .from("reports")
    .insert({
      ticker_id: ticker.id,
      snapshot_id: snapshot.id,
      verdict: validated.verdict,
      confidence: validated.confidence,
      report_json: validated,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create report for ${ticker.symbol}: ${error.message}`);
  }

  return data;
}
