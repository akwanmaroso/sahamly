"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runPipelineForTicker } from "@/lib/pipeline/run-for-ticker";
import { backfillPriceHistory } from "@/lib/backtest/backfill-history";
import { runBacktest, saveBacktestResults } from "@/lib/backtest/engine";

export type RunPipelineState = { error: string } | { success: true } | undefined;

export async function runPipeline(
  tickerId: string,
  _prevState: RunPipelineState,
  _formData: FormData
): Promise<RunPipelineState> {
  const supabase = await createClient();

  const { data: ticker, error: tickerError } = await supabase
    .from("tickers")
    .select("id, symbol, name, sector")
    .eq("id", tickerId)
    .single();

  if (tickerError || !ticker) {
    return { error: tickerError?.message ?? "Ticker not found" };
  }

  try {
    await runPipelineForTicker(supabase, ticker);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to generate report" };
  }

  revalidatePath(`/tickers/${tickerId}`);
  revalidatePath("/");

  return { success: true };
}

export type BacktestState = { error: string } | { success: true; rows: number } | undefined;

export async function runBacktestAction(
  tickerId: string,
  _prevState: BacktestState,
  _formData: FormData
): Promise<BacktestState> {
  const supabase = await createClient();

  const { data: ticker, error: tickerError } = await supabase
    .from("tickers")
    .select("id, symbol, name, sector")
    .eq("id", tickerId)
    .single();

  if (tickerError || !ticker) {
    return { error: tickerError?.message ?? "Ticker not found" };
  }

  try {
    // Step 0: Clear old backtest results for this ticker
    await supabase
      .from("backtest_results")
      .delete()
      .eq("ticker_id", tickerId);

    // Step 1: Backfill price history if not enough data
    const { count } = await supabase
      .from("price_history")
      .select("id", { count: "exact", head: true })
      .eq("ticker_id", tickerId);

    if ((count ?? 0) < 200) {
      await backfillPriceHistory(supabase, tickerId, ticker.symbol);
    }

    // Step 2: Get latest fundamentals from most recent snapshot
    const { data: snapshot } = await supabase
      .from("snapshots")
      .select("fundamental_data")
      .eq("ticker_id", tickerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const fundamentals = snapshot?.fundamental_data ?? {
      marketCap: 0, peRatio: 0, pbvRatio: 0, epsGrowthYoy: 0,
      revenueGrowthYoy: 0, roe: 0, debtToEquity: 0, dividendYield: 0,
      sectorAvgPe: 0, sectorAvgPbv: 0,
    };

    // Step 3: Run backtest
    const signals = await runBacktest(supabase, tickerId, fundamentals);
    const rows = await saveBacktestResults(supabase, signals);

    revalidatePath(`/tickers/${tickerId}`);
    return { success: true, rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Backtest failed" };
  }
}
