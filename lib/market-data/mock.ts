import type { OhlcvBar, RawFlow, RawFundamentals, RawTickerData } from "./types";

/** Deterministic PRNG (mulberry32) so a symbol always produces the same mock history. */
function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return hash;
}

/** Standard-normal sample via Box-Muller, using a shared PRNG for determinism. */
function randomNormal(random: () => number): number {
  const u = Math.max(random(), 1e-9);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function generateOhlcv(
  random: () => number,
  asOfDate: Date,
  days: number
): OhlcvBar[] {
  const bars: OhlcvBar[] = [];

  const startPrice = 400 + random() * 9600; // typical IDX price range, in IDR
  const dailyDrift = (random() - 0.45) * 0.001; // slight bias, can be positive or negative
  const dailyVolatility = 0.012 + random() * 0.018; // ~1.2%-3% daily vol
  const baseVolume = 800_000 + random() * 40_000_000;

  let price = startPrice;
  const cursor = new Date(asOfDate);
  const collected: Date[] = [];

  while (collected.length < days) {
    if (!isWeekend(cursor)) {
      collected.unshift(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  for (const date of collected) {
    const change = dailyDrift + dailyVolatility * randomNormal(random);
    const open = price;
    price = Math.max(price * (1 + change), 10);
    const close = price;

    const intraRange = Math.abs(close - open) + open * dailyVolatility * random();
    const high = Math.max(open, close) + intraRange * random() * 0.6;
    const low = Math.max(Math.min(open, close) - intraRange * random() * 0.6, 1);

    const isSpike = random() > 0.94;
    const volume = Math.round(
      baseVolume * (0.5 + random()) * (isSpike ? 2 + random() * 3 : 1)
    );

    bars.push({
      date: date.toISOString().slice(0, 10),
      open: Math.round(open),
      high: Math.round(high),
      low: Math.round(low),
      close: Math.round(close),
      volume,
    });
  }

  return bars;
}

function generateFundamentals(
  random: () => number,
  lastClose: number
): RawFundamentals {
  const peRatio = 4 + random() * 26;
  const pbvRatio = 0.4 + random() * 4.6;
  const sharesOutstanding = 400_000_000 + random() * 19_000_000_000;

  return {
    marketCap: Math.round(lastClose * sharesOutstanding),
    peRatio: Number(peRatio.toFixed(1)),
    pbvRatio: Number(pbvRatio.toFixed(2)),
    epsGrowthYoy: Number(((random() - 0.35) * 0.6).toFixed(3)),
    revenueGrowthYoy: Number(((random() - 0.3) * 0.4).toFixed(3)),
    roe: Number((0.02 + random() * 0.23).toFixed(3)),
    debtToEquity: Number((0.2 + random() * 2.3).toFixed(2)),
    dividendYield: Number((random() * 0.08).toFixed(3)),
    sectorAvgPe: Number((peRatio * (0.75 + random() * 0.5)).toFixed(1)),
    sectorAvgPbv: Number((pbvRatio * (0.75 + random() * 0.5)).toFixed(2)),
  };
}

function generateFlow(random: () => number, ohlcv: OhlcvBar[]): RawFlow {
  const recent = ohlcv.slice(-20);
  const avgVolume20d = Math.round(
    recent.reduce((sum, bar) => sum + bar.volume, 0) / recent.length
  );
  const latestVolume = ohlcv[ohlcv.length - 1]?.volume ?? avgVolume20d;

  const netBuyBias = random() - 0.5; // which side foreign flow leans this period
  const foreignNetBuyVolume = Math.round(netBuyBias * avgVolume20d * 0.3 * random() * 2);
  const avgPrice =
    recent.reduce((sum, bar) => sum + bar.close, 0) / recent.length;

  return {
    avgVolume20d,
    latestVolume,
    foreignNetBuyValue: Math.round(foreignNetBuyVolume * avgPrice),
    foreignNetBuyVolume,
    foreignOwnershipPct: Number((0.03 + random() * 0.37).toFixed(3)),
    consecutiveForeignBuyDays:
      netBuyBias > 0 ? Math.round(random() * 10) : Math.round(random() * 2),
  };
}

/**
 * Generates realistic-shaped mock market data for a ticker. Deterministic per
 * symbol + as-of date so repeated fetches within the same day are stable.
 */
export function fetchMockTickerData(symbol: string, asOfDate = new Date()): RawTickerData {
  const seed = hashString(`${symbol}:${asOfDate.toISOString().slice(0, 10)}`);
  const random = mulberry32(seed);

  const ohlcv = generateOhlcv(random, asOfDate, 250);
  const lastClose = ohlcv[ohlcv.length - 1].close;

  return {
    symbol,
    asOfDate: asOfDate.toISOString().slice(0, 10),
    ohlcv,
    fundamentals: generateFundamentals(random, lastClose),
    flow: generateFlow(random, ohlcv),
    source: "mock",
  };
}
