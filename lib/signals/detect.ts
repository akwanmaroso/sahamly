import type { ReportJson } from "@/lib/reports/schema";
import type { FlowMetrics } from "@/lib/market-data/types";

export type Signal = {
  signal_type:
    | "verdict_change"
    | "flow_reversal"
    | "unusual_volume"
    | "score_spike"
    | "consecutive_buy_streak"
    | "mfi_extreme"
    | "whale_accumulation"
    | "whale_distribution"
    | "block_trade"
    | "smart_money_reversal";
  severity: "info" | "warning" | "critical";
  priority: "low" | "normal" | "high" | "urgent";
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
  previousReport: ReportJson | null,
  flowMetrics?: FlowMetrics | null,
  previousFlowMetrics?: FlowMetrics | null
): Signal[] {
  const signals: Signal[] = [];

  // 1. Verdict change
  if (previousReport && newReport.verdict !== previousReport.verdict) {
    const upgraded =
      verdictRank(newReport.verdict) > verdictRank(previousReport.verdict);
    signals.push({
      signal_type: "verdict_change",
      severity: "critical",
      priority: "urgent",
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
      priority: "high",
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
      priority: "normal",
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
        priority: "high",
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
    if (prevDays < 5) {
      signals.push({
        signal_type: "consecutive_buy_streak",
        severity: "info",
        priority: "normal",
        title: `${symbol}: ${mf.consecutive_foreign_buy_days}-day foreign buy streak`,
        description: `Foreign investors have been net buyers for ${mf.consecutive_foreign_buy_days} consecutive trading days.`,
        data: { days: mf.consecutive_foreign_buy_days },
      });
    }
  }

  // 6. MFI extreme
  const mfiFactor = newReport.composite_score?.technical.factors.find(
    (f) => f.includes("MFI oversold") || f.includes("MFI overbought")
  );
  if (mfiFactor) {
    const isOversold = mfiFactor.includes("oversold");
    signals.push({
      signal_type: "mfi_extreme",
      severity: "info",
      priority: "low",
      title: `${symbol}: MFI ${isOversold ? "oversold" : "overbought"}`,
      description: mfiFactor,
      data: { condition: isOversold ? "oversold" : "overbought" },
    });
  }

  // --- Whale-specific signals (from flowMetrics) ---

  // 7. Whale accumulation — high-confidence stealth accumulation, 5+ days
  if (flowMetrics?.accumulationPatterns) {
    for (const p of flowMetrics.accumulationPatterns) {
      if (
        p.detected &&
        (p.type === "stealth_accumulation" || p.type === "coordinated_entry") &&
        (p.confidence === "high" || p.confidence === "medium") &&
        (p.daysActive ?? 0) >= 5
      ) {
        signals.push({
          signal_type: "whale_accumulation",
          severity: "critical",
          priority: p.confidence === "high" ? "urgent" : "high",
          title: `${symbol}: Whale accumulation detected`,
          description: `${p.description} (${p.daysActive}d active, ${p.confidence} confidence)`,
          data: {
            pattern_type: p.type,
            days_active: p.daysActive,
            confidence: p.confidence,
          },
        });
        break; // One accumulation signal per run
      }
    }

    // 8. Whale distribution — stealth distribution
    for (const p of flowMetrics.accumulationPatterns) {
      if (
        p.detected &&
        p.type === "stealth_distribution" &&
        (p.confidence === "high" || p.confidence === "medium") &&
        (p.daysActive ?? 0) >= 5
      ) {
        signals.push({
          signal_type: "whale_distribution",
          severity: "critical",
          priority: p.confidence === "high" ? "urgent" : "high",
          title: `${symbol}: Whale distribution detected`,
          description: `${p.description} (${p.daysActive}d active, ${p.confidence} confidence)`,
          data: {
            pattern_type: p.type,
            days_active: p.daysActive,
            confidence: p.confidence,
          },
        });
        break;
      }
    }
  }

  // 9. Block trade
  if (flowMetrics?.blockTrades?.detected) {
    const blockSignals = flowMetrics.blockTrades.signals.filter((s) => s.isBlockTrade);
    if (blockSignals.length > 0) {
      const totalValue = blockSignals.reduce((sum, s) => sum + s.totalValue, 0);
      signals.push({
        signal_type: "block_trade",
        severity: "warning",
        priority: totalValue > 50e9 ? "urgent" : "high", // >50B IDR = urgent
        title: `${symbol}: ${blockSignals.length} block trade${blockSignals.length > 1 ? "s" : ""} detected`,
        description: blockSignals.map((s) => s.description).join("; "),
        data: {
          count: blockSignals.length,
          total_value: totalValue,
          brokers: blockSignals.map((s) => s.brokerCode),
        },
      });
    }
  }

  // 10. Smart money reversal — smartVsRetail changed direction
  if (flowMetrics?.smartMoney && previousFlowMetrics?.smartMoney) {
    const curr = flowMetrics.smartMoney.smartVsRetail;
    const prev = previousFlowMetrics.smartMoney.smartVsRetail;
    if (curr !== prev && curr === "divergent") {
      const whaleDirection = flowMetrics.smartMoney.whaleNetFlow > 0 ? "buying" : "selling";
      signals.push({
        signal_type: "smart_money_reversal",
        severity: "warning",
        priority: "high",
        title: `${symbol}: Smart money diverging — whales ${whaleDirection}`,
        description: `Smart money and retail have diverged. Whales are net ${whaleDirection} while retail does the opposite. Previous: ${prev}.`,
        data: {
          from: prev,
          to: curr,
          whale_net_flow: flowMetrics.smartMoney.whaleNetFlow,
          retail_net_flow: flowMetrics.smartMoney.retailNetFlow,
        },
      });
    }
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
