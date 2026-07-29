import Link from "next/link";
import { getTickersWithLatestReport } from "@/lib/tickers/get-tickers-with-latest-report";
import { VerdictBadge, verdictAccentClass } from "@/app/components/verdict-badge";
import type { ReportJson } from "@/lib/reports/schema";
import { analyzeSectorRotation } from "@/lib/analysis/sector-rotation";
import { createClient } from "@/lib/supabase/server";

function FlowIndicator({ reportJson }: { reportJson: Record<string, unknown> | null | undefined }) {
  const rj = reportJson as ReportJson | null | undefined;
  const mf = rj?.money_flow;
  if (!mf) return <span className="text-xs text-muted">—</span>;

  const score = mf.foreign_flow_score;
  const arrow = score > 10 ? "↑" : score < -10 ? "↓" : "→";
  const color = score > 10 ? "text-gain" : score < -10 ? "text-loss" : "text-muted";
  const momentumDot =
    mf.flow_momentum === "accelerating"
      ? "bg-gain"
      : mf.flow_momentum === "decelerating"
        ? "bg-loss"
        : "bg-muted";

  return (
    <span className={`flex items-center gap-1 font-mono text-xs ${color}`} title={`Flow: ${score > 0 ? "+" : ""}${score} · ${mf.flow_momentum}`}>
      {arrow}
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${momentumDot}`} />
    </span>
  );
}

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
  const [{ data: tickers, error }, supabase] = await Promise.all([
    getTickersWithLatestReport(),
    createClient(),
  ]);

  // Fetch recent unread signals
  const { data: recentSignals } = await supabase
    .from("signals")
    .select("id, ticker_id, signal_type, severity, title, description, created_at, read")
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(10);

  const sectorAnalysis = analyzeSectorRotation(
    tickers.map((t) => ({
      symbol: t.symbol,
      sector: t.sector,
      reportJson: (t.reports[0]?.report_json as ReportJson | null) ?? null,
    }))
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">Watchlist</h1>
        <Link href="/tickers" className="text-sm font-medium text-muted hover:text-amber">
          Manage tickers →
        </Link>
      </div>

      {/* Signals */}
      {recentSignals && recentSignals.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-semibold tracking-[0.2em] text-muted uppercase">
              Signals
            </span>
            <span className="rounded-full bg-amber px-2 py-0.5 text-[0.6rem] font-bold text-bg">
              {recentSignals.length}
            </span>
            <span className="h-px flex-1 bg-line" aria-hidden />
          </div>
          {recentSignals.map((signal) => (
            <div
              key={signal.id}
              className={`rounded border px-3 py-2 text-sm ${
                signal.severity === "critical"
                  ? "border-loss/40 bg-loss/10"
                  : signal.severity === "warning"
                    ? "border-amber/40 bg-amber/10"
                    : "border-line bg-surface"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    signal.severity === "critical"
                      ? "bg-loss"
                      : signal.severity === "warning"
                        ? "bg-amber"
                        : "bg-muted"
                  }`}
                />
                <span className="font-mono text-xs font-semibold text-ink">
                  {signal.title}
                </span>
                <span className="ml-auto font-mono text-[0.6rem] text-muted">
                  {new Date(signal.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{signal.description}</p>
            </div>
          ))}
        </div>
      )}

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

      {/* Sector Rotation */}
      {sectorAnalysis.sectors.length > 1 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-semibold tracking-[0.2em] text-muted uppercase">
              Sector Flow
            </span>
            <span className="h-px flex-1 bg-line" aria-hidden />
          </div>

          {sectorAnalysis.rotation.signal && (
            <p className="text-sm text-ink">
              {sectorAnalysis.rotation.signal}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {sectorAnalysis.sectors.map((s) => (
              <div
                key={s.sector}
                className={`rounded border px-3 py-2 text-xs font-mono ${
                  s.netDirection === "inflow"
                    ? "border-gain/40 bg-gain/10 text-gain"
                    : s.netDirection === "outflow"
                      ? "border-loss/40 bg-loss/10 text-loss"
                      : "border-line bg-surface text-muted"
                }`}
                title={`${s.tickerCount} ticker(s) · Avg flow: ${s.avgFlowScore > 0 ? "+" : ""}${s.avgFlowScore} · Trend: ${s.avgTrendStrength}/100`}
              >
                <span className="font-semibold">{s.sector}</span>
                <span className="ml-2">
                  {s.netDirection === "inflow" ? "↑" : s.netDirection === "outflow" ? "↓" : "→"}
                  {s.avgFlowScore > 0 ? "+" : ""}{s.avgFlowScore}
                </span>
                <span className="ml-1 text-[0.6rem] opacity-70">
                  ({s.tickerCount})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col divide-y divide-line border-y border-line">
        {tickers.map((ticker) => {
          const report = ticker.reports[0];
          return (
            <Link
              key={ticker.id}
              href={`/tickers/${ticker.id}`}
              className={`group grid grid-cols-2 gap-x-4 gap-y-1.5 border-l-4 bg-surface px-4 py-3 transition-colors hover:bg-surface-2 sm:grid-cols-[7rem_1fr_9rem_3rem_6rem_5.5rem] sm:items-center sm:gap-4 ${verdictAccentClass(
                report?.verdict
              )} ${!ticker.active ? "opacity-50" : ""}`}
            >
              <span className="font-mono text-sm font-semibold text-ink">{ticker.symbol}</span>
              <span className="truncate text-sm text-ink">
                {ticker.name}
                <span className="ml-2 text-xs text-muted">{ticker.sector}</span>
              </span>
              <VerdictBadge verdict={report?.verdict} />
              <FlowIndicator reportJson={report?.report_json} />
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
