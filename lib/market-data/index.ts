import { fetchMockTickerData } from "./mock";
import type { RawTickerData } from "./types";

export type { OhlcvBar, RawFlow, RawFundamentals, RawTickerData } from "./types";

/**
 * Fetches raw OHLCV + fundamental + flow data for a ticker symbol.
 *
 * This is the single point to swap when a real IDX data source is chosen —
 * replace the body with a real API/scraper call that resolves to the same
 * `RawTickerData` shape. Every caller (indicator computation, snapshot
 * storage) only depends on this function's signature, not on how the data
 * is sourced.
 */
export async function fetchTickerData(symbol: string): Promise<RawTickerData> {
  return fetchMockTickerData(symbol);
}
