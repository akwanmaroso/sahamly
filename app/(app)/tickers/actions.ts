"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AddTickerState = { error: string } | undefined;

export async function addTicker(
  _prevState: AddTickerState,
  formData: FormData
): Promise<AddTickerState> {
  const symbol = (formData.get("symbol") as string)?.trim().toUpperCase();
  const name = (formData.get("name") as string)?.trim();
  const sector = (formData.get("sector") as string)?.trim() || null;

  if (!symbol || !name) {
    return { error: "Symbol and name are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tickers").insert({ symbol, name, sector });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? `${symbol} is already on your watchlist.`
          : error.message,
    };
  }

  revalidatePath("/tickers");
}

export async function toggleTickerActive(
  id: string,
  active: boolean,
  _formData: FormData
) {
  const supabase = await createClient();
  await supabase.from("tickers").update({ active: !active }).eq("id", id);
  revalidatePath("/tickers");
}

export async function deleteTicker(id: string, _formData: FormData) {
  const supabase = await createClient();
  await supabase.from("tickers").delete().eq("id", id);
  revalidatePath("/tickers");
}
