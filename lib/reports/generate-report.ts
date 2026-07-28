import type { SupabaseClient } from "@supabase/supabase-js";
import { createGeminiClient } from "@/lib/gemini/client";
import type { ComputedIndicators } from "@/lib/indicators/types";
import type { OhlcvBar, RawFlow, RawFundamentals } from "@/lib/market-data";
import { computeDeterministicTechnical, type DeterministicTechnical } from "./deterministic";
import { geminiNarrativeSchema, narrativeReportSchema, reportJsonSchema, type ReportJson } from "./schema";

const GEMINI_MODEL = "gemini-2.5-flash";

type SnapshotForReport = {
  id: string;
  as_of_date: string;
  price_data: { ohlcv: OhlcvBar[]; indicators: ComputedIndicators };
  fundamental_data: RawFundamentals;
  flow_data: RawFlow;
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
  technical: DeterministicTechnical
): string {
  const { indicators } = snapshot.price_data;
  const f = snapshot.fundamental_data;
  const flow = snapshot.flow_data;

  return `You are a disciplined equity research assistant writing an internal note about an Indonesian (IDX) stock, for a single retail investor's personal watchlist dashboard. This is not investment advice — write plainly and avoid hype.

Use ONLY the facts below. Every number here was computed deterministically from real market data, not by you — do not invent, restate differently, or adjust any numbers. Your job is to write the narrative reasoning fields only.

Ticker: ${ticker.symbol} — ${ticker.name} (${ticker.sector ?? "sector unknown"})
As of: ${snapshot.as_of_date}
Current price: ${currentPrice}

Technical facts:
- SMA20: ${indicators.sma.sma20}, SMA50: ${indicators.sma.sma50}, SMA200: ${indicators.sma.sma200}
- RSI14: ${indicators.rsi14}
- Volume: latest ${indicators.volume.latest}, 20-day average ${indicators.volume.avg20d}, ratio ${indicators.volume.ratio}x
- Support levels: ${technical.supportLevels.join(", ")}
- Resistance levels: ${technical.resistanceLevels.join(", ")}
- Deterministic entry zone: ${technical.entryZone.join("-")}, stop-loss: ${technical.stopLoss}, target zone: ${technical.targetZone.join("-")}

Fundamental facts:
- P/E: ${f.peRatio} (sector average ${f.sectorAvgPe})
- P/BV: ${f.pbvRatio} (sector average ${f.sectorAvgPbv})
- EPS growth YoY: ${pct(f.epsGrowthYoy)}
- Revenue growth YoY: ${pct(f.revenueGrowthYoy)}
- ROE: ${pct(f.roe)}
- Debt/Equity: ${f.debtToEquity}
- Dividend yield: ${pct(f.dividendYield)}
- Market cap: ${f.marketCap.toLocaleString("en-US")} IDR

Flow facts:
- Foreign net buy/sell value: ${flow.foreignNetBuyValue.toLocaleString("en-US")} IDR (positive = net buy)
- Foreign net buy/sell volume: ${flow.foreignNetBuyVolume.toLocaleString("en-US")} shares
- Foreign ownership: ${pct(flow.foreignOwnershipPct)}
- Consecutive foreign net-buy days: ${flow.consecutiveForeignBuyDays}

Write, in the required JSON shape:
- verdict and confidence, based on the overall picture above
- summary: a one-line reason for the verdict
- technical.phase: accumulation / markup / distribution / markdown, based on the price/volume/moving-average facts
- technical.volume_note: what the volume ratio and recent volume imply
- technical.unusual_activity: anything unusual in volume or foreign flow, or null if nothing stands out
- fundamental fields: compare to sector averages, describe growth and balance-sheet health, and dividend profile
- catalysts_and_risks: recent_drivers, bear_case, and a short (possibly empty) list of upcoming_events — keep these sector-general since no news feed is wired up yet
- entry_exit.position_sizing_note: brief risk-sizing guidance consistent with the entry zone and stop-loss given above`;
}

export async function generateReport(
  supabase: SupabaseClient,
  ticker: TickerForReport,
  snapshot: SnapshotForReport
): Promise<{ id: string }> {
  const currentPrice = snapshot.price_data.ohlcv.at(-1)!.close;
  const technical = computeDeterministicTechnical(snapshot.price_data.indicators, currentPrice);

  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: buildPrompt(ticker, snapshot, currentPrice, technical),
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
      position_sizing_note: narrative.entry_exit.position_sizing_note,
    },
    data_as_of: snapshot.as_of_date,
    data_sources: ["Simulated market data (mock fetcher)"],
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
