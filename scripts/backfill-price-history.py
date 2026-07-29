#!/usr/bin/env python3
"""Fetch 2 years of daily OHLCV for an IDX stock via yfinance.

Usage: python3 backfill-price-history.py BBRI [PERIOD]
Output: JSON array of { date, open, high, low, close, volume } to stdout.

PERIOD defaults to "2y" (2 years). Other values: "1y", "5y", "max".
"""

import json
import sys


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: backfill-price-history.py SYMBOL [PERIOD]"}))
        sys.exit(1)

    symbol = sys.argv[1].upper().strip()
    period = sys.argv[2] if len(sys.argv) > 2 else "2y"
    yf_symbol = symbol if symbol.endswith(".JK") else f"{symbol}.JK"

    try:
        import yfinance as yf
    except ImportError:
        print(json.dumps({"error": "yfinance not installed. Run: pip install yfinance"}))
        sys.exit(1)

    try:
        ticker = yf.Ticker(yf_symbol)
        df = ticker.history(period=period, interval="1d")

        if df.empty:
            print(json.dumps({"error": f"No history for {yf_symbol}"}))
            sys.exit(1)

        rows = []
        for date_idx, row in df.iterrows():
            rows.append({
                "date": date_idx.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            })

        print(json.dumps(rows))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
