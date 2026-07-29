import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getScreenerData } from "@/lib/screener/get-screener-data";
import { ScreenerTable } from "./screener-table";

export default async function ScreenerPage() {
  const supabase = await createClient();
  const rows = await getScreenerData(supabase);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
          Stock Screener
        </h1>
        <Link href="/" className="text-sm font-medium text-muted hover:text-amber">
          ← Dashboard
        </Link>
      </div>

      <p className="text-sm text-muted">
        All active stocks with latest analytics. Click column headers to sort.
      </p>

      <ScreenerTable rows={rows} />
    </div>
  );
}
