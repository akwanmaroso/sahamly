#!/usr/bin/env python3
"""Fetch fundamental data for an IDX stock via yfinance.

Usage: python3 fetch-fundamentals.py BBRI
Output: JSON to stdout with the fields our pipeline needs.

Requires: pip install yfinance
"""

import json
import sys

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: fetch-fundamentals.py SYMBOL"}))
        sys.exit(1)

    symbol = sys.argv[1].upper().strip()
    # Append .JK for IDX stocks if not already present
    yf_symbol = symbol if symbol.endswith(".JK") else f"{symbol}.JK"

    try:
        import yfinance as yf
    except ImportError:
        print(json.dumps({"error": "yfinance not installed. Run: pip install yfinance"}))
        sys.exit(1)

    try:
        t = yf.Ticker(yf_symbol)
        info = t.info

        if not info or info.get("quoteType") is None:
            print(json.dumps({"error": f"No data found for {yf_symbol}"}))
            sys.exit(1)

        result = {
            "symbol": symbol,
            "trailingPE": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "priceToBook": info.get("priceToBook"),
            "returnOnEquity": info.get("returnOnEquity"),
            "debtToEquity": info.get("debtToEquity"),
            "dividendYield": info.get("trailingAnnualDividendYield"),
            "trailingEps": info.get("trailingEps"),
            "revenueGrowth": info.get("revenueGrowth"),
            "earningsGrowth": info.get("earningsGrowth"),
            "marketCap": info.get("marketCap"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "profitMargins": info.get("profitMargins"),
            "operatingMargins": info.get("operatingMargins"),
        }

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
