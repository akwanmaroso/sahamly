import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrokerTier, isWhaleBroker } from "./broker-tiers";

export type BrokerRotation = {
  brokerCode: string;
  brokerName: string;
  tier: 1 | 2 | 3;
  selling: { symbol: string; netValue: number }[];
  buying: { symbol: string; netValue: number }[];
  totalSold: number;
  totalBought: number;
  isRotation: boolean; // true if selling one and buying another
  description: string;
};

export type CrossStockCorrelation = {
  rotations: BrokerRotation[];
  coordinatedMoves: {
    direction: "buying" | "selling";
    symbols: string[];
    brokers: string[];
    description: string;
  }[];
};

/**
 * Detect cross-stock broker flow patterns across the watchlist.
 *
 * Finds:
 * 1. Broker rotation: same broker selling stock A and buying stock B
 * 2. Coordinated moves: multiple whale brokers buying/selling the same stocks
 *
 * This reveals *who* is rotating and where capital is flowing,
 * not just aggregate sector-level rotation.
 */
export async function detectCrossStockCorrelation(
  supabase: SupabaseClient,
  lookbackDays = 10
): Promise<CrossStockCorrelation> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.ceil(lookbackDays * 1.5));

  // Fetch all broker flows across all tickers in the watchlist
  const { data: rows, error } = await supabase
    .from("broker_flows")
    .select("ticker_id, trade_date, broker_code, buy_value, sell_value, net_value")
    .neq("broker_code", "___FOREIGN_NET")
    .gte("trade_date", cutoff.toISOString().slice(0, 10))
    .order("trade_date", { ascending: true });

  if (error || !rows || rows.length === 0) {
    return { rotations: [], coordinatedMoves: [] };
  }

  // Get ticker symbols for display
  const tickerIds = [...new Set(rows.map((r) => r.ticker_id))];
  const { data: tickers } = await supabase
    .from("tickers")
    .select("id, symbol")
    .in("id", tickerIds);

  const tickerMap = new Map<string, string>();
  for (const t of tickers ?? []) {
    tickerMap.set(t.id, t.symbol);
  }

  // Aggregate net flow per broker per ticker
  const brokerTickerFlow = new Map<string, Map<string, number>>(); // broker → ticker → net

  for (const r of rows) {
    const symbol = tickerMap.get(r.ticker_id);
    if (!symbol) continue;

    if (!brokerTickerFlow.has(r.broker_code)) {
      brokerTickerFlow.set(r.broker_code, new Map());
    }
    const tickerFlows = brokerTickerFlow.get(r.broker_code)!;
    tickerFlows.set(symbol, (tickerFlows.get(symbol) ?? 0) + r.net_value);
  }

  // --- 1. Detect broker rotations ---
  const rotations: BrokerRotation[] = [];

  for (const [broker, tickerFlows] of brokerTickerFlow) {
    // Only track whale/institutional brokers
    if (!isWhaleBroker(broker) && getBrokerTier(broker).tier > 2) continue;

    const tier = getBrokerTier(broker);
    const selling: { symbol: string; netValue: number }[] = [];
    const buying: { symbol: string; netValue: number }[] = [];

    for (const [symbol, net] of tickerFlows) {
      // Only count significant activity (> 100M IDR)
      if (Math.abs(net) < 100e6) continue;
      if (net > 0) buying.push({ symbol, netValue: net });
      else selling.push({ symbol, netValue: net });
    }

    // Rotation = selling at least one and buying at least one
    if (selling.length > 0 && buying.length > 0) {
      const totalSold = selling.reduce((s, v) => s + Math.abs(v.netValue), 0);
      const totalBought = buying.reduce((s, v) => s + v.netValue, 0);

      const sellStr = selling.map((s) => `${s.symbol} (${formatValue(s.netValue)})`).join(", ");
      const buyStr = buying.map((b) => `${b.symbol} (${formatValue(b.netValue)})`).join(", ");

      rotations.push({
        brokerCode: broker,
        brokerName: tier.name,
        tier: tier.tier,
        selling,
        buying,
        totalSold,
        totalBought,
        isRotation: true,
        description: `${tier.name} (${broker}) rotating: selling ${sellStr} → buying ${buyStr}`,
      });
    }
  }

  // Sort by total volume moved
  rotations.sort((a, b) => (b.totalSold + b.totalBought) - (a.totalSold + a.totalBought));

  // --- 2. Detect coordinated moves ---
  // Find symbols where multiple whales are on the same side
  const symbolWhaleBuyers = new Map<string, string[]>();
  const symbolWhaleSellers = new Map<string, string[]>();

  for (const [broker, tickerFlows] of brokerTickerFlow) {
    if (!isWhaleBroker(broker)) continue;

    for (const [symbol, net] of tickerFlows) {
      if (net > 100e6) {
        if (!symbolWhaleBuyers.has(symbol)) symbolWhaleBuyers.set(symbol, []);
        symbolWhaleBuyers.get(symbol)!.push(broker);
      } else if (net < -100e6) {
        if (!symbolWhaleSellers.has(symbol)) symbolWhaleSellers.set(symbol, []);
        symbolWhaleSellers.get(symbol)!.push(broker);
      }
    }
  }

  const coordinatedMoves: CrossStockCorrelation["coordinatedMoves"] = [];

  // Coordinated buying: 2+ whales buying the same stock
  for (const [symbol, brokers] of symbolWhaleBuyers) {
    if (brokers.length >= 2) {
      const names = brokers.map((b) => `${getBrokerTier(b).name} (${b})`).join(", ");
      coordinatedMoves.push({
        direction: "buying",
        symbols: [symbol],
        brokers,
        description: `${brokers.length} whale brokers buying ${symbol}: ${names}`,
      });
    }
  }

  // Coordinated selling: 2+ whales selling the same stock
  for (const [symbol, brokers] of symbolWhaleSellers) {
    if (brokers.length >= 2) {
      const names = brokers.map((b) => `${getBrokerTier(b).name} (${b})`).join(", ");
      coordinatedMoves.push({
        direction: "selling",
        symbols: [symbol],
        brokers,
        description: `${brokers.length} whale brokers selling ${symbol}: ${names}`,
      });
    }
  }

  return {
    rotations: rotations.slice(0, 10),
    coordinatedMoves: coordinatedMoves.slice(0, 10),
  };
}

function formatValue(v: number): string {
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${abs.toLocaleString("en-US")}`;
}
