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
    position_sizing_note: z.string(),
  }),
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
