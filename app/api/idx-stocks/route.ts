import { NextResponse } from "next/server";

type YahooQuote = {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange: string;
  sector?: string;
  industry?: string;
  quoteType: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      q
    )}&quotesCount=20&newsCount=0`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Yahoo Finance ${res.status}`);
    }

    const json = await res.json();
    const quotes: YahooQuote[] = json.quotes ?? [];

    // Only keep IDX (Jakarta) equities
    const idx = quotes
      .filter(
        (q) =>
          q.exchange === "JKT" && q.quoteType === "EQUITY"
      )
      .map((q) => ({
        code: q.symbol.replace(/\.JK$/, ""),
        name: q.longname ?? q.shortname ?? q.symbol,
        sector: q.sector ?? "",
      }));

    return NextResponse.json(idx);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 502 }
    );
  }
}
