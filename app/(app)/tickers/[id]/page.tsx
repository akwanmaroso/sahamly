import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VerdictBadge, verdictAccentClass } from "@/app/components/verdict-badge";
import type { ReportJson } from "@/lib/reports/schema";
import type { RawFundamentals, OhlcvBar } from "@/lib/market-data/types";
import type { InsiderData } from "@/lib/market-data/insider-trades";
import { getBacktestSummary } from "@/lib/backtest/engine";
import { getSnapshotHistory } from "@/lib/snapshots/get-snapshot-history";
import { getSignalTrackRecord } from "@/lib/backtest/signal-track-record";
import { BarChartInteractive } from "@/app/components/charts/bar-chart-interactive";
import { DualAxisChart } from "@/app/components/charts/dual-axis-chart";
import { Sparkline } from "@/app/components/charts/sparkline";
import { WinRateBar } from "@/app/components/win-rate-bar";
import { RefreshButton } from "./refresh-button";
import { BacktestButton } from "./backtest-button";
import { MarkAllReadButton } from "./mark-read-button";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function formatPrice(n: number) {
  return n.toLocaleString("en-US");
}

function formatBigNumber(n: number): string {
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return n.toLocaleString("en-US");
}

function MetricCell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded border border-line bg-surface p-3">
      <dt className="font-mono text-[0.6rem] tracking-wide text-muted uppercase">{label}</dt>
      <dd className={`mt-0.5 font-mono text-lg font-semibold ${color ?? "text-ink"}`}>{value}</dd>
      {sub && <dd className="font-mono text-[0.6rem] text-muted">{sub}</dd>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs font-semibold tracking-[0.2em] text-muted uppercase">
        {children}
      </span>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}

function Field({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : undefined}>
      <dt className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-ink">{value}</dd>
    </div>
  );
}

