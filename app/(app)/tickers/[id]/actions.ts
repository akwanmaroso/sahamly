"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runPipelineForTicker } from "@/lib/pipeline/run-for-ticker";

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
