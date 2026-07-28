import Link from "next/link";
import { getTickersWithLatestReport } from "@/lib/tickers/get-tickers-with-latest-report";
import { VerdictBadge, verdictAccentClass } from "@/app/components/verdict-badge";

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function DashboardPage() {
  const { data: tickers, error } = await getTickersWithLatestReport();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">Watchlist</h1>
        <Link href="/tickers" className="text-sm font-medium text-muted hover:text-amber">
          Manage tickers →
        </Link>
      </div>

      {error && (
        <p className="rounded border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-loss">
          Failed to load watchlist: {error.message}
        </p>
      )}

      {tickers.length === 0 && (
        <div className="rounded border border-dashed border-line py-16 text-center text-muted">
          Nothing on the tape yet.{" "}
          <Link href="/tickers" className="font-medium text-amber hover:underline">
            Add your first ticker
          </Link>
          .
        </div>
      )}

      <div className="flex flex-col divide-y divide-line border-y border-line">
        {tickers.map((ticker) => {
          const report = ticker.reports[0];
          return (
            <Link
              key={ticker.id}
              href={`/tickers/${ticker.id}`}
              className={`group grid grid-cols-2 gap-x-4 gap-y-1.5 border-l-4 bg-surface px-4 py-3 transition-colors hover:bg-surface-2 sm:grid-cols-[7rem_1fr_9rem_6rem_5.5rem] sm:items-center sm:gap-4 ${verdictAccentClass(
                report?.verdict
              )} ${!ticker.active ? "opacity-50" : ""}`}
            >
              <span className="font-mono text-sm font-semibold text-ink">{ticker.symbol}</span>
              <span className="truncate text-sm text-ink">
                {ticker.name}
                <span className="ml-2 text-xs text-muted">{ticker.sector}</span>
              </span>
              <VerdictBadge verdict={report?.verdict} />
              <span className="font-mono text-xs text-muted">{report?.confidence ?? "—"}</span>
              <span className="font-mono text-xs text-muted sm:text-right">
                {report ? relativeTime(report.generated_at) : "Never"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
