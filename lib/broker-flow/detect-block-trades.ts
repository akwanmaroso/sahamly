import type { BrokerActivity } from "@/lib/market-data/types";
import { getBrokerTier } from "./broker-tiers";

export type BlockTradeSignal = {
  brokerCode: string;
  brokerName: string;
  tier: 1 | 2 | 3;
  direction: "buy" | "sell";
  avgTransactionSize: number; // IDR
  transactionCount: number;
  totalValue: number;
  isBlockTrade: boolean;
  description: string;
};

/**
 * Detect block trades from broker activity data.
 *
 * Block trades on IDX are typically >1B IDR per transaction. Since we don't
 * have individual trade data, we use average transaction size (buy_avg/sell_avg)
 * from Index Alpha as a proxy:
 *
 * - avg transaction > 500M IDR → likely institutional block trade
 * - avg transaction > 1B IDR → definite block trade territory
 * - Low frequency + high avg size → classic whale pattern (few large orders)
 *
 * We also flag: high value with low frequency (whale) vs high frequency with
 * low avg (retail swarm).
 */
export function detectBlockTrades(brokers: BrokerActivity[]): BlockTradeSignal[] {
  const signals: BlockTradeSignal[] = [];

  for (const b of brokers) {
    const tier = getBrokerTier(b.brokerCode);

    // Check buy side
    if (b.buyAvgSize && b.buyAvgSize > 500e6 && b.buyFreq) {
      signals.push({
        brokerCode: b.brokerCode,
        brokerName: tier.name,
        tier: tier.tier,
        direction: "buy",
        avgTransactionSize: b.buyAvgSize,
        transactionCount: b.buyFreq,
        totalValue: b.buyValue,
        isBlockTrade: b.buyAvgSize > 1e9,
        description: formatBlockDescription(b.brokerCode, tier.name, "buying", b.buyAvgSize, b.buyFreq, b.buyValue),
      });
    }

    // Check sell side
    if (b.sellAvgSize && b.sellAvgSize > 500e6 && b.sellFreq) {
      signals.push({
        brokerCode: b.brokerCode,
        brokerName: tier.name,
        tier: tier.tier,
        direction: "sell",
        avgTransactionSize: b.sellAvgSize,
        transactionCount: b.sellFreq,
        totalValue: b.sellValue,
        isBlockTrade: b.sellAvgSize > 1e9,
        description: formatBlockDescription(b.brokerCode, tier.name, "selling", b.sellAvgSize, b.sellFreq, b.sellValue),
      });
    }
  }

  // Sort: definite block trades first, then by total value
  signals.sort((a, b) => {
    if (a.isBlockTrade !== b.isBlockTrade) return a.isBlockTrade ? -1 : 1;
    return b.totalValue - a.totalValue;
  });

  return signals.slice(0, 10);
}

function formatBlockDescription(
  code: string,
  name: string,
  direction: string,
  avgSize: number,
  freq: number,
  totalValue: number
): string {
  const sizeStr = avgSize >= 1e9
    ? `${(avgSize / 1e9).toFixed(1)}B`
    : `${(avgSize / 1e6).toFixed(0)}M`;
  const totalStr = totalValue >= 1e9
    ? `${(totalValue / 1e9).toFixed(1)}B`
    : `${(totalValue / 1e6).toFixed(0)}M`;

  const tradeType = avgSize >= 1e9 ? "BLOCK TRADE" : "Large order";
  const pattern = freq <= 5 ? "few large orders (whale pattern)" : `${freq} transactions`;

  return `${tradeType}: ${name} (${code}) ${direction} avg ${sizeStr}/txn, ${pattern}, total ${totalStr} IDR`;
}
