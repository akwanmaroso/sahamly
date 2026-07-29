import { execFile } from "node:child_process";
import { join } from "node:path";

const SCRIPT_PATH = join(process.cwd(), "scripts", "fetch-insider-trades.py");

export type InsiderTransaction = {
  date: string;
  insider: string;
  position: string;
  transaction: string; // "Sale", "Purchase", etc.
  shares: number;
  value: number;
};

export type InsiderData = {
  transactions: InsiderTransaction[];
  holders: {
    insiderPct?: number;
    institutionPct?: number;
  };
  institutions: {
    holder: string;
    shares: number;
    pctHeld: number;
    value: number;
  }[];
  netInsiderSentiment: "buying" | "selling" | "neutral";
  recentActivityScore: number; // -100 to +100
};

/**
 * Fetch insider transaction data via yfinance.
 * Returns null on failure (graceful degradation).
 */
export async function fetchInsiderData(symbol: string): Promise<InsiderData | null> {
  try {
    const raw = await runScript(symbol);
    if (raw.error || !raw.transactions) return null;

    const rawTxns = Array.isArray(raw.transactions) ? raw.transactions : [];
    const transactions: InsiderTransaction[] = rawTxns.map(
      (t: Record<string, unknown>) => ({
        date: String(t.date ?? ""),
        insider: String(t.insider ?? "Unknown"),
        position: String(t.position ?? ""),
        transaction: String(t.transaction ?? ""),
        shares: Number(t.shares ?? 0),
        value: Number(t.value ?? 0),
      })
    );

    // Compute net insider sentiment from recent transactions
    let buyValue = 0;
    let sellValue = 0;
    for (const t of transactions) {
      const txnType = t.transaction.toLowerCase();
      if (txnType.includes("purchase") || txnType.includes("buy")) {
        buyValue += t.value;
      } else if (txnType.includes("sale") || txnType.includes("sell")) {
        sellValue += t.value;
      }
    }

    const netInsiderSentiment: InsiderData["netInsiderSentiment"] =
      buyValue > sellValue * 1.5
        ? "buying"
        : sellValue > buyValue * 1.5
          ? "selling"
          : "neutral";

    // Activity score: net buy/sell as a simple ratio
    const total = buyValue + sellValue;
    const recentActivityScore = total > 0
      ? Math.max(-100, Math.min(100, Math.round(((buyValue - sellValue) / total) * 100)))
      : 0;

    return {
      transactions,
      holders: (raw.holders as InsiderData["holders"]) ?? {},
      institutions: (Array.isArray(raw.institutions) ? raw.institutions : []).map((i: Record<string, unknown>) => ({
        holder: String(i.holder ?? ""),
        shares: Number(i.shares ?? 0),
        pctHeld: Number(i.pctHeld ?? 0),
        value: Number(i.value ?? 0),
      })),
      netInsiderSentiment,
      recentActivityScore,
    };
  } catch {
    return null;
  }
}

function runScript(symbol: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    execFile(
      "python3",
      [SCRIPT_PATH, symbol],
      { timeout: 15_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`insider script failed: ${stderr || error.message}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`Failed to parse insider output: ${stdout.slice(0, 200)}`));
        }
      }
    );
  });
}
