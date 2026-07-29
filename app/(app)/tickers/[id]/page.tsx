import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VerdictBadge, verdictAccentClass } from "@/app/components/verdict-badge";
import type { ReportJson } from "@/lib/reports/schema";
import { RefreshButton } from "./refresh-button";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function formatPrice(n: number) {
  return n.toLocaleString("en-US");
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
    .select("id, signal_type, severity, title, description, created_at")
    .eq("ticker_id", id)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex items-start justify-between">
        <Link href="/" className="text-sm font-medium text-muted hover:text-amber">
          ← Dashboard
        </Link>
        <RefreshButton tickerId={ticker.id} />
      </div>

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

      {tickerSignals && tickerSignals.length > 0 && (
        <div className="flex flex-col gap-2">
          {tickerSignals.map((signal) => (
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
                  const sub = rj.composite_score![key];
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
                  {[...rj.composite_score.technical.factors, ...rj.composite_score.fundamental.factors, ...rj.composite_score.flow.factors].map(
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
                value={`${rj.technical.support_levels.map(formatPrice).join(" / ")}  —  ${rj.technical.resistance_levels
                  .map(formatPrice)
                  .join(" / ")}`}
              />
              <Field label="Volume" value={rj.technical.volume_note} span />
              <Field label="Unusual activity" value={rj.technical.unusual_activity ?? "None noted"} span />
            </dl>
          </div>

          <div className="flex flex-col gap-4">
            <SectionLabel>Fundamental</SectionLabel>
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
                {rj.catalysts_and_risks.upcoming_events.length ? (
                  <ul className="mt-1 list-inside list-disc text-sm leading-relaxed text-ink">
                    {rj.catalysts_and_risks.upcoming_events.map((event) => (
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
              {rj.money_flow.daily_foreign_flow.length > 0 && (
                <div>
                  <dt className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase mb-2">
                    Daily foreign flow (20d)
                  </dt>
                  <div className="flex items-end gap-px h-16">
                    {(() => {
                      const flows = rj.money_flow!.daily_foreign_flow;
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
                  {rj.money_flow.top_buyers.length > 0 ? (
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
                  {rj.money_flow.top_sellers.length > 0 ? (
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

          <div className="flex flex-col gap-4">
            <SectionLabel>Entry / Exit</SectionLabel>
            <div className="rounded border border-amber/40 bg-surface p-5">
              <div className="grid grid-cols-3 gap-4 font-mono">
                <div>
                  <dt className="text-[0.6875rem] tracking-wide text-muted uppercase">Entry</dt>
                  <dd className="mt-1 text-lg font-semibold text-ink">
                    {rj.entry_exit.entry_zone.map(formatPrice).join(" – ")}
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
                    {rj.entry_exit.target_zone.map(formatPrice).join(" – ")}
                  </dd>
                </div>
              </div>
              <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-ink">
                {rj.entry_exit.position_sizing_note}
              </p>
            </div>
          </div>

          <p className="font-mono text-[0.6875rem] text-muted">
            Data as of {rj.data_as_of} · Sources: {rj.data_sources.join(", ")}
          </p>
        </>
      )}
    </div>
  );
}
