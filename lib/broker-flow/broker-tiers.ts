/**
 * Smart Money Broker Classification for IDX.
 *
 * Not all brokers are equal — institutional "whale" brokers move markets,
 * while retail-heavy brokers represent crowd sentiment. This classification
 * lets us weight broker activity by its likely origin (smart money vs retail).
 *
 * Tier 1 (Institutional Whale): Global investment banks with prop desks and
 *   large institutional client bases. Their flow often front-runs or drives moves.
 * Tier 2 (Institutional): Major regional brokers with significant institutional
 *   flow but also some retail. Mixed signal quality.
 * Tier 3 (Retail-Heavy): Domestic brokers dominated by retail traders.
 *   High volume but often contrarian indicator (retail buys tops, sells bottoms).
 */

export type BrokerTier = {
  tier: 1 | 2 | 3;
  label: "whale" | "institutional" | "retail";
  /** Weight multiplier for scoring: whale activity counts more. */
  weight: number;
  name: string;
};

/**
 * IDX broker classification map.
 * Codes not in this map default to tier 3 (retail/unknown).
 */
const BROKER_TIER_MAP: Record<string, BrokerTier> = {
  // ─── Tier 1: Institutional Whales (weight 2.5×) ───
  CS: { tier: 1, label: "whale", weight: 2.5, name: "Credit Suisse / UBS" },
  UB: { tier: 1, label: "whale", weight: 2.5, name: "UBS" },
  GS: { tier: 1, label: "whale", weight: 2.5, name: "Goldman Sachs" },
  JP: { tier: 1, label: "whale", weight: 2.5, name: "JP Morgan" },
  ML: { tier: 1, label: "whale", weight: 2.5, name: "Merrill Lynch / BofA" },
  CG: { tier: 1, label: "whale", weight: 2.5, name: "Citigroup" },
  MS: { tier: 1, label: "whale", weight: 2.5, name: "Morgan Stanley" },
  DB: { tier: 1, label: "whale", weight: 2.5, name: "Deutsche Bank" },
  CC: { tier: 1, label: "whale", weight: 2.5, name: "CLSA" },
  LG: { tier: 1, label: "whale", weight: 2.5, name: "HSBC" },

  // ─── Tier 2: Institutional (weight 1.5×) ───
  RX: { tier: 2, label: "institutional", weight: 1.5, name: "Macquarie" },
  AZ: { tier: 2, label: "institutional", weight: 1.5, name: "ABN AMRO / RBS" },
  DX: { tier: 2, label: "institutional", weight: 1.5, name: "Daiwa" },
  NI: { tier: 2, label: "institutional", weight: 1.5, name: "Nomura" },
  MU: { tier: 2, label: "institutional", weight: 1.5, name: "Mitsubishi UFJ" },
  OD: { tier: 2, label: "institutional", weight: 1.5, name: "Standard Chartered" },
  SQ: { tier: 2, label: "institutional", weight: 1.5, name: "Société Générale" },
  BK: { tier: 2, label: "institutional", weight: 1.5, name: "BNP Paribas" },
  FS: { tier: 2, label: "institutional", weight: 1.5, name: "Maybank Kim Eng" },
  KZ: { tier: 2, label: "institutional", weight: 1.5, name: "Samsung Securities" },
  YJ: { tier: 2, label: "institutional", weight: 1.5, name: "Yuanta" },
  KK: { tier: 2, label: "institutional", weight: 1.5, name: "KGI Securities" },
  PG: { tier: 2, label: "institutional", weight: 1.5, name: "Phillip Securities" },

  // ─── Tier 3: Retail-Heavy Domestic (weight 0.5×) ───
  // These are explicitly listed so we can show names in the UI
  YP: { tier: 3, label: "retail", weight: 0.5, name: "Mirae Asset" },
  PD: { tier: 3, label: "retail", weight: 0.5, name: "CGS-CIMB (Retail)" },
  AI: { tier: 3, label: "retail", weight: 0.5, name: "Ajaib Sekuritas" },
  GR: { tier: 3, label: "retail", weight: 0.5, name: "Stockbit / Bibit" },
  EP: { tier: 3, label: "retail", weight: 0.5, name: "IPOT / Indo Premier" },
  ZP: { tier: 3, label: "retail", weight: 0.5, name: "Mandiri Sekuritas" },
  AK: { tier: 3, label: "retail", weight: 0.5, name: "BCA Sekuritas" },
  IF: { tier: 3, label: "retail", weight: 0.5, name: "BNI Sekuritas" },
  TP: { tier: 3, label: "retail", weight: 0.5, name: "Bareksa" },
};

const DEFAULT_TIER: BrokerTier = {
  tier: 3,
  label: "retail",
  weight: 0.7, // unknown brokers get slightly more credit than known retail
  name: "Unknown",
};

/** Look up a broker's smart-money tier. */
export function getBrokerTier(code: string): BrokerTier {
  return BROKER_TIER_MAP[code.toUpperCase()] ?? DEFAULT_TIER;
}

/** Get human-readable broker name. */
export function getBrokerName(code: string): string {
  return BROKER_TIER_MAP[code.toUpperCase()]?.name ?? code;
}

/** Check if a broker is a known institutional whale. */
export function isWhaleBroker(code: string): boolean {
  return getBrokerTier(code).tier === 1;
}

/**
 * Compute a "smart money score" from broker activity.
 * Weights each broker's net value by their tier weight.
 * Returns a score where whale activity dominates.
 */
export function computeSmartMoneyScore(
  brokers: { brokerCode: string; netValue: number }[]
): {
  smartMoneyScore: number; // -100 to +100
  whaleNetFlow: number; // absolute IDR net from tier-1 brokers
  retailNetFlow: number; // absolute IDR net from tier-3 brokers
  smartVsRetail: "aligned" | "divergent" | "neutral";
  topWhaleActivity: { code: string; name: string; netValue: number }[];
} {
  let weightedSum = 0;
  let totalWeight = 0;
  let whaleNetFlow = 0;
  let retailNetFlow = 0;

  for (const b of brokers) {
    const tier = getBrokerTier(b.brokerCode);
    weightedSum += b.netValue * tier.weight;
    totalWeight += Math.abs(b.netValue) * tier.weight;

    if (tier.tier === 1) whaleNetFlow += b.netValue;
    else if (tier.tier === 3) retailNetFlow += b.netValue;
  }

  const smartMoneyScore = totalWeight > 0
    ? Math.max(-100, Math.min(100, Math.round((weightedSum / totalWeight) * 100)))
    : 0;

  // Determine if smart money and retail are aligned or divergent
  let smartVsRetail: "aligned" | "divergent" | "neutral" = "neutral";
  if (Math.abs(whaleNetFlow) > 0 && Math.abs(retailNetFlow) > 0) {
    if (Math.sign(whaleNetFlow) === Math.sign(retailNetFlow)) {
      smartVsRetail = "aligned";
    } else {
      smartVsRetail = "divergent"; // This is the most interesting signal
    }
  }

  // Top whale brokers by activity
  const topWhaleActivity = brokers
    .filter((b) => getBrokerTier(b.brokerCode).tier === 1)
    .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue))
    .slice(0, 5)
    .map((b) => ({
      code: b.brokerCode,
      name: getBrokerName(b.brokerCode),
      netValue: b.netValue,
    }));

  return {
    smartMoneyScore,
    whaleNetFlow,
    retailNetFlow,
    smartVsRetail,
    topWhaleActivity,
  };
}
