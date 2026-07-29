import type { ReportJson } from "@/lib/reports/schema";

export type Signal = {
  signal_type:
    | "verdict_change"
    | "flow_reversal"
    | "unusual_volume"
    | "score_spike"
    | "consecutive_buy_streak"
    | "mfi_extreme";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  data: Record<string, unknown>;
};

/**
 * Detect signals by comparing the new report against the previous one.
 * Returns an array of signals to insert into the signals table.
 */
export function detectSignals(
  symbol: string,
  newReport: ReportJson,
  previousReport: ReportJson | null
): Signal[] {
  const signals: Signal[] = [];

  // 1. Verdict change
  if (previousReport && newReport.verdict !== previousReport.verdict) {
    const upgraded =
      verdictRank(newReport.verdict) > verdictRank(previousReport.verdict);
    signals.push({
      signal_type: "verdict_change",
      severity: "critical",
      title: `${symbol}: Verdict changed to ${newReport.verdict}`,
      description: `${previousReport.verdict} → ${newReport.verdict}. ${newReport.summary}`,
      data: {
        from: previousReport.verdict,
        to: newReport.verdict,
        direction: upgraded ? "upgrade" : "downgrade",
      },
    });
  }

  // 2. Flow reversal
  const flowTrend = newReport.money_flow?.flow_trend;
  if (flowTrend?.reversal_detected) {
    signals.push({
      signal_type: "flow_reversal",
      severity: "warning",
      title: `${symbol}: ${flowTrend.reversal_type === "bullish" ? "Bullish" : "Bearish"} flow reversal`,
      description: `Foreign flow short-term direction has reversed from medium-term trend. ${
        flowTrend.reversal_type === "bullish"
          ? "Short-term buying emerging despite medium-term selling."
          : "Short-term selling emerging despite medium-term buying."
      }`,
      data: {
        reversal_type: flowTrend.reversal_type,
        short_term_avg: flowTrend.short_term_avg,
        medium_term_avg: flowTrend.medium_term_avg,
      },
    });
  }

  // 3. Unusual volume (from technical section)
  if (newReport.technical.unusual_activity) {
    signals.push({
      signal_type: "unusual_volume",
      severity: "info",
      title: `${symbol}: Unusual activity detected`,
      description: newReport.technical.unusual_activity,
      data: {},
    });
  }

  // 4. Composite score spike (significant change)
  if (newReport.composite_score && previousReport?.composite_score) {
    const diff = newReport.composite_score.total - previousReport.composite_score.total;
    if (Math.abs(diff) >= 25) {
      signals.push({
        signal_type: "score_spike",
        severity: "warning",
        title: `${symbol}: Composite score ${diff > 0 ? "surged" : "dropped"} ${diff > 0 ? "+" : ""}${diff}`,
        description: `Score moved from ${previousReport.composite_score.total} to ${newReport.composite_score.total}. ${newReport.summary}`,
        data: {
          from: previousReport.composite_score.total,
          to: newReport.composite_score.total,
          diff,
        },
      });
    }
  }

  // 5. Consecutive foreign buy streak
  const mf = newReport.money_flow;
  if (mf && mf.consecutive_foreign_buy_days >= 5) {
    const prevDays = previousReport?.money_flow?.consecutive_foreign_buy_days ?? 0;
    // Only signal when crossing the threshold (not every day after)
    if (prevDays < 5) {
      signals.push({
        signal_type: "consecutive_buy_streak",
        severity: "info",
        title: `${symbol}: ${mf.consecutive_foreign_buy_days}-day foreign buy streak`,
        description: `Foreign investors have been net buyers for ${mf.consecutive_foreign_buy_days} consecutive trading days.`,
        data: { days: mf.consecutive_foreign_buy_days },
      });
    }
  }

  // 6. MFI extreme (would need indicator data, check from composite factors)
  const mfiFactor = newReport.composite_score?.technical.factors.find(
    (f) => f.includes("MFI oversold") || f.includes("MFI overbought")
  );
  if (mfiFactor) {
    const isOversold = mfiFactor.includes("oversold");
    signals.push({
      signal_type: "mfi_extreme",
      severity: "info",
      title: `${symbol}: MFI ${isOversold ? "oversold" : "overbought"}`,
      description: mfiFactor,
      data: { condition: isOversold ? "oversold" : "overbought" },
    });
  }

  return signals;
}

function verdictRank(verdict: string): number {
  switch (verdict) {
    case "Accumulate": return 3;
    case "Hold": return 2;
    case "Watch": return 1;
    case "Avoid": return 0;
    default: return -1;
  }
}
