import { classifyBroker } from "./broker-codes";
import type { BrokerActivity, DailyForeignFlow } from "./types";

// ---------------------------------------------------------------------------
// Index Alpha API client — https://indexalpha.id
// Free tier: 5 requests/day. Uses batch endpoints to minimize calls.
// ---------------------------------------------------------------------------

const BASE = "https://api.indexalpha.id";

function getApiKey(): string | null {
  return process.env.INDEX_ALPHA_API_KEY ?? null;
}

async function alphaFetch(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const key = getApiKey();
  if (!key) {
    throw new Error("INDEX_ALPHA_API_KEY is not set");
  }

  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Index Alpha ${res.status}: ${res.statusText} — ${text.slice(0, 200)}`
    );
  }

  return res;
}

// ---------------------------------------------------------------------------
// Broker summary
// ---------------------------------------------------------------------------

type AlphaBrokerRow = {
  code: string;
  buy_freq: number;
  buy_volume: number;
  buy_value: number;
  sell_freq: number;
  sell_volume: number;
  sell_value: number;
  buy_avg: number;
  sell_avg: number;
};

export type BrokerSummaryResult = {
  symbol: string;
  brokers: BrokerActivity[];
};

/**
 * Fetch broker summary for a single ticker over a date range.
 * Uses GET /stocks/broker-summary.
 */
export async function fetchBrokerSummary(
  ticker: string,
  from: string,
  to: string
): Promise<BrokerSummaryResult> {
  const params = new URLSearchParams({
    ticker,
    from,
    to,
    investor: "all",
    market: "RG",
  });

  const res = await alphaFetch(`/stocks/broker-summary?${params}`);
  const json = await res.json();
  const rows: AlphaBrokerRow[] = Array.isArray(json)
    ? json
    : json && typeof json === "object" && "data" in json && Array.isArray(json.data)
      ? json.data
      : [];

  return {
    symbol: ticker,
    brokers: rows.map(mapBrokerRow),
  };
}

/**
 * Fetch broker summary for multiple tickers at once.
 * Uses POST /stocks/broker-summary/batch — 1 API call for all tickers.
 */
export async function fetchBatchBrokerSummary(
  tickers: string[],
  from: string,
  to: string
): Promise<Map<string, BrokerActivity[]>> {
  const res = await alphaFetch("/stocks/broker-summary/batch", {
    method: "POST",
    body: { tickers, from, to, investor: "all", market: "RG" },
  });

  const json = await res.json();

  // The API may return { data: { SYMBOL: [...] } } or { SYMBOL: [...] } or other shapes.
  // Normalize to Record<string, AlphaBrokerRow[]>.
  const data: Record<string, unknown> =
    json && typeof json === "object" && !Array.isArray(json)
      ? "data" in json && typeof json.data === "object" && json.data !== null
        ? (json.data as Record<string, unknown>)
        : (json as Record<string, unknown>)
      : {};

  const result = new Map<string, BrokerActivity[]>();

  for (const [symbol, rows] of Object.entries(data)) {
    if (Array.isArray(rows)) {
      result.set(symbol, rows.map(mapBrokerRow));
    }
  }

  return result;
}

function mapBrokerRow(r: AlphaBrokerRow): BrokerActivity {
  return {
    brokerCode: r.code,
    type: classifyBroker(r.code),
    buyVolume: r.buy_volume,
    buyValue: r.buy_value,
    sellVolume: r.sell_volume,
    sellValue: r.sell_value,
    netValue: r.buy_value - r.sell_value,
  };
}

// ---------------------------------------------------------------------------
// Foreign flow
// ---------------------------------------------------------------------------

type AlphaFlowRow = {
  date: string;
  foreign_buy: number;
  foreign_sell: number;
  net_foreign: number;
};

/**
 * Fetch daily foreign flow for a single ticker over a date range.
 */
export async function fetchForeignFlow(
  ticker: string,
  from: string,
  to: string
): Promise<DailyForeignFlow[]> {
  const params = new URLSearchParams({ ticker, from, to, market: "ALL" });
  const res = await alphaFetch(`/foreign-flow?${params}`);
  const json = await res.json();
  const rows: AlphaFlowRow[] = Array.isArray(json)
    ? json
    : json && typeof json === "object" && "data" in json && Array.isArray(json.data)
      ? json.data
      : [];

  return rows.map((r) => ({
    date: r.date,
    foreignBuy: r.foreign_buy,
    foreignSell: r.foreign_sell,
    netForeign: r.net_foreign,
  }));
}

/**
 * Fetch daily foreign flow for multiple tickers at once.
 * Uses POST /foreign-flow/batch — 1 API call for all tickers.
 */
export async function fetchBatchForeignFlow(
  tickers: string[],
  from: string,
  to: string
): Promise<Map<string, DailyForeignFlow[]>> {
  const res = await alphaFetch("/foreign-flow/batch", {
    method: "POST",
    body: { tickers, from, to, market: "ALL" },
  });

  const json = await res.json();

  const data: Record<string, unknown> =
    json && typeof json === "object" && !Array.isArray(json)
      ? "data" in json && typeof json.data === "object" && json.data !== null
        ? (json.data as Record<string, unknown>)
        : (json as Record<string, unknown>)
      : {};

  const result = new Map<string, DailyForeignFlow[]>();

  for (const [symbol, rows] of Object.entries(data)) {
    if (Array.isArray(rows)) {
      result.set(
        symbol,
        rows.map((r: AlphaFlowRow) => ({
          date: r.date,
          foreignBuy: r.foreign_buy,
          foreignSell: r.foreign_sell,
          netForeign: r.net_foreign,
        }))
      );
    }
  }

  return result;
}
