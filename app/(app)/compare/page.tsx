import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getComparisonData } from "@/lib/compare/get-comparison-data";
import { VerdictBadge } from "@/app/components/verdict-badge";
import { SectionLabel } from "@/app/components/section-label";
import { ScoreCard } from "@/app/components/score-card";
import { TickerPicker } from "./ticker-picker";

function formatPrice(n: number) {
  return n.toLocaleString("en-US");
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toLocaleString();
}

function winnerClass(values: (number | undefined)[], idx: number, higherIsBetter = true): string {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return "";
  const best = higherIsBetter ? Math.max(...nums) : Math.min(...nums);
  return values[idx] === best ? "text-gain font-bold" : "";
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ tickers?: string }>;
}) {
  const { tickers: tickersParam } = await searchParams;
  const supabase = await createClient();

  // Get all active tickers for picker
  const { data: allTickers } = await supabase
    .from("tickers")
    .select("id, symbol")
    .eq("active", true)
    .order("symbol");

  const symbols = tickersParam?.split(",").filter(Boolean) ?? [];

  const comparison = symbols.length >= 2
    ? await getComparisonData(supabase, symbols)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
          Compare Stocks
        </h1>
        <Link href="/" className="text-sm font-medium text-muted hover:text-amber">
          ← Dashboard
        </Link>
      </div>

      {/* Ticker Picker */}
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs text-muted">Select 2-3 tickers to compare</p>
        <TickerPicker tickers={allTickers ?? []} />
      </div>

      {/* Comparison Table */}
      {comparison && comparison.tickers.length >= 2 && (
        <>
          {/* Verdict Row */}
          <div className="flex flex-col gap-4">
            <SectionLabel>Verdict</SectionLabel>
            <div className={`grid gap-4 grid-cols-${comparison.tickers.length}`}>
              {comparison.tickers.map((t) => (
                <Link
                  key={t.tickerId}
                  href={`/tickers/${t.tickerId}`}
                  className="rounded border border-line bg-surface p-4 text-center transition-colors hover:border-amber"
                >
                  <div className="font-display text-xl font-bold text-ink">{t.symbol}</div>
                  <p className="mt-1 text-xs text-muted">{t.name}</p>
                  <div className="mt-3">
                    <VerdictBadge verdict={t.verdict} />
                  </div>
                  <p className="mt-1 font-mono text-[0.6rem] text-muted">
                    {t.confidence ?? "—"}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          {/* Composite Scores */}
          <div className="flex flex-col gap-4">
            <SectionLabel>Composite Scores</SectionLabel>
            <div className={`grid gap-4 grid-cols-${comparison.tickers.length}`}>
              {comparison.tickers.map((t, idx) => (
                <div key={t.tickerId} className="space-y-2">
                  <ScoreCard
                    label="Total"
                    value={t.compositeTotal != null ? `${t.compositeTotal > 0 ? "+" : ""}${t.compositeTotal}` : "—"}
                    color={
                      t.compositeTotal != null
                        ? t.compositeTotal > 20
                          ? "gain"
                          : t.compositeTotal < -20
                            ? "loss"
                            : "amber"
                        : "muted"
                    }
                    size={winnerClass(comparison.tickers.map((x) => x.compositeTotal), idx) ? "lg" : "md"}
                  />
                  <ScoreCard
                    label="Technical"
                    value={t.technicalScore != null ? `${t.technicalScore > 0 ? "+" : ""}${t.technicalScore}` : "—"}
                    color={t.technicalScore != null && t.technicalScore > 10 ? "gain" : t.technicalScore != null && t.technicalScore < -10 ? "loss" : "muted"}
                  />
                  <ScoreCard
                    label="Fundamental"
                    value={t.fundamentalScore != null ? `${t.fundamentalScore > 0 ? "+" : ""}${t.fundamentalScore}` : "—"}
                    color={t.fundamentalScore != null && t.fundamentalScore > 10 ? "gain" : t.fundamentalScore != null && t.fundamentalScore < -10 ? "loss" : "muted"}
                  />
                  <ScoreCard
                    label="Flow"
                    value={t.flowScore != null ? `${t.flowScore > 0 ? "+" : ""}${t.flowScore}` : "—"}
                    color={t.flowScore != null && t.flowScore > 10 ? "gain" : t.flowScore != null && t.flowScore < -10 ? "loss" : "muted"}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Smart Money */}
          <div className="flex flex-col gap-4">
            <SectionLabel>Smart Money</SectionLabel>
            <div className={`grid gap-4 grid-cols-${comparison.tickers.length}`}>
              {comparison.tickers.map((t, idx) => (
                <div key={t.tickerId} className="rounded border border-line bg-surface p-4 space-y-3 font-mono text-xs">
                  <div>
                    <span className="text-muted">Foreign flow: </span>
                    <span className={`font-semibold ${
                      (t.foreignFlowScore ?? 0) > 0 ? "text-gain" : (t.foreignFlowScore ?? 0) < 0 ? "text-loss" : "text-ink"
                    } ${winnerClass(comparison.tickers.map((x) => x.foreignFlowScore), idx)}`}>
                      {t.foreignFlowScore != null ? `${t.foreignFlowScore > 0 ? "+" : ""}${t.foreignFlowScore}` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Whale score: </span>
                    <span className={`font-semibold ${
                      (t.smartMoneyScore ?? 0) > 0 ? "text-gain" : (t.smartMoneyScore ?? 0) < 0 ? "text-loss" : "text-ink"
                    } ${winnerClass(comparison.tickers.map((x) => x.smartMoneyScore), idx)}`}>
                      {t.smartMoneyScore ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Whale net: </span>
                    <span className={
                      (t.whaleNetFlow ?? 0) > 0 ? "text-gain" : (t.whaleNetFlow ?? 0) < 0 ? "text-loss" : "text-ink"
                    }>
                      {t.whaleNetFlow != null ? `${formatValue(t.whaleNetFlow)} IDR` : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Smart vs Retail: </span>
                    <span className={
                      t.smartVsRetail === "divergent" ? "text-amber" : t.smartVsRetail === "aligned" ? "text-gain" : "text-muted"
                    }>
                      {t.smartVsRetail ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Momentum: </span>
                    <span className="text-ink capitalize">{t.flowMomentum ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Entry/Exit */}
          <div className="flex flex-col gap-4">
            <SectionLabel>Entry / Exit</SectionLabel>
            <div className={`grid gap-4 grid-cols-${comparison.tickers.length}`}>
              {comparison.tickers.map((t, idx) => (
                <div key={t.tickerId} className="rounded border border-line bg-surface p-4 space-y-2 font-mono text-xs">
                  <div>
                    <span className="text-muted">Entry: </span>
                    <span className="text-ink font-semibold">
                      {t.entryZone ? t.entryZone.map(formatPrice).join(" – ") : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Stop: </span>
                    <span className="text-loss font-semibold">
                      {t.stopLoss != null ? formatPrice(t.stopLoss) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Target: </span>
                    <span className="text-gain font-semibold">
                      {t.targetZone ? t.targetZone.map(formatPrice).join(" – ") : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">R:R: </span>
                    <span className={`font-semibold ${
                      (t.riskReward ?? 0) >= 2 ? "text-gain" : (t.riskReward ?? 0) >= 1 ? "text-amber" : "text-loss"
                    } ${winnerClass(comparison.tickers.map((x) => x.riskReward), idx)}`}>
                      {t.riskReward != null ? `${t.riskReward}:1` : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cross-Stock Correlation */}
          {(comparison.crossStock.rotations.length > 0 ||
            comparison.crossStock.coordinatedMoves.length > 0) && (
            <div className="flex flex-col gap-4">
              <SectionLabel>Cross-Stock Patterns</SectionLabel>

              {comparison.crossStock.rotations.length > 0 && (
                <div>
                  <p className="mb-2 font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
                    Broker Rotations
                  </p>
                  {comparison.crossStock.rotations
                    .filter((r) => r.isRotation)
                    .slice(0, 5)
                    .map((r, i) => (
                      <div
                        key={i}
                        className="mb-1 rounded border border-amber/30 bg-amber/5 px-3 py-2 text-xs text-ink"
                      >
                        <span className="font-mono font-bold text-amber">{r.brokerCode}</span>{" "}
                        {r.description}
                      </div>
                    ))}
                </div>
              )}

              {comparison.crossStock.coordinatedMoves.length > 0 && (
                <div>
                  <p className="mb-2 font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
                    Coordinated Moves
                  </p>
                  {comparison.crossStock.coordinatedMoves.map((m, i) => (
                    <div
                      key={i}
                      className={`mb-1 rounded border px-3 py-2 text-xs ${
                        m.direction === "buying"
                          ? "border-gain/30 bg-gain/5 text-ink"
                          : "border-loss/30 bg-loss/5 text-ink"
                      }`}
                    >
                      {m.description}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Summary */}
          <div className="flex flex-col gap-4">
            <SectionLabel>AI Summary</SectionLabel>
            <div className={`grid gap-4 grid-cols-${comparison.tickers.length}`}>
              {comparison.tickers.map((t) => (
                <div key={t.tickerId} className="rounded border border-line bg-surface p-4">
                  <p className="font-mono text-xs font-bold text-amber mb-2">{t.symbol}</p>
                  <p className="text-xs leading-relaxed text-muted">
                    {t.summary ?? "No report available"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {symbols.length < 2 && (
        <div className="rounded border border-dashed border-line py-16 text-center text-muted">
          Select at least 2 tickers above to start comparing.
        </div>
      )}
    </div>
  );
}