export default async function TickerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: ticker } = await supabase
    .from("tickers")
    .select("id, symbol, name, sector, active")
    .eq("id", id)
    .single();

  if (!ticker) {
    notFound();
  }

  const { data: report } = await supabase
    .from("reports")
    .select("id, verdict, confidence, report_json, generated_at")
    .eq("ticker_id", id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rj = report?.report_json as ReportJson | undefined;

  const { data: tickerSignals } = await supabase
    .from("signals")
    .select("id, signal_type, severity, priority, title, description, read, created_at")
    .eq("ticker_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  const [backtestSummary, snapshotHistory, signalTrackRecord] = await Promise.all([
    getBacktestSummary(supabase, id),
    getSnapshotHistory(supabase, id),
    getSignalTrackRecord(supabase, id),
  ]);

  // Get latest snapshot for all data
  const { data: latestSnapshot } = await supabase
    .from("snapshots")
    .select("price_data, fundamental_data, flow_data, insider_data")
    .eq("ticker_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Price data & indicators
  const priceData = latestSnapshot?.price_data as {
    ohlcv?: OhlcvBar[];
    indicators?: {
      supportLevels: [number, number];
      resistanceLevels: [number, number];
      rsi14: number | null;
      mfi14: number | null;
      macd: { macd: number | null; signal: number | null; histogram: number | null; trend: string };
      atr14: number | null;
      bollingerBands: { upper: number | null; middle: number | null; lower: number | null };
      obv: { current: number; sma20: number | null; trend: string };
      divergence: { rsiDivergence: string | null; mfiDivergence: string | null };
    };
  } | undefined;

  const ohlcv = priceData?.ohlcv ?? [];
  const lastBar = ohlcv[ohlcv.length - 1];
  const prevBar = ohlcv.length >= 2 ? ohlcv[ohlcv.length - 2] : null;
  const indicators = priceData?.indicators;

  // Fundamental data
  const fundamentals = latestSnapshot?.fundamental_data as RawFundamentals | undefined;

  // Flow data
  const flowData = latestSnapshot?.flow_data as {
    foreignOwnershipPct?: number;
    avgVolume20d?: number;
    flowMetrics?: {
      smartMoney?: {
        smartMoneyScore: number;
        whaleNetFlow: number;
        retailNetFlow: number;
        smartVsRetail: string;
        topWhaleActivity: { code: string; name: string; netValue: number }[];
      };
      accumulationPatterns?: { type: string; description: string; confidence: string }[];
      blockTrades?: { detected: boolean; signals: { description: string; isBlockTrade: boolean }[] };
    };
  } | undefined;

  const smartMoney = flowData?.flowMetrics?.smartMoney;
  const accPatterns = flowData?.flowMetrics?.accumulationPatterns;
  const blockTrades = flowData?.flowMetrics?.blockTrades;

  // Insider data
  const insiderData = latestSnapshot?.insider_data as InsiderData | undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex items-start justify-between">
        <Link href="/" className="text-sm font-medium text-muted hover:text-amber">
          ← Dashboard
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href={`/compare?tickers=${ticker.symbol}`}
            className="font-mono text-xs text-muted hover:text-amber"
          >
            Compare with...
          </Link>
          <RefreshButton tickerId={ticker.id} />
        </div>
      </div>

      {/* Price Hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
            {ticker.symbol}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {ticker.name}
            {ticker.sector && <span> · {ticker.sector}</span>}
            {!ticker.active && <span className="ml-2 font-mono text-xs text-loss">PAUSED</span>}
          </p>
        </div>
        {lastBar && (
          <div className="text-right">
            <div className="font-mono text-3xl font-bold text-ink">
              {formatPrice(lastBar.close)}
            </div>
            {prevBar && (
              <div className={`font-mono text-sm font-semibold ${
                lastBar.close >= prevBar.close ? "text-gain" : "text-loss"
              }`}>
                {lastBar.close >= prevBar.close ? "+" : ""}
                {(lastBar.close - prevBar.close).toFixed(0)}{" "}
                ({((lastBar.close - prevBar.close) / prevBar.close * 100).toFixed(2)}%)
              </div>
            )}
            <div className="mt-1 font-mono text-[0.6rem] text-muted">
              Vol: {formatBigNumber(lastBar.volume)}
              {flowData?.avgVolume20d ? ` · Avg 20d: ${formatBigNumber(flowData.avgVolume20d)}` : ""}
            </div>
          </div>
        )}
      </div>

      {/* Key Metrics Strip */}
      {(fundamentals || flowData) && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {fundamentals?.marketCap ? (
            <MetricCell label="Market Cap" value={formatBigNumber(fundamentals.marketCap)} />
          ) : null}
          {fundamentals?.peRatio ? (
            <MetricCell
              label="P/E"
              value={fundamentals.peRatio.toFixed(1)}
              sub={fundamentals.sectorAvgPe ? `Sector: ${fundamentals.sectorAvgPe.toFixed(1)}` : undefined}
              color={fundamentals.sectorAvgPe && fundamentals.peRatio < fundamentals.sectorAvgPe ? "text-gain" : undefined}
            />
          ) : null}
          {fundamentals?.pbvRatio ? (
            <MetricCell
              label="P/BV"
              value={fundamentals.pbvRatio.toFixed(2)}
              sub={fundamentals.sectorAvgPbv ? `Sector: ${fundamentals.sectorAvgPbv.toFixed(2)}` : undefined}
              color={fundamentals.sectorAvgPbv && fundamentals.pbvRatio < fundamentals.sectorAvgPbv ? "text-gain" : undefined}
            />
          ) : null}
          {fundamentals?.roe ? (
            <MetricCell
              label="ROE"
              value={`${fundamentals.roe.toFixed(1)}%`}
              color={fundamentals.roe >= 15 ? "text-gain" : fundamentals.roe >= 10 ? "text-amber" : "text-loss"}
            />
          ) : null}
          {fundamentals?.dividendYield ? (
            <MetricCell
              label="Div Yield"
              value={`${fundamentals.dividendYield.toFixed(2)}%`}
              color={fundamentals.dividendYield >= 3 ? "text-gain" : undefined}
            />
          ) : null}
          {flowData?.foreignOwnershipPct != null ? (
            <MetricCell
              label="Foreign Own"
              value={`${flowData.foreignOwnershipPct.toFixed(1)}%`}
            />
          ) : null}
        </div>
      )}

      {tickerSignals && tickerSignals.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
              Signals ({tickerSignals.filter((s) => !s.read).length} unread)
            </span>
            {tickerSignals.some((s) => !s.read) && (
              <MarkAllReadButton tickerId={id} />
            )}
          </div>
          {tickerSignals.map((signal) => (
            <div
              key={signal.id}
              className={`rounded border px-3 py-2 text-sm ${
                signal.read ? "opacity-50 " : ""
              }${
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
                <span className="font-mono text-xs font-semibold text-ink">{signal.title}</span>
                <span className="ml-auto font-mono text-[0.6rem] text-muted">
                  {new Date(signal.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{signal.description}</p>
            </div>
          ))}
        </div>
      )}

      {!rj && (
        <div className="rounded border border-dashed border-line py-16 text-center text-muted">
          No report generated yet — click Refresh report to run the pipeline.
        </div>
      )}

      {rj && report && (
        <>
          <section
            className={`border-l-4 bg-surface px-5 py-4 ${verdictAccentClass(rj.verdict)}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <VerdictBadge verdict={rj.verdict} />
              <span className="font-mono text-xs text-muted">Confidence: {rj.confidence}</span>
              <span className="font-mono text-xs text-muted">· {formatDate(report.generated_at)}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink">{rj.summary}</p>
          </section>

          {rj.composite_score && (
            <div className="flex flex-col gap-3">
              <SectionLabel>Composite Score</SectionLabel>
              <div className="grid grid-cols-4 gap-3 font-mono">
                <div className="rounded border border-line bg-surface p-3 text-center">
                  <div className="text-[0.6rem] tracking-wide text-muted uppercase">Total</div>
                  <div
                    className={`text-2xl font-bold ${
                      rj.composite_score.total > 20
                        ? "text-gain"
                        : rj.composite_score.total < -20
                          ? "text-loss"
                          : "text-amber"
                    }`}
                  >
                    {rj.composite_score.total > 0 ? "+" : ""}{rj.composite_score.total}
                  </div>
                </div>
                {(["technical", "fundamental", "flow"] as const).map((key) => {
                  const sub = rj.composite_score?.[key];
                  if (!sub) return null;
                  return (
                    <div key={key} className="rounded border border-line bg-surface p-3 text-center">
                      <div className="text-[0.6rem] tracking-wide text-muted uppercase">{key}</div>
                      <div
                        className={`text-lg font-semibold ${
                          sub.score > 10 ? "text-gain" : sub.score < -10 ? "text-loss" : "text-ink"
                        }`}
                      >
                        {sub.score > 0 ? "+" : ""}{sub.score}
                      </div>
                    </div>
                  );
                })}
              </div>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer hover:text-ink">Score breakdown</summary>
                <ul className="mt-2 space-y-1 pl-4">
                  {[...(rj.composite_score.technical?.factors ?? []), ...(rj.composite_score.fundamental?.factors ?? []), ...(rj.composite_score.flow?.factors ?? [])].map(
                    (f, i) => (
                      <li key={i} className="list-disc">{f}</li>
                    )
                  )}
                </ul>
              </details>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <SectionLabel>Technical</SectionLabel>
            <dl className="grid grid-cols-2 gap-5">
              <Field label="Phase" value={rj.technical.phase} />
              <Field
                label="Support / Resistance"
                value={`${(rj.technical.support_levels ?? []).map(formatPrice).join(" / ")}  —  ${(rj.technical.resistance_levels ?? [])
                  .map(formatPrice)
                  .join(" / ")}`}
              />
              <Field label="Volume" value={rj.technical.volume_note} span />
              <Field label="Unusual activity" value={rj.technical.unusual_activity ?? "None noted"} span />
            </dl>

            {/* Technical Indicators */}
            {indicators && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {indicators.rsi14 != null && (
                  <MetricCell
                    label="RSI (14)"
                    value={indicators.rsi14.toFixed(1)}
                    color={indicators.rsi14 > 70 ? "text-loss" : indicators.rsi14 < 30 ? "text-gain" : "text-ink"}
                    sub={indicators.rsi14 > 70 ? "Overbought" : indicators.rsi14 < 30 ? "Oversold" : undefined}
                  />
                )}
                {indicators.mfi14 != null && (
                  <MetricCell
                    label="MFI (14)"
                    value={indicators.mfi14.toFixed(1)}
                    color={indicators.mfi14 > 80 ? "text-loss" : indicators.mfi14 < 20 ? "text-gain" : "text-ink"}
                    sub={indicators.mfi14 > 80 ? "Overbought" : indicators.mfi14 < 20 ? "Oversold" : undefined}
                  />
                )}
                {indicators.macd?.macd != null && (
                  <MetricCell
                    label="MACD"
                    value={indicators.macd.histogram?.toFixed(2) ?? "—"}
                    color={indicators.macd.trend === "bullish" ? "text-gain" : indicators.macd.trend === "bearish" ? "text-loss" : "text-ink"}
                    sub={indicators.macd.trend}
                  />
                )}
                {indicators.atr14 != null && (
                  <MetricCell
                    label="ATR (14)"
                    value={indicators.atr14.toFixed(0)}
                    sub={lastBar ? `${(indicators.atr14 / lastBar.close * 100).toFixed(1)}% of price` : undefined}
                  />
                )}
                {indicators.obv?.trend && (
                  <MetricCell
                    label="OBV Trend"
                    value={indicators.obv.trend}
                    color={indicators.obv.trend === "rising" ? "text-gain" : indicators.obv.trend === "falling" ? "text-loss" : "text-muted"}
                  />
                )}
                {indicators.bollingerBands?.upper != null && lastBar && (
                  <MetricCell
                    label="BB Position"
                    value={(() => {
                      const bb = indicators.bollingerBands!;
                      const range = (bb.upper ?? 0) - (bb.lower ?? 0);
                      if (range === 0) return "—";
                      const pos = ((lastBar.close - (bb.lower ?? 0)) / range * 100).toFixed(0);
                      return `${pos}%`;
                    })()}
                    sub={`${formatPrice(indicators.bollingerBands!.lower ?? 0)} – ${formatPrice(indicators.bollingerBands!.upper ?? 0)}`}
                    color={lastBar.close > (indicators.bollingerBands!.upper ?? Infinity) ? "text-loss" : lastBar.close < (indicators.bollingerBands!.lower ?? -Infinity) ? "text-gain" : "text-ink"}
                  />
                )}
              </div>
            )}

            {/* Divergence alerts */}
            {indicators?.divergence && (indicators.divergence.rsiDivergence || indicators.divergence.mfiDivergence) && (
              <div className="flex flex-wrap gap-2">
                {indicators.divergence.rsiDivergence && (
                  <span className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                    indicators.divergence.rsiDivergence === "bullish" ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss"
                  }`}>
                    RSI {indicators.divergence.rsiDivergence} divergence
                  </span>
                )}
                {indicators.divergence.mfiDivergence && (
                  <span className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                    indicators.divergence.mfiDivergence === "bullish" ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss"
                  }`}>
                    MFI {indicators.divergence.mfiDivergence} divergence
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <SectionLabel>Fundamental</SectionLabel>

            {/* Raw metrics grid */}
            {fundamentals && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {fundamentals.epsGrowthYoy != null && fundamentals.epsGrowthYoy !== 0 && (
                  <MetricCell
                    label="EPS Growth"
                    value={`${fundamentals.epsGrowthYoy > 0 ? "+" : ""}${fundamentals.epsGrowthYoy.toFixed(1)}%`}
                    color={fundamentals.epsGrowthYoy > 10 ? "text-gain" : fundamentals.epsGrowthYoy < 0 ? "text-loss" : "text-ink"}
                  />
                )}
                {fundamentals.revenueGrowthYoy != null && fundamentals.revenueGrowthYoy !== 0 && (
                  <MetricCell
                    label="Revenue Growth"
                    value={`${fundamentals.revenueGrowthYoy > 0 ? "+" : ""}${fundamentals.revenueGrowthYoy.toFixed(1)}%`}
                    color={fundamentals.revenueGrowthYoy > 10 ? "text-gain" : fundamentals.revenueGrowthYoy < 0 ? "text-loss" : "text-ink"}
                  />
                )}
                {fundamentals.roe != null && fundamentals.roe !== 0 && (
                  <MetricCell
                    label="ROE"
                    value={`${fundamentals.roe.toFixed(1)}%`}
                    color={fundamentals.roe >= 15 ? "text-gain" : fundamentals.roe >= 10 ? "text-amber" : "text-loss"}
                  />
                )}
                {fundamentals.debtToEquity != null && fundamentals.debtToEquity !== 0 && (
                  <MetricCell
                    label="D/E Ratio"
                    value={fundamentals.debtToEquity.toFixed(2)}
                    color={fundamentals.debtToEquity > 1.5 ? "text-loss" : fundamentals.debtToEquity < 0.5 ? "text-gain" : "text-ink"}
                  />
                )}
                {fundamentals.dividendYield != null && fundamentals.dividendYield !== 0 && (
                  <MetricCell
                    label="Div Yield"
                    value={`${fundamentals.dividendYield.toFixed(2)}%`}
                    color={fundamentals.dividendYield >= 3 ? "text-gain" : undefined}
                  />
                )}
              </div>
            )}

            {/* AI analysis */}
            <dl className="grid grid-cols-1 gap-5">
              <Field label="Valuation vs sector" value={rj.fundamental.valuation_vs_sector} />
              <Field label="Growth trend" value={rj.fundamental.growth_trend} />
              <Field label="Balance sheet" value={rj.fundamental.balance_sheet_note} />
              <Field label="Dividend" value={rj.fundamental.dividend_note} />
            </dl>
          </div>

          <div className="flex flex-col gap-4">
            <SectionLabel>Catalysts &amp; Risks</SectionLabel>
            <dl className="grid grid-cols-1 gap-5">
              <Field label="Recent drivers" value={rj.catalysts_and_risks.recent_drivers} />
              <Field label="Bear case" value={rj.catalysts_and_risks.bear_case} />
              <div>
                <dt className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
                  Upcoming events
                </dt>
                {rj.catalysts_and_risks.upcoming_events?.length ? (
                  <ul className="mt-1 list-inside list-disc text-sm leading-relaxed text-ink">
                    {rj.catalysts_and_risks.upcoming_events.map((event: string) => (
                      <li key={event}>{event}</li>
                    ))}
                  </ul>
                ) : (
                  <dd className="mt-1 text-sm text-ink">None noted</dd>
                )}
              </div>
            </dl>
          </div>

          {rj.money_flow && (
            <div className="flex flex-col gap-4">
              <SectionLabel>Money Flow</SectionLabel>

              <div className="grid grid-cols-3 gap-4 font-mono">
                <div>
                  <dt className="text-[0.6875rem] tracking-wide text-muted uppercase">
                    Foreign flow score
                  </dt>
                  <dd
                    className={`mt-1 text-lg font-semibold ${
                      rj.money_flow.foreign_flow_score > 0
                        ? "text-gain"
                        : rj.money_flow.foreign_flow_score < 0
                          ? "text-loss"
                          : "text-ink"
                    }`}
                  >
                    {rj.money_flow.foreign_flow_score > 0 ? "+" : ""}
                    {rj.money_flow.foreign_flow_score}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.6875rem] tracking-wide text-muted uppercase">Momentum</dt>
                  <dd className="mt-1 text-sm font-semibold text-ink capitalize">
                    {rj.money_flow.flow_momentum}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.6875rem] tracking-wide text-muted uppercase">
                    Foreign buy streak
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-ink">
                    {rj.money_flow.consecutive_foreign_buy_days}d
                  </dd>
                </div>
              </div>

              {/* Flow trend */}
              {rj.money_flow.flow_trend && (
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                      rj.money_flow.flow_trend.trend_direction === "accumulating"
                        ? "bg-gain/15 text-gain"
                        : rj.money_flow.flow_trend.trend_direction === "distributing"
                          ? "bg-loss/15 text-loss"
                          : "bg-muted/15 text-muted"
                    }`}
                  >
                    {rj.money_flow.flow_trend.trend_direction}
                  </span>
                  <span className="font-mono text-xs text-muted">
                    Strength: {rj.money_flow.flow_trend.trend_strength}/100
                  </span>
                  {rj.money_flow.flow_trend.reversal_detected && (
                    <span
                      className={`rounded px-2 py-1 text-xs font-bold uppercase ${
                        rj.money_flow.flow_trend.reversal_type === "bullish"
                          ? "bg-gain/20 text-gain"
                          : "bg-loss/20 text-loss"
                      }`}
                    >
                      {rj.money_flow.flow_trend.reversal_type} reversal
                    </span>
                  )}
                </div>
              )}

              {/* Daily foreign flow mini bar chart */}
              {rj.money_flow.daily_foreign_flow?.length > 0 && (
                <div>
                  <dt className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase mb-2">
                    Daily foreign flow (20d)
                  </dt>
                  <div className="flex items-end gap-px h-16">
                    {(() => {
                      const flows = rj.money_flow!.daily_foreign_flow ?? [];
                      const maxAbs = Math.max(...flows.map((d) => Math.abs(d.net_foreign)), 1);
                      return flows.map((d) => {
                        const pct = Math.abs(d.net_foreign) / maxAbs;
                        const isPositive = d.net_foreign >= 0;
                        return (
                          <div
                            key={d.date}
                            className="flex-1 flex flex-col justify-end h-full"
                            title={`${d.date}: ${d.net_foreign.toLocaleString("en-US")} IDR`}
                          >
                            <div
                              className={`w-full rounded-sm ${isPositive ? "bg-gain" : "bg-loss"}`}
                              style={{ height: `${Math.max(pct * 100, 4)}%` }}
                            />
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Top brokers */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase mb-2">
                    Top buyers
                  </dt>
                  {rj.money_flow.top_buyers?.length > 0 ? (
                    <ul className="space-y-1">
                      {rj.money_flow.top_buyers.map((b) => (
                        <li key={b.broker_code} className="flex items-center gap-2 text-sm">
                          <span className="font-mono font-semibold text-ink">{b.broker_code}</span>
                          <span
                            className={`rounded px-1 py-0.5 text-[0.6rem] font-semibold uppercase ${
                              b.type === "foreign"
                                ? "bg-amber/20 text-amber"
                                : "bg-muted/20 text-muted"
                            }`}
                          >
                            {b.type === "foreign" ? "F" : "D"}
                          </span>
                          <span className="ml-auto font-mono text-xs text-gain">
                            +{b.net_value.toLocaleString("en-US")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">None</p>
                  )}
                </div>
                <div>
                  <dt className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase mb-2">
                    Top sellers
                  </dt>
                  {rj.money_flow.top_sellers?.length > 0 ? (
                    <ul className="space-y-1">
                      {rj.money_flow.top_sellers.map((b) => (
                        <li key={b.broker_code} className="flex items-center gap-2 text-sm">
                          <span className="font-mono font-semibold text-ink">{b.broker_code}</span>
                          <span
                            className={`rounded px-1 py-0.5 text-[0.6rem] font-semibold uppercase ${
                              b.type === "foreign"
                                ? "bg-amber/20 text-amber"
                                : "bg-muted/20 text-muted"
                            }`}
                          >
                            {b.type === "foreign" ? "F" : "D"}
                          </span>
                          <span className="ml-auto font-mono text-xs text-loss">
                            {b.net_value.toLocaleString("en-US")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">None</p>
                  )}
                </div>
              </div>

              {/* AI interpretation */}
              {rj.money_flow.flow_interpretation && (
                <Field label="Flow interpretation" value={rj.money_flow.flow_interpretation} span />
              )}
              {rj.money_flow.notable_brokers && (
                <Field label="Notable brokers" value={rj.money_flow.notable_brokers} span />
              )}

              <div className="text-right">
                <span className="font-mono text-[0.6rem] text-muted">
                  Concentration: {rj.money_flow.broker_concentration_score}/100
                </span>
              </div>
            </div>
          )}

          {/* Smart Money & Whale Tracking */}
          {smartMoney && (
            <div className="flex flex-col gap-4">
              <SectionLabel>Smart Money Tracking</SectionLabel>
              <div className="grid grid-cols-3 gap-4 font-mono">
                <div>
                  <dt className="text-[0.6875rem] tracking-wide text-muted uppercase">
                    Whale score
                  </dt>
                  <dd
                    className={`mt-1 text-lg font-semibold ${
                      smartMoney.smartMoneyScore > 20
                        ? "text-gain"
                        : smartMoney.smartMoneyScore < -20
                          ? "text-loss"
                          : "text-ink"
                    }`}
                  >
                    {smartMoney.smartMoneyScore > 0 ? "+" : ""}
                    {smartMoney.smartMoneyScore}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.6875rem] tracking-wide text-muted uppercase">
                    Smart vs Retail
                  </dt>
                  <dd
                    className={`mt-1 text-sm font-semibold ${
                      smartMoney.smartVsRetail === "divergent"
                        ? "text-amber"
                        : smartMoney.smartVsRetail === "aligned"
                          ? "text-gain"
                          : "text-muted"
                    }`}
                  >
                    {smartMoney.smartVsRetail === "divergent"
                      ? `Divergent ${smartMoney.whaleNetFlow > 0 ? "(whales buy, retail sells)" : "(whales sell, retail buys)"}`
                      : smartMoney.smartVsRetail}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.6875rem] tracking-wide text-muted uppercase">
                    Whale net flow
                  </dt>
                  <dd
                    className={`mt-1 text-sm font-semibold ${
                      smartMoney.whaleNetFlow > 0 ? "text-gain" : smartMoney.whaleNetFlow < 0 ? "text-loss" : "text-ink"
                    }`}
                  >
                    {(smartMoney.whaleNetFlow / 1e9).toFixed(1)}B IDR
                  </dd>
                </div>
              </div>

              {smartMoney.topWhaleActivity?.length > 0 && (
                <div>
                  <dt className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase mb-2">
                    Top whale activity
                  </dt>
                  <ul className="space-y-1">
                    {smartMoney.topWhaleActivity.map((w) => (
                      <li key={w.code} className="flex items-center gap-2 text-sm">
                        <span className="font-mono font-semibold text-ink">{w.code}</span>
                        <span className="text-xs text-muted">{w.name}</span>
                        <span
                          className={`ml-auto font-mono text-xs ${
                            w.netValue > 0 ? "text-gain" : "text-loss"
                          }`}
                        >
                          {w.netValue > 0 ? "+" : ""}
                          {(w.netValue / 1e9).toFixed(1)}B
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {accPatterns && accPatterns.length > 0 && (
                <div>
                  <dt className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase mb-2">
                    Accumulation patterns
                  </dt>
                  {accPatterns.map((p, i) => (
                    <div
                      key={i}
                      className={`mb-1 rounded px-3 py-2 text-xs ${
                        p.confidence === "high"
                          ? "border border-amber/40 bg-amber/10 text-ink"
                          : "border border-line bg-surface text-muted"
                      }`}
                    >
                      <span className="font-mono font-semibold uppercase text-[0.6rem]">
                        [{p.confidence}]
                      </span>{" "}
                      {p.description}
                    </div>
                  ))}
                </div>
              )}

              {blockTrades?.detected && (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer hover:text-ink">Block trade activity</summary>
                  <ul className="mt-2 space-y-1 pl-4">
                    {(blockTrades.signals ?? []).map((s, i) => (
                      <li key={i} className={`list-disc ${s.isBlockTrade ? "text-amber" : ""}`}>
                        {s.description}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Insider Activity */}
          {insiderData && (
            <div className="flex flex-col gap-4">
              <SectionLabel>Insider Activity</SectionLabel>

              {/* Sentiment + ownership strip */}
              <div className="grid grid-cols-3 gap-3">
                <MetricCell
                  label="Insider Sentiment"
                  value={insiderData.netInsiderSentiment ?? "—"}
                  color={
                    insiderData.netInsiderSentiment === "buying"
                      ? "text-gain"
                      : insiderData.netInsiderSentiment === "selling"
                        ? "text-loss"
                        : "text-muted"
                  }
                />
                <MetricCell
                  label="Activity Score"
                  value={insiderData.recentActivityScore != null ? `${insiderData.recentActivityScore > 0 ? "+" : ""}${insiderData.recentActivityScore}` : "—"}
                  color={
                    (insiderData.recentActivityScore ?? 0) > 30
                      ? "text-gain"
                      : (insiderData.recentActivityScore ?? 0) < -30
                        ? "text-loss"
                        : "text-ink"
                  }
                />
                <div className="rounded border border-line bg-surface p-3">
                  <dt className="font-mono text-[0.6rem] tracking-wide text-muted uppercase">Ownership</dt>
                  <dd className="mt-0.5 font-mono text-xs text-ink">
                    {insiderData.holders?.insiderPct != null && (
                      <span>Insider: {insiderData.holders.insiderPct.toFixed(1)}%</span>
                    )}
                    {insiderData.holders?.insiderPct != null && insiderData.holders?.institutionPct != null && " · "}
                    {insiderData.holders?.institutionPct != null && (
                      <span>Inst: {insiderData.holders.institutionPct.toFixed(1)}%</span>
                    )}
                    {!insiderData.holders?.insiderPct && !insiderData.holders?.institutionPct && "—"}
                  </dd>
                </div>
              </div>

              {/* Recent transactions */}
              {insiderData.transactions?.length > 0 && (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer hover:text-ink">
                    Recent insider transactions ({insiderData.transactions.length})
                  </summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full font-mono text-xs">
                      <thead>
                        <tr className="border-b border-line text-left text-[0.6rem] text-muted uppercase">
                          <th className="pb-1 pr-3">Date</th>
                          <th className="pb-1 pr-3">Insider</th>
                          <th className="pb-1 pr-3">Type</th>
                          <th className="pb-1 pr-3 text-right">Shares</th>
                          <th className="pb-1 text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insiderData.transactions.slice(0, 10).map((t, i) => (
                          <tr key={i} className="border-b border-line/50">
                            <td className="py-1.5 pr-3 text-muted">{t.date}</td>
                            <td className="py-1.5 pr-3 text-ink max-w-[150px] truncate">{t.insider}</td>
                            <td className={`py-1.5 pr-3 font-semibold ${
                              t.transaction.toLowerCase().includes("purchase") || t.transaction.toLowerCase().includes("buy")
                                ? "text-gain"
                                : "text-loss"
                            }`}>
                              {t.transaction}
                            </td>
                            <td className="py-1.5 pr-3 text-right text-ink">{formatBigNumber(t.shares)}</td>
                            <td className="py-1.5 text-right text-ink">{formatBigNumber(t.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {/* Top institutions */}
              {insiderData.institutions?.length > 0 && (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer hover:text-ink">
                    Top institutional holders ({insiderData.institutions.length})
                  </summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full font-mono text-xs">
                      <thead>
                        <tr className="border-b border-line text-left text-[0.6rem] text-muted uppercase">
                          <th className="pb-1 pr-3">Holder</th>
                          <th className="pb-1 pr-3 text-right">% Held</th>
                          <th className="pb-1 text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insiderData.institutions.slice(0, 10).map((inst, i) => (
                          <tr key={i} className="border-b border-line/50">
                            <td className="py-1.5 pr-3 text-ink max-w-[200px] truncate">{inst.holder}</td>
                            <td className="py-1.5 pr-3 text-right text-amber">{inst.pctHeld.toFixed(2)}%</td>
                            <td className="py-1.5 text-right text-ink">{formatBigNumber(inst.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Flow Timeline Charts */}
          {snapshotHistory.length >= 3 && (
            <div className="flex flex-col gap-4">
              <SectionLabel>Flow Timeline (30d)</SectionLabel>

              {/* Foreign Flow Bar Chart */}
              <div className="rounded border border-line bg-surface p-4">
                <p className="mb-2 font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
                  Daily Foreign Flow
                </p>
                <BarChartInteractive
                  data={snapshotHistory.map((s) => ({
                    label: s.date,
                    value: s.dailyForeignFlow,
                    detail: "IDR",
                  }))}
                  height={120}
                  bipolar
                />
              </div>

              {/* Whale Score Trend */}
              <div className="rounded border border-line bg-surface p-4">
                <p className="mb-2 font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
                  Whale Score Trend
                </p>
                <Sparkline
                  data={snapshotHistory.map((s) => s.whaleScore)}
                  width={600}
                  height={48}
                  color="var(--color-amber)"
                  showZeroLine
                  className="w-full"
                />
                <div className="mt-1 flex justify-between font-mono text-[0.6rem] text-muted">
                  <span>{snapshotHistory[0]?.date}</span>
                  <span>{snapshotHistory[snapshotHistory.length - 1]?.date}</span>
                </div>
              </div>

              {/* Price + Volume */}
              <div className="rounded border border-line bg-surface p-4">
                <p className="mb-2 font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
                  Price + Volume
                </p>
                <DualAxisChart
                  data={snapshotHistory.map((s) => ({
                    label: s.date,
                    price: s.price,
                    volume: s.volume,
                  }))}
                  height={140}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <SectionLabel>Entry / Exit</SectionLabel>
            <div className="rounded border border-amber/40 bg-surface p-5">
              <div className="grid grid-cols-4 gap-4 font-mono">
                <div>
                  <dt className="text-[0.6875rem] tracking-wide text-muted uppercase">Entry</dt>
                  <dd className="mt-1 text-lg font-semibold text-ink">
                    {rj.entry_exit.entry_zone?.map(formatPrice).join(" – ") ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.6875rem] tracking-wide text-muted uppercase">Stop loss</dt>
                  <dd className="mt-1 text-lg font-semibold text-loss">
                    {formatPrice(rj.entry_exit.stop_loss)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.6875rem] tracking-wide text-muted uppercase">Target</dt>
                  <dd className="mt-1 text-lg font-semibold text-gain">
                    {rj.entry_exit.target_zone?.map(formatPrice).join(" – ") ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.6875rem] tracking-wide text-muted uppercase">R:R</dt>
                  <dd
                    className={`mt-1 text-lg font-semibold ${
                      (rj.entry_exit.risk_reward_ratio ?? 0) >= 2
                        ? "text-gain"
                        : (rj.entry_exit.risk_reward_ratio ?? 0) >= 1
                          ? "text-amber"
                          : "text-loss"
                    }`}
                  >
                    {rj.entry_exit.risk_reward_ratio != null
                      ? `${rj.entry_exit.risk_reward_ratio}:1`
                      : "—"}
                  </dd>
                </div>
              </div>
              <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-ink">
                {rj.entry_exit.position_sizing_note}
              </p>
              {rj.entry_exit.flow_entry && (
                <div
                  className={`mt-3 rounded px-3 py-2 text-xs ${
                    rj.entry_exit.flow_entry.flow_confirms_entry
                      ? "border border-gain/40 bg-gain/10 text-gain"
                      : "border border-loss/40 bg-loss/10 text-loss"
                  }`}
                >
                  <span className="font-mono font-semibold">
                    Flow {rj.entry_exit.flow_entry.flow_confirms_entry ? "CONFIRMS" : "CONTRADICTS"} entry
                  </span>
                  <span className="ml-2 text-ink">{rj.entry_exit.flow_entry.reason}</span>
                </div>
              )}
            </div>
          </div>

          <p className="font-mono text-[0.6875rem] text-muted">
            Data as of {rj.data_as_of} · Sources: {rj.data_sources?.join(", ") ?? "—"}
          </p>
        </>
      )}

      {/* Backtesting & Signal Track Record */}
      <div className="flex flex-col gap-4">
        <SectionLabel>Signal Backtesting</SectionLabel>
        <BacktestButton tickerId={id} />

        {/* Confidence banner */}
        {signalTrackRecord && signalTrackRecord.totalSignals >= 5 && (
          <div
            className={`rounded border px-4 py-3 text-sm font-medium ${
              signalTrackRecord.overallAccuracy >= 60
                ? "border-gain/40 bg-gain/10 text-gain"
                : signalTrackRecord.overallAccuracy >= 40
                  ? "border-amber/40 bg-amber/10 text-amber"
                  : "border-loss/40 bg-loss/10 text-loss"
            }`}
          >
            This ticker&apos;s signals have{" "}
            <span className="font-mono font-bold text-lg">{signalTrackRecord.overallAccuracy}%</span>{" "}
            accuracy over{" "}
            <span className="font-mono font-bold">{signalTrackRecord.totalSignals}</span> signals
          </div>
        )}

        {backtestSummary && backtestSummary.totalSignals > 0 && (
          <>
            <div className="grid grid-cols-5 gap-3 font-mono">
              <div className="rounded border border-line bg-surface p-3 text-center">
                <div className="text-[0.6rem] tracking-wide text-muted uppercase">Win Rate</div>
                <div
                  className={`text-xl font-bold ${
                    backtestSummary.winRate >= 0.55
                      ? "text-gain"
                      : backtestSummary.winRate >= 0.45
                        ? "text-amber"
                        : "text-loss"
                  }`}
                >
                  {Math.round(backtestSummary.winRate * 100)}%
                </div>
              </div>
              <div className="rounded border border-line bg-surface p-3 text-center">
                <div className="text-[0.6rem] tracking-wide text-muted uppercase">Avg 5d</div>
                <div
                  className={`text-lg font-semibold ${
                    backtestSummary.avgReturn5d > 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {backtestSummary.avgReturn5d > 0 ? "+" : ""}
                  {backtestSummary.avgReturn5d}%
                </div>
              </div>
              <div className="rounded border border-line bg-surface p-3 text-center">
                <div className="text-[0.6rem] tracking-wide text-muted uppercase">Avg 10d</div>
                <div
                  className={`text-lg font-semibold ${
                    backtestSummary.avgReturn10d > 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {backtestSummary.avgReturn10d > 0 ? "+" : ""}
                  {backtestSummary.avgReturn10d}%
                </div>
              </div>
              <div className="rounded border border-line bg-surface p-3 text-center">
                <div className="text-[0.6rem] tracking-wide text-muted uppercase">Avg 20d</div>
                <div
                  className={`text-lg font-semibold ${
                    backtestSummary.avgReturn20d > 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {backtestSummary.avgReturn20d > 0 ? "+" : ""}
                  {backtestSummary.avgReturn20d}%
                </div>
              </div>
              <div className="rounded border border-line bg-surface p-3 text-center">
                <div className="text-[0.6rem] tracking-wide text-muted uppercase">Max DD</div>
                <div className="text-lg font-semibold text-loss">
                  {backtestSummary.avgMaxDrawdown}%
                </div>
              </div>
            </div>

            <div className="font-mono text-xs text-muted">
              {backtestSummary.totalSignals} signals · {backtestSummary.wins}W / {backtestSummary.losses}L / {backtestSummary.neutral}N
            </div>
          </>
        )}

        {/* Signal Track Record — per-type cards */}
        {signalTrackRecord && signalTrackRecord.byType.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
              Signal type track record
            </p>
            {signalTrackRecord.byType.map((st) => (
              <details
                key={st.signalType}
                className="rounded border border-line bg-surface"
              >
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-bg">
                  <span className="font-mono text-sm font-semibold text-ink w-40">
                    {st.signalType.replace(/_/g, " ")}
                  </span>
                  <WinRateBar winRate={st.winRate} />
                  <span className="ml-auto font-mono text-xs text-muted">
                    {st.count} signals
                  </span>
                </summary>
                <div className="border-t border-line px-4 py-3 space-y-3">
                  {/* Avg returns */}
                  <div className="grid grid-cols-3 gap-3 font-mono text-xs">
                    <div>
                      <span className="text-muted">Avg 5d: </span>
                      <span className={st.avgReturn5d > 0 ? "text-gain" : "text-loss"}>
                        {st.avgReturn5d > 0 ? "+" : ""}{st.avgReturn5d}%
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Avg 10d: </span>
                      <span className={st.avgReturn10d > 0 ? "text-gain" : "text-loss"}>
                        {st.avgReturn10d > 0 ? "+" : ""}{st.avgReturn10d}%
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Avg 20d: </span>
                      <span className={st.avgReturn20d > 0 ? "text-gain" : "text-loss"}>
                        {st.avgReturn20d > 0 ? "+" : ""}{st.avgReturn20d}%
                      </span>
                    </div>
                  </div>

                  {/* Recent signals */}
                  {st.recentSignals.length > 0 && (
                    <div>
                      <p className="font-mono text-[0.6rem] tracking-wide text-muted uppercase mb-1">
                        Last {st.recentSignals.length} signals
                      </p>
                      <div className="space-y-1">
                        {st.recentSignals.map((sig) => (
                          <div
                            key={sig.date}
                            className="flex items-center gap-2 font-mono text-xs"
                          >
                            <span className="text-muted w-20">{sig.date}</span>
                            <span
                              className={`w-4 text-center font-bold ${
                                sig.outcome === "win"
                                  ? "text-gain"
                                  : sig.outcome === "loss"
                                    ? "text-loss"
                                    : "text-muted"
                              }`}
                            >
                              {sig.outcome === "win" ? "W" : sig.outcome === "loss" ? "L" : "-"}
                            </span>
                            <span
                              className={
                                sig.return10d > 0 ? "text-gain" : sig.return10d < 0 ? "text-loss" : "text-muted"
                              }
                            >
                              {sig.return10d > 0 ? "+" : ""}{sig.return10d}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}

        {backtestSummary === null && !signalTrackRecord && (
          <p className="text-sm text-muted">
            No backtest data yet. Click &quot;Run backtest&quot; to backfill 2 years of price history and analyze signal accuracy.
          </p>
        )}
      </div>
    </div>
  );
}
