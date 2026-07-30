import { fetchIdxTickerData, IdxUnavailableError } from "./idx";
import { fetchYahooTickerData } from "./yahoo";
import type { RawTickerData } from "./types";

export type { OhlcvBar, RawFlow, RawFundamentals, RawTickerData } from "./types";

/**
 * Fetches raw OHLCV + fundamental + flow data for a ticker symbol.
 *
 * Prefers the official IDX endpoints. If IDX is blocking or unreachable,
 * falls back to Yahoo Finance — which covers price and fundamentals but not
 * same-day foreign buy/sell, so `source` becomes "yahoo" and the foreign
 * flow fields are zeroed. Broker/whale metrics are computed separately from
 * the scraped tables and are unaffected.
 *
 * Throws if both sources fail — callers must handle the error.
 */
export async function fetchTickerData(symbol: string): Promise<RawTickerData> {
  try {
    return await fetchIdxTickerData(symbol);
  } catch (err) {
    if (!(err instanceof IdxUnavailableError)) throw err;

    console.warn(
      `[market-data] IDX unavailable for ${symbol}, falling back to Yahoo: ${err.message}`
    );
    return fetchYahooTickerData(symbol);
  }
}
