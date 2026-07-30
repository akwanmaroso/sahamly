import type { OhlcvBar, RawFlow, RawFundamentals, RawTickerData } from "./types";

// ---------------------------------------------------------------------------
// IDX official website JSON endpoints — free, no API key required.
// Requires a session cookie obtained by visiting idx.co.id first.
// ---------------------------------------------------------------------------

const IDX_BASE = "https://www.idx.co.id/primary";

const BROWSER_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
  Referer: "https://www.idx.co.id/",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
};

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

/** Thrown when IDX is unreachable/blocking, so callers can fall back. */
export class IdxUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdxUnavailableError";
  }
}

let sessionCookie = "";
let sessionExpiry = 0;
const SESSION_TTL_MS = 10 * 60 * 1000; // refresh every 10 min

async function ensureSession(): Promise<void> {
  if (sessionCookie && Date.now() < sessionExpiry) return;

  const res = await fetch("https://www.idx.co.id/id", {
    headers: BROWSER_HEADERS,
    redirect: "follow",
    cache: "no-store",
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  sessionCookie = setCookies.join("; ");
  // Fully consume the body so the connection is released
  await res.text();

  // A blocked landing page still hands back a challenge cookie, so without
  // this check every downstream call fails with its own confusing 403.
  if (!res.ok) {
    sessionCookie = "";
    sessionExpiry = 0;
    const via = res.headers.get("server") ?? "unknown";
    throw new IdxUnavailableError(
      `IDX session bootstrap failed: ${res.status} ${res.statusText} from idx.co.id (server: ${via}). ` +
        `The IDX site is blocking this host, so no IDX endpoint will succeed.`
    );
  }

  // Warm the session with a lightweight call
  const warmup = await fetch(`${IDX_BASE}/home/GetIndexList`, {
    headers: { ...BROWSER_HEADERS, Cookie: sessionCookie },
    cache: "no-store",
  });
  await warmup.text();

  sessionExpiry = Date.now() + SESSION_TTL_MS;
}

async function idxFetch(url: string): Promise<Response> {
  await ensureSession();
  const res = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      "X-Requested-With": "XMLHttpRequest",
      Cookie: sessionCookie,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const msg = `IDX API ${res.status}: ${res.statusText} for ${url}`;
    // 403/429 mean bot-blocking or rate limiting rather than a bad request —
    // both are worth falling back on rather than failing the whole snapshot.
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      sessionCookie = "";
      sessionExpiry = 0;
      throw new IdxUnavailableError(msg);
    }
    throw new Error(msg);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Raw IDX response types (only what we use)
// ---------------------------------------------------------------------------

type IdxOhlcvRow = {
  Date: string;
  OpenPrice: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  ListedShares: number;
};

type IdxStockSummaryRow = {
  StockCode: string;
  Date: string;
  OpenPrice: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  Value: number;
  ForeignBuy: number;
  ForeignSell: number;
  ListedShares: number;
};

type IdxFinancialRatioRow = {
  code: string;
  sector: string;
  per: number;
  priceBV: number;
  deRatio: number;
  roa: number;
  roe: number;
  npm: number;
  eps: number;
  sales: number;
  profitPeriod: number;
};

type IdxIndustryRow = {
  Name: string;
  PER: number;
  PBV: number;
  MCap: number;
};

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

async function fetchOhlcvHistory(
  symbol: string,
  length = 250
): Promise<IdxOhlcvRow[]> {
  const res = await idxFetch(
    `${IDX_BASE}/ListedCompany/GetTradingInfoSS?code=${symbol}&start=0&length=${length}`
  );
  const json = await res.json();
  return json?.replies ?? [];
}

/** Returns the stock summary row for `symbol` on the given date (YYYYMMDD). */
async function fetchStockSummary(
  symbol: string,
  dateYYYYMMDD: string
): Promise<IdxStockSummaryRow | null> {
  const res = await idxFetch(
    `${IDX_BASE}/TradingSummary/GetStockSummary?date=${dateYYYYMMDD}`
  );
  const json = await res.json();
  const rows: IdxStockSummaryRow[] = json?.data ?? [];
  return rows.find((r) => r.StockCode === symbol) ?? null;
}

async function fetchFinancialRatios(
  year: number,
  month: number
): Promise<IdxFinancialRatioRow[]> {
  const res = await idxFetch(
    `${IDX_BASE}/DigitalStatistic/GetApiDataPaginated?urlName=LINK_FINANCIAL_DATA_RATIO&periodYear=${year}&periodMonth=${month}&periodType=monthly&isPrint=False&cumulative=false`
  );
  const json = await res.json();
  return json?.data ?? [];
}

async function fetchIndustrySummary(
  year: number,
  month: number
): Promise<IdxIndustryRow[]> {
  const res = await idxFetch(
    `${IDX_BASE}/DigitalStatistic/GetApiData?urlName=LINK_LIST_TRADING_SUMMARY_INDUSTRY_CLASSIFICATION&query=${btoa(
      JSON.stringify({ year: String(year), month: String(month), quarter: 0, type: "monthly" })
    )}&isPrint=False&cumulative=false`
  );
  const json = await res.json();
  return json?.data ?? [];
}

async function fetchTradingInfoDaily(
  symbol: string
): Promise<{ NumberForeigner?: number } | null> {
  const res = await idxFetch(
    `${IDX_BASE}/ListedCompany/GetTradingInfoDaily?code=${symbol}`
  );
  const json = await res.json();
  return json?.SecurityCode ? json : null;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function toIsoDate(raw: string): string {
  // IDX returns "/Date(1719273600000)/" or ISO strings
  const msMatch = raw.match(/\/Date\((\d+)\)\//);
  if (msMatch) {
    return new Date(Number(msMatch[1])).toISOString().slice(0, 10);
  }
  return new Date(raw).toISOString().slice(0, 10);
}

function toDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function mapOhlcv(rows: IdxOhlcvRow[]): OhlcvBar[] {
  return rows
    .map((r) => ({
      date: toIsoDate(r.Date),
      open: r.OpenPrice,
      high: r.High,
      low: r.Low,
      close: r.Close,
      volume: r.Volume,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Company list (for stock picker)
// ---------------------------------------------------------------------------

export type IdxCompany = {
  code: string;
  name: string;
  sector: string;
};

let companyCache: { data: IdxCompany[]; expiry: number } | null = null;
const COMPANY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function fetchIdxCompanies(): Promise<IdxCompany[]> {
  if (companyCache && Date.now() < companyCache.expiry) {
    return companyCache.data;
  }

  const res = await idxFetch(
    `${IDX_BASE}/StockData/GetSecuritiesStock?start=0&length=9999&code=&sector=&board=`
  );
  const json = await res.json();
  const rows: Array<{
    Code: string;
    Name: string;
    ListingBoard: string;
  }> = json?.data ?? [];

  const companies = rows.map((r) => ({
    code: r.Code.trim(),
    name: r.Name.trim(),
    sector: r.ListingBoard?.trim() ?? "",
  }));

  companyCache = { data: companies, expiry: Date.now() + COMPANY_CACHE_TTL_MS };
  return companies;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchIdxTickerData(
  symbol: string
): Promise<RawTickerData> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dateStr = toDateYYYYMMDD(now);

  // Fire all requests in parallel
  const [ohlcvRaw, summary, ratiosAll, industries, dailyInfo] =
    await Promise.all([
      fetchOhlcvHistory(symbol),
      fetchStockSummary(symbol, dateStr),
      fetchFinancialRatios(year, month),
      fetchIndustrySummary(year, month),
      fetchTradingInfoDaily(symbol),
    ]);

  // --- OHLCV ---
  const ohlcv = mapOhlcv(ohlcvRaw);
  if (ohlcv.length === 0) {
    throw new Error(`No OHLCV data returned for ${symbol}`);
  }

  const lastBar = ohlcv[ohlcv.length - 1];
  const lastClose = lastBar.close;

  // --- Fundamentals ---
  const ratio = ratiosAll.find(
    (r) => r.code.toUpperCase() === symbol.toUpperCase()
  );
  const sector = ratio?.sector ?? "";

  // Sector averages from industry summary
  const sectorRow = industries.find(
    (i) => i.Name.toUpperCase() === sector.toUpperCase()
  );

  // Listed shares from OHLCV or summary
  const listedShares =
    summary?.ListedShares ??
    (ohlcvRaw.length > 0 ? ohlcvRaw[0].ListedShares : 0);

  const fundamentals: RawFundamentals = {
    marketCap: Math.round(lastClose * (listedShares || 0)),
    peRatio: ratio?.per ?? 0,
    pbvRatio: ratio?.priceBV ?? 0,
    epsGrowthYoy: 0, // not available from snapshot endpoints
    revenueGrowthYoy: 0, // not available from snapshot endpoints
    roe: ratio?.roe ? ratio.roe / 100 : 0,
    debtToEquity: ratio?.deRatio ?? 0,
    dividendYield: 0, // not available from snapshot endpoints
    sectorAvgPe: sectorRow?.PER ?? 0,
    sectorAvgPbv: sectorRow?.PBV ?? 0,
  };

  // --- Flow ---
  const recent20 = ohlcv.slice(-20);
  const avgVolume20d = Math.round(
    recent20.reduce((s, b) => s + b.volume, 0) / (recent20.length || 1)
  );

  const foreignBuy = summary?.ForeignBuy ?? 0;
  const foreignSell = summary?.ForeignSell ?? 0;
  const foreignNetVol = foreignBuy - foreignSell;
  const foreignShares = (dailyInfo as { NumberForeigner?: number })
    ?.NumberForeigner ?? 0;

  const flow: RawFlow = {
    avgVolume20d,
    latestVolume: summary?.Volume ?? lastBar.volume,
    foreignNetBuyValue: Math.round(foreignNetVol * lastClose),
    foreignNetBuyVolume: foreignNetVol,
    foreignOwnershipPct:
      listedShares > 0
        ? Number((foreignShares / listedShares).toFixed(4))
        : 0,
    consecutiveForeignBuyDays: 0, // would need multi-day lookback
  };

  return {
    symbol: symbol.toUpperCase(),
    asOfDate: lastBar.date,
    ohlcv,
    fundamentals,
    flow,
    source: "idx",
  };
}
