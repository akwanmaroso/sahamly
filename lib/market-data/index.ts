import { fetchIdxTickerData } from "./idx";
import type { RawTickerData } from "./types";

export type { OhlcvBar, RawFlow, RawFundamentals, RawTickerData } from "./types";

/**
 * Fetches raw OHLCV + fundamental + flow data for a ticker symbol
 * from the official IDX website endpoints.
 *
 * Throws on failure — callers must handle the error (e.g. show it in the UI).
 */
export async function fetchTickerData(symbol: string): Promise<RawTickerData> {
  return fetchIdxTickerData(symbol);
}
