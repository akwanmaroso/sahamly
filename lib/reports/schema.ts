import { Type, type Schema } from "@google/genai";
import { z } from "zod";

export const VERDICTS = ["Accumulate", "Hold", "Avoid", "Watch"] as const;
export const CONFIDENCE_LEVELS = ["High", "Medium", "Low"] as const;
export const PHASES = ["accumulation", "markup", "distribution", "markdown"] as const;

/** Narrative-only fields the model is asked to write. Every numeric field in the
 * final report is computed deterministically in TS — see deterministic.ts — and is
 * never requested from or produced by the model. */
export const narrativeReportSchema = z.object({
  verdict: z.enum(VERDICTS),
  confidence: z.enum(CONFIDENCE_LEVELS),
  summary: z.string(),
  technical: z.object({
    phase: z.enum(PHASES),
    volume_note: z.string(),
    unusual_activity: z.string().nullable(),
  }),
  fundamental: z.object({
    valuation_vs_sector: z.string(),
    growth_trend: z.string(),
    balance_sheet_note: z.string(),
    dividend_note: z.string(),
  }),
  catalysts_and_risks: z.object({
    recent_drivers: z.string(),
    bear_case: z.string(),
    upcoming_events: z.array(z.string()),
  }),
  entry_exit: z.object({
    position_sizing_note: z.string(),
  }),
  money_flow: z
    .object({
      flow_interpretation: z.string(),
      notable_brokers: z.string().nullable(),
    })
    .optional(),
});

export type NarrativeReport = z.infer<typeof narrativeReportSchema>;

/** Full report_json shape, matching the report stored in `reports.report_json`. */
export const reportJsonSchema = z.object({
  verdict: z.enum(VERDICTS),
  confidence: z.enum(CONFIDENCE_LEVELS),
  summary: z.string(),
  technical: z.object({
    phase: z.enum(PHASES),
    support_levels: z.tuple([z.number(), z.number()]),
    resistance_levels: z.tuple([z.number(), z.number()]),
    volume_note: z.string(),
    unusual_activity: z.string().nullable(),
  }),
  fundamental: z.object({
    valuation_vs_sector: z.string(),
    growth_trend: z.string(),
    balance_sheet_note: z.string(),
    dividend_note: z.string(),
  }),
  catalysts_and_risks: z.object({
    recent_drivers: z.string(),
    bear_case: z.string(),
    upcoming_events: z.array(z.string()),
  }),
  entry_exit: z.object({
    entry_zone: z.tuple([z.number(), z.number()]),
    stop_loss: z.number(),
    target_zone: z.tuple([z.number(), z.number()]),
    risk_reward_ratio: z.number().nullable().optional(),
    position_sizing_note: z.string(),
    flow_entry: z
      .object({
        flow_confirms_entry: z.boolean(),
        reason: z.string(),
        adjusted_confidence: z.string(),
      })
      .optional(),
  }),
  money_flow: z
    .object({
      foreign_flow_score: z.number(),
      broker_concentration_score: z.number(),
      flow_momentum: z.enum(["accelerating", "steady", "decelerating"]),
      consecutive_foreign_buy_days: z.number(),
      top_buyers: z.array(
        z.object({
          broker_code: z.string(),
          type: z.enum(["foreign", "domestic"]),
          net_value: z.number(),
        })
      ),
      top_sellers: z.array(
        z.object({
          broker_code: z.string(),
          type: z.enum(["foreign", "domestic"]),
          net_value: z.number(),
        })
      ),
      daily_foreign_flow: z.array(
        z.object({
          date: z.string(),
          net_foreign: z.number(),
        })
      ),
      flow_trend: z
        .object({
          trend_direction: z.enum(["accumulating", "distributing", "neutral"]),
          reversal_detected: z.boolean(),
          reversal_type: z.enum(["bullish", "bearish"]).nullable(),
          trend_strength: z.number(),
          short_term_avg: z.number(),
          medium_term_avg: z.number(),
        })
        .optional(),
      flow_interpretation: z.string(),
      notable_brokers: z.string().nullable(),
    })
    .optional(),
  composite_score: z
    .object({
      total: z.number(),
      technical: z.object({ score: z.number(), factors: z.array(z.string()) }),
      fundamental: z.object({ score: z.number(), factors: z.array(z.string()) }),
      flow: z.object({ score: z.number(), factors: z.array(z.string()) }),
      suggested_verdict: z.string(),
      suggested_confidence: z.string(),
    })
    .optional(),
  data_as_of: z.string(),
  data_sources: z.array(z.string()),
});

export type ReportJson = z.infer<typeof reportJsonSchema>;

/** Gemini structured-output schema (Google's restricted OpenAPI-subset dialect),
 * mirroring narrativeReportSchema. Keep the two in sync by hand — the dialects differ. */
export const geminiNarrativeSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, format: "enum", enum: [...VERDICTS] },
    confidence: { type: Type.STRING, format: "enum", enum: [...CONFIDENCE_LEVELS] },
    summary: { type: Type.STRING },
    technical: {
      type: Type.OBJECT,
      properties: {
        phase: { type: Type.STRING, format: "enum", enum: [...PHASES] },
        volume_note: { type: Type.STRING },
        unusual_activity: { type: Type.STRING, nullable: true },
      },
      required: ["phase", "volume_note", "unusual_activity"],
    },
    fundamental: {
      type: Type.OBJECT,
      properties: {
        valuation_vs_sector: { type: Type.STRING },
        growth_trend: { type: Type.STRING },
        balance_sheet_note: { type: Type.STRING },
        dividend_note: { type: Type.STRING },
      },
      required: ["valuation_vs_sector", "growth_trend", "balance_sheet_note", "dividend_note"],
    },
    catalysts_and_risks: {
      type: Type.OBJECT,
      properties: {
        recent_drivers: { type: Type.STRING },
        bear_case: { type: Type.STRING },
        upcoming_events: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["recent_drivers", "bear_case", "upcoming_events"],
    },
    entry_exit: {
      type: Type.OBJECT,
      properties: {
        position_sizing_note: { type: Type.STRING },
      },
      required: ["position_sizing_note"],
    },
    money_flow: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        flow_interpretation: { type: Type.STRING },
        notable_brokers: { type: Type.STRING, nullable: true },
      },
      required: ["flow_interpretation", "notable_brokers"],
    },
  },
  required: [
    "verdict",
    "confidence",
    "summary",
    "technical",
    "fundamental",
    "catalysts_and_risks",
    "entry_exit",
  ],
};
