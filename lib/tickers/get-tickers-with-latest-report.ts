import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type TickerWithLatestReport = {
  id: string;
  symbol: string;
  name: string;
  sector: string | null;
  active: boolean;
  reports: { id: string; verdict: string; confidence: string; generated_at: string; report_json: Record<string, unknown> | null }[];
};

/**
 * Cached per-request: the (app) layout (for the tape) and the dashboard page
 * (for the full table) both need "every ticker + its latest report" — this
 * dedupes that into a single Supabase round trip per request.
 */
export const getTickersWithLatestReport = cache(async () => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tickers")
    .select("id, symbol, name, sector, active, reports(id, verdict, confidence, generated_at, report_json)")
    .order("symbol", { ascending: true })
    .order("generated_at", { foreignTable: "reports", ascending: false })
    .limit(1, { foreignTable: "reports" })
    .returns<TickerWithLatestReport[]>();

  return { data: data ?? [], error };
});
