"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import type { ScreenerRow } from "@/lib/screener/get-screener-data";

type SortKey = keyof ScreenerRow;
type SortDir = "asc" | "desc";

/* ── Smart Money Presets ─────────────────────────────────────────── */

type Preset = {
  key: string;
  label: string;
  description: string;
  filter: (r: ScreenerRow) => boolean;
  defaultSort: SortKey;
};

const PRESETS: Preset[] = [
  {
    key: "all",
    label: "All Stocks",
    description: "No filter — show everything",
    filter: () => true,
    defaultSort: "compositeScore",
  },
  {
    key: "whale_accumulation",
    label: "Whale Accumulation",
    description: "Smart money buying, divergent from retail",
    filter: (r) =>
      (r.smartMoneyScore ?? 0) > 0 &&
      (r.smartVsRetail === "divergent" || r.smartVsRetail === "leading") &&
      (r.flowMomentum === "accelerating" || r.flowMomentum === "steady"),
    defaultSort: "smartMoneyScore",
  },
  {
    key: "foreign_inflow",
    label: "Foreign Inflow",
    description: "Strong foreign buying with positive momentum",
    filter: (r) =>
      (r.foreignFlowScore ?? 0) > 20 &&
      (r.flowMomentum === "accelerating" || r.flowMomentum === "steady"),
    defaultSort: "foreignFlowScore",
  },
  {
    key: "oversold_smart",
    label: "Oversold + Smart Buy",
    description: "RSI oversold but whales are accumulating",
    filter: (r) =>
      (r.rsi ?? 50) < 35 &&
      (r.smartMoneyScore ?? 0) > 0,
    defaultSort: "rsi",
  },
  {
    key: "high_conviction",
    label: "High Conviction",
    description: "Accumulate verdict, high score & confidence",
    filter: (r) =>
      r.verdict === "Accumulate" &&
      (r.compositeScore ?? 0) > 30 &&
      r.confidence === "High",
    defaultSort: "compositeScore",
  },
  {
    key: "danger_zone",
    label: "Danger Zone",
    description: "Whale selling, foreign outflow, avoid verdict",
    filter: (r) =>
      (r.smartMoneyScore ?? 0) < 0 &&
      (r.foreignFlowScore ?? 0) < -20 &&
      r.verdict === "Avoid",
    defaultSort: "smartMoneyScore",
  },
];

function formatBig(n: number): string {
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return n.toLocaleString();
}

const VERDICT_ORDER: Record<string, number> = { Accumulate: 4, Hold: 3, Watch: 2, Avoid: 1 };

