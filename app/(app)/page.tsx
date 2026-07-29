import Link from "next/link";
import { getTickersWithLatestReport } from "@/lib/tickers/get-tickers-with-latest-report";
import { VerdictBadge, verdictAccentClass } from "@/app/components/verdict-badge";
import type { ReportJson } from "@/lib/reports/schema";
import { analyzeSectorRotation } from "@/lib/analysis/sector-rotation";
import { createClient } from "@/lib/supabase/server";
import { getWhaleRankings } from "@/lib/dashboard/get-whale-rankings";
import { SectionLabel } from "@/app/components/section-label";
import { HorizontalBarChart } from "@/app/components/charts/bar-chart";
import { Sparkline } from "@/app/components/charts/sparkline";
import { ScoreCard } from "@/app/components/score-card";

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

function formatValue(v: number): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toLocaleString();
}

export default async function DashboardPage() {
  const [{ data: tickers, error }, supabase] = await Promise.all([
    getTickersWithLatestReport(),
    createClient(),
  ]);

  // Fetch whale rankings + signals in parallel
  const [whaleRankings, signalsRes] = await Promise.all([
    getWhaleRankings(supabase),
    supabase
      .from("signals")
      .select("id, ticker_id, signal_type, severity, priority, title, description, created_at, read")
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  const recentSignals = signalsRes.data;

  // Sector analysis from reports
  const sectorAnalysis = analyzeSectorRotation(
    tickers.map((t) => ({
      symbol: t.symbol,
      sector: t.sector,
      reportJson: (t.reports[0]?.report_json as ReportJson | null) ?? null,
    }))
  );

  // Ticker symbol lookup for signals
  const tickerMap = new Map(tickers.map((t) => [t.id, t.symbol]));

  const hasWhaleData = whaleRankings.foreignLeaderboard.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
          Follow the Big Money
        </h1>
        <div className="flex gap-4">
          <Link href="/compare" className="text-sm font-medium text-muted hover:text-amber">
            Compare
          </Link>
          <Link href="/tickers" className="text-sm font-medium text-muted hover:text-amber">
            Manage tickers →
          </Link>
        </div>
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

      {/* What Changed Today — Signals */}
      {recentSignals && recentSignals.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <SectionLabel>What Changed Today</SectionLabel>
            <span className="rounded-full bg-amber px-2 py-0.5 text-[0.6rem] font-bold text-bg">
              {recentSignals.length}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {recentSignals.map((signal) => (
              <Link
                key={signal.id}
                href={`/tickers/${signal.ticker_id}`}
                className={`rounded border px-3 py-2 text-sm transition-colors hover:bg-surface-2 ${
                  signal.priority === "urgent"
                    ? "border-amber/60 bg-amber/15 ring-1 ring-amber/30"
                    : signal.severity === "critical"
                      ? "border-loss/40 bg-loss/10"
                      : signal.severity === "warning"
                        ? "border-amber/40 bg-amber/10"
                        : "border-line bg-surface"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      signal.priority === "urgent"
                        ? "bg-amber animate-pulse"
                        : signal.severity === "critical"
                          ? "bg-loss"
                          : signal.severity === "warning"
                            ? "bg-amber"
                            : "bg-muted"
                    }`}
                  />
                  {signal.priority === "urgent" && (
                    <span className="font-mono text-[0.5rem] font-bold text-amber uppercase">URGENT</span>
                  )}
                  <span className="font-mono text-xs font-bold text-amber">
                    {tickerMap.get(signal.ticker_id) ?? ""}
                  </span>
                  <span className="font-mono text-xs font-semibold text-ink">
                    {signal.title}
                  </span>
                  <span className="ml-auto font-mono text-[0.6rem] text-muted">
                    {new Date(signal.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">{signal.description}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Whale Tracking Panels */}
      {hasWhaleData && (
        <>
          {/* Whale Inflows + Outflows */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Inflows */}
            <div className="rounded border border-line bg-surface p-4">
              <SectionLabel>Whale Inflows</SectionLabel>
              {whaleRankings.topInflows.length === 0 ? (
                <p className="mt-3 text-xs text-muted">No whale inflows detected</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {whaleRankings.topInflows.map((t) => (
                    <Link
                      key={t.tickerId}
                      href={`/tickers/${t.tickerId}`}
                      className="flex items-center gap-3 rounded px-2 py-1.5 transition-colors hover:bg-surface-2"
                    >
                      <span className="font-mono text-sm font-bold text-ink">{t.symbol}</span>
                      <Sparkline
                        data={[0, t.smartMoneyScore * 0.3, t.smartMoneyScore * 0.6, t.smartMoneyScore]}
                        width={48}
                        height={16}
                        color="var(--color-gain)"
                      />
                      <span className="ml-auto font-mono text-xs font-semibold text-gain">
                        +{t.smartMoneyScore}
                      </span>
                      <span className="font-mono text-[0.6rem] text-muted">
                        {t.flowMomentum === "accelerating" ? "ACC" : t.flowMomentum === "decelerating" ? "DEC" : "STD"}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Outflows */}
            <div className="rounded border border-line bg-surface p-4">
              <SectionLabel>Whale Outflows</SectionLabel>
              {whaleRankings.topOutflows.length === 0 ? (
                <p className="mt-3 text-xs text-muted">No whale outflows detected</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {whaleRankings.topOutflows.map((t) => (
                    <Link
                      key={t.tickerId}
                      href={`/tickers/${t.tickerId}`}
                      className="flex items-center gap-3 rounded px-2 py-1.5 transition-colors hover:bg-surface-2"
                    >
                      <span className="font-mono text-sm font-bold text-ink">{t.symbol}</span>
                      <Sparkline
                        data={[0, t.smartMoneyScore * 0.3, t.smartMoneyScore * 0.6, t.smartMoneyScore]}
                        width={48}
                        height={16}
                        color="var(--color-loss)"
                      />
                      <span className="ml-auto font-mono text-xs font-semibold text-loss">
                        {t.smartMoneyScore}
                      </span>
                      <span className="font-mono text-[0.6rem] text-muted">
                        {t.flowMomentum === "accelerating" ? "ACC" : t.flowMomentum === "decelerating" ? "DEC" : "STD"}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Foreign Flow Leaderboard */}
          <div className="rounded border border-line bg-surface p-4">
            <SectionLabel>Foreign Flow Leaderboard</SectionLabel>
            <div className="mt-3">
              <HorizontalBarChart
                data={whaleRankings.foreignLeaderboard.map((t) => ({
                  label: t.symbol,
                  value: t.foreignFlowScore,
                  sublabel: t.flowMomentum === "accelerating" ? "ACC" : t.flowMomentum === "decelerating" ? "DEC" : "",
                }))}
              />
            </div>
          </div>

          {/* Accumulation + Block Trades */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Stealth Accumulation */}
            <div className="rounded border border-line bg-surface p-4">
              <SectionLabel>Stealth Accumulation</SectionLabel>
              {whaleRankings.activeAccumulation.length === 0 ? (
                <p className="mt-3 text-xs text-muted">No active accumulation patterns</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {whaleRankings.activeAccumulation.map((a) => (
                    <Link
                      key={a.tickerId}
                      href={`/tickers/${a.tickerId}`}
                      className="block rounded border border-gain/20 bg-gain/5 px-3 py-2 transition-colors hover:bg-gain/10"
                    >
                      <span className="font-mono text-sm font-bold text-gain">{a.symbol}</span>
                      {a.patterns.map((p, i) => (
                        <p key={i} className="mt-1 text-xs text-muted">
                          <span className={`mr-1 font-semibold ${p.confidence === "high" ? "text-gain" : "text-amber"}`}>
                            [{p.confidence}]
                          </span>
                          {p.description}
                          {p.brokerCode && (
                            <span className="ml-1 font-mono text-amber">{p.brokerCode}</span>
                          )}
                          {p.daysActive && (
                            <span className="ml-1 text-muted">({p.daysActive}d)</span>
                          )}
                        </p>
                      ))}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Block Trades */}
            <div className="rounded border border-line bg-surface p-4">
              <SectionLabel>Recent Block Trades</SectionLabel>
              {whaleRankings.recentBlockTrades.length === 0 ? (
                <p className="mt-3 text-xs text-muted">No block trades detected</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {whaleRankings.recentBlockTrades.map((bt) => (
                    <Link
                      key={bt.tickerId}
                      href={`/tickers/${bt.tickerId}`}
                      className="block rounded border border-line bg-surface-2 px-3 py-2 transition-colors hover:bg-surface"
                    >
                      <span className="font-mono text-sm font-bold text-ink">{bt.symbol}</span>
                      {bt.signals.map((s, i) => (
                        <p key={i} className="mt-1 text-xs text-muted">
                          <span className={`mr-1 font-mono font-semibold ${s.direction === "buy" ? "text-gain" : "text-loss"}`}>
                            {s.brokerCode}
                          </span>
                          {s.description}
                          <span className="ml-1 font-mono text-amber">
                            {formatValue(s.totalValue)}
                          </span>
                        </p>
                      ))}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Sector Rotation */}
      {sectorAnalysis.sectors.length > 1 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Sector Flow</SectionLabel>
          {sectorAnalysis.rotation.signal && (
            <p className="text-sm text-ink">{sectorAnalysis.rotation.signal}</p>
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
              >
                <span className="font-semibold">{s.sector}</span>
                <span className="ml-2">
                  {s.netDirection === "inflow" ? "↑" : s.netDirection === "outflow" ? "↓" : "→"}
                  {s.avgFlowScore > 0 ? "+" : ""}{s.avgFlowScore}
                </span>
                <span className="ml-1 text-[0.6rem] opacity-70">({s.tickerCount})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Watchlist */}
      {tickers.length > 0 && (
        <details>
          <summary className="cursor-pointer font-mono text-xs font-semibold tracking-[0.2em] text-muted uppercase hover:text-amber">
            Full Watchlist ({tickers.length})
          </summary>
          <div className="mt-3 flex flex-col divide-y divide-line border-y border-line">
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
        </details>
      )}
    </div>
  );
}
