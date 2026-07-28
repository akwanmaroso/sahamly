import type { SupabaseClient } from "@supabase/supabase-js";
import { createSnapshot } from "@/lib/snapshots/create-snapshot";
import { generateReport } from "@/lib/reports/generate-report";

type Ticker = { id: string; symbol: string; name: string; sector: string | null };

/**
 * Runs the full fetch → compute → generate pipeline for one ticker: creates a
 * snapshot, then generates a report from it. Shared by the manual-trigger
 * action and the scheduled refresh job.
 */
export async function runPipelineForTicker(supabase: SupabaseClient, ticker: Ticker) {
  const snapshotRef = await createSnapshot(supabase, ticker);

  const { data: snapshot, error } = await supabase
    .from("snapshots")
    .select("*")
    .eq("id", snapshotRef.id)
    .single();

  if (error || !snapshot) {
    throw new Error(`Failed to load snapshot for ${ticker.symbol}: ${error?.message ?? "not found"}`);
  }

  return generateReport(supabase, ticker, snapshot);
}