function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "right";
}) {
  const active = currentSort === sortKey;
  return (
    <th
      className={`cursor-pointer select-none pb-2 pr-3 font-mono text-[0.6rem] tracking-wide text-muted uppercase hover:text-ink ${
        align === "right" ? "text-right" : "text-left"
      } ${active ? "text-amber" : ""}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && <span className="ml-0.5">{currentDir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}

export function ScreenerTable({ rows }: { rows: ScreenerRow[] }) {
  const [activePreset, setActivePreset] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("compositeScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [verdictFilter, setVerdictFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  function applyPreset(presetKey: string) {
    setActivePreset(presetKey);
    const preset = PRESETS.find((p) => p.key === presetKey);
    if (preset) {
      setSortKey(preset.defaultSort);
      setSortDir(presetKey === "oversold_smart" ? "asc" : "desc");
    }
    // Reset manual filters when switching presets
    if (presetKey !== "all") {
      setVerdictFilter("all");
    }
  }

  const sectors = useMemo(
    () => ["all", ...new Set(rows.map((r) => r.sector).filter(Boolean)).values()],
    [rows]
  );
  const verdicts = useMemo(
    () => ["all", ...new Set(rows.map((r) => r.verdict).filter((v): v is string => v != null)).values()],
    [rows]
  );

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const preset = PRESETS.find((p) => p.key === activePreset) ?? PRESETS[0];

  const filtered = useMemo(() => {
    let result = rows.filter(preset.filter);
    if (sectorFilter !== "all") result = result.filter((r) => r.sector === sectorFilter);
    if (verdictFilter !== "all") result = result.filter((r) => r.verdict === verdictFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, preset, sectorFilter, verdictFilter, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];

      // Handle verdict as ordinal
      if (sortKey === "verdict") {
        aVal = VERDICT_ORDER[aVal as string] ?? 0;
        bVal = VERDICT_ORDER[bVal as string] ?? 0;
      }

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      const numA = Number(aVal);
      const numB = Number(bVal);
      return sortDir === "asc" ? numA - numB : numB - numA;
    });
  }, [filtered, sortKey, sortDir]);

  return (
    <div className="flex flex-col gap-4">
      {/* Smart Presets */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[0.6rem] tracking-wide text-muted uppercase">
          Follow the Big Money
        </span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              title={p.description}
              className={`rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
                activePreset === p.key
                  ? p.key === "danger_zone"
                    ? "border-loss bg-loss/15 font-semibold text-loss"
                    : "border-amber bg-amber/15 font-semibold text-amber"
                  : "border-line text-muted hover:border-amber hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {activePreset !== "all" && (
          <p className="font-mono text-[0.6rem] text-muted">{preset.description}</p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search symbol or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border border-line bg-surface px-3 py-1.5 font-mono text-xs text-ink placeholder:text-muted focus:border-amber focus:outline-none w-48"
        />
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="rounded border border-line bg-surface px-3 py-1.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
        >
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Sectors" : s}
            </option>
          ))}
        </select>
        <select
          value={verdictFilter}
          onChange={(e) => setVerdictFilter(e.target.value)}
          className="rounded border border-line bg-surface px-3 py-1.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
        >
          {verdicts.map((v) => (
            <option key={v} value={v}>
              {v === "all" ? "All Verdicts" : v}
            </option>
          ))}
        </select>
        <span className="ml-auto font-mono text-[0.6rem] text-muted">
          {sorted.length} stock{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] font-mono text-xs">
          <thead>
            <tr className="border-b border-line">
              <SortHeader label="Symbol" sortKey="symbol" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Sector" sortKey="sector" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Price" sortKey="price" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Chg%" sortKey="changePercent" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Verdict" sortKey="verdict" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Score" sortKey="compositeScore" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Whale" sortKey="smartMoneyScore" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Foreign" sortKey="foreignFlowScore" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="RSI" sortKey="rsi" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="P/E" sortKey="pe" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="ROE" sortKey="roe" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              <SortHeader label="Mkt Cap" sortKey="marketCap" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.tickerId}
                className="border-b border-line/50 transition-colors hover:bg-surface"
              >
                {/* Symbol */}
                <td className="py-2 pr-3">
                  <Link href={`/tickers/${r.tickerId}`} className="font-semibold text-ink hover:text-amber">
                    {r.symbol}
                  </Link>
                  <div className="text-[0.6rem] text-muted truncate max-w-[120px]">{r.name}</div>
                </td>
                {/* Sector */}
                <td className="py-2 pr-3 text-muted">{r.sector || "—"}</td>
                {/* Price */}
                <td className="py-2 pr-3 text-right text-ink">{r.price ? r.price.toLocaleString() : "—"}</td>
                {/* Change % */}
                <td className={`py-2 pr-3 text-right font-semibold ${
                  r.changePercent > 0 ? "text-gain" : r.changePercent < 0 ? "text-loss" : "text-muted"
                }`}>
                  {r.changePercent !== 0
                    ? `${r.changePercent > 0 ? "+" : ""}${r.changePercent.toFixed(2)}%`
                    : "—"}
                </td>
                {/* Verdict */}
                <td className="py-2 pr-3">
                  {r.verdict ? (
                    <span className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase ${
                      r.verdict === "Accumulate"
                        ? "bg-gain/15 text-gain"
                        : r.verdict === "Avoid"
                          ? "bg-loss/15 text-loss"
                          : r.verdict === "Watch"
                            ? "bg-amber/15 text-amber"
                            : "bg-muted/15 text-muted"
                    }`}>
                      {r.verdict}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                {/* Composite Score */}
                <td className={`py-2 pr-3 text-right font-semibold ${
                  (r.compositeScore ?? 0) > 20 ? "text-gain" : (r.compositeScore ?? 0) < -20 ? "text-loss" : "text-ink"
                }`}>
                  {r.compositeScore != null ? `${r.compositeScore > 0 ? "+" : ""}${r.compositeScore}` : "—"}
                </td>
                {/* Whale Score */}
                <td className={`py-2 pr-3 text-right ${
                  (r.smartMoneyScore ?? 0) > 0 ? "text-gain" : (r.smartMoneyScore ?? 0) < 0 ? "text-loss" : "text-muted"
                }`}>
                  {r.smartMoneyScore != null ? r.smartMoneyScore : "—"}
                </td>
                {/* Foreign Flow */}
                <td className={`py-2 pr-3 text-right ${
                  (r.foreignFlowScore ?? 0) > 0 ? "text-gain" : (r.foreignFlowScore ?? 0) < 0 ? "text-loss" : "text-muted"
                }`}>
                  {r.foreignFlowScore != null ? r.foreignFlowScore : "—"}
                </td>
                {/* RSI */}
                <td className={`py-2 pr-3 text-right ${
                  (r.rsi ?? 50) > 70 ? "text-loss" : (r.rsi ?? 50) < 30 ? "text-gain" : "text-ink"
                }`}>
                  {r.rsi != null ? r.rsi.toFixed(0) : "—"}
                </td>
                {/* P/E */}
                <td className="py-2 pr-3 text-right text-ink">
                  {r.pe != null ? r.pe.toFixed(1) : "—"}
                </td>
                {/* ROE */}
                <td className={`py-2 pr-3 text-right ${
                  (r.roe ?? 0) >= 15 ? "text-gain" : (r.roe ?? 0) >= 10 ? "text-amber" : "text-ink"
                }`}>
                  {r.roe != null ? `${r.roe.toFixed(1)}%` : "—"}
                </td>
                {/* Market Cap */}
                <td className="py-2 text-right text-muted">
                  {r.marketCap ? formatBig(r.marketCap) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div className="py-8 text-center text-sm text-muted">
          No stocks match your filters.
        </div>
      )}
    </div>
  );
}
