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
