import type { SupabaseClient } from "@supabase/supabase-js";
import { createSnapshot } from "@/lib/snapshots/create-snapshot";
import { generateReport } from "@/lib/reports/generate-report";
import { fetchAndStoreBrokerFlows } from "@/lib/broker-flow/fetch-and-store";
import type { ReportJson } from "@/lib/reports/schema";
import { detectSignals } from "@/lib/signals/detect";

type Ticker = { id: string; symbol: string; name: string; sector: string | null };

/**
 * Runs the full fetch → compute → generate pipeline for one ticker: creates a
 * snapshot, then generates a report from it. Shared by the manual-trigger
 * action and the scheduled refresh job.
 */
export async function runPipelineForTicker(supabase: SupabaseClient, ticker: Ticker) {
  // Fetch broker flow data (2 API calls to Index Alpha, graceful on failure)
  try {
    await fetchAndStoreBrokerFlows(supabase, [ticker]);
  } catch (err) {
    console.warn(
      `[pipeline] Broker flow fetch failed for ${ticker.symbol}:`,
      err instanceof Error ? err.message : err
    );
  }

  // Get previous report for signal comparison
  const { data: prevReport } = await supabase
    .from("reports")
    .select("report_json")
    .eq("ticker_id", ticker.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const snapshotRef = await createSnapshot(supabase, ticker);

  const { data: snapshot, error } = await supabase
    .from("snapshots")
    .select("*")
    .eq("id", snapshotRef.id)
    .single();

  if (error || !snapshot) {
    throw new Error(`Failed to load snapshot for ${ticker.symbol}: ${error?.message ?? "not found"}`);
  }

  const reportRef = await generateReport(supabase, ticker, snapshot);

  // Detect and store signals
  try {
    const { data: newReport } = await supabase
      .from("reports")
      .select("report_json")
      .eq("id", reportRef.id)
      .single();

    if (newReport?.report_json) {
      const signals = detectSignals(
        ticker.symbol,
        newReport.report_json as ReportJson,
        (prevReport?.report_json as ReportJson) ?? null
      );

      if (signals.length > 0) {
        const { error: sigError } = await supabase.from("signals").insert(
          signals.map((s) => ({
            ticker_id: ticker.id,
            report_id: reportRef.id,
            signal_type: s.signal_type,
            severity: s.severity,
            title: s.title,
            description: s.description,
            data: s.data,
          }))
        );
        if (sigError) {
          console.warn(`[pipeline] Signal insert failed for ${ticker.symbol}:`, sigError.message);
        }
      }
    }
  } catch (err) {
    console.warn(
      `[pipeline] Signal detection failed for ${ticker.symbol}:`,
      err instanceof Error ? err.message : err
    );
  }

  return reportRef;
}
