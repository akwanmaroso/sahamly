#!/usr/bin/env python3
"""Fetch insider transaction data for an IDX stock via yfinance.

Usage: python3 fetch-insider-trades.py BBRI
Output: JSON with insider transactions to stdout.

Note: yfinance insider data for IDX stocks may be limited.
This serves as a foundation — can be extended with IDX scraping later.
"""

import json
import sys


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: fetch-insider-trades.py SYMBOL"}))
        sys.exit(1)

    symbol = sys.argv[1].upper().strip()
    yf_symbol = symbol if symbol.endswith(".JK") else f"{symbol}.JK"

    try:
        import yfinance as yf
    except ImportError:
        print(json.dumps({"error": "yfinance not installed"}))
        sys.exit(1)

    try:
        ticker = yf.Ticker(yf_symbol)

        # Get insider transactions
        transactions = []
        try:
            insider_txns = ticker.insider_transactions
            if insider_txns is not None and not insider_txns.empty:
                for _, row in insider_txns.iterrows():
                    txn = {
                        "date": str(row.get("Start Date", row.get("startDate", ""))),
                        "insider": str(row.get("Insider", row.get("insider", "Unknown"))),
                        "position": str(row.get("Position", row.get("position", ""))),
                        "transaction": str(row.get("Transaction", row.get("transaction", ""))),
                        "shares": int(row.get("Shares", row.get("shares", 0)) or 0),
                        "value": float(row.get("Value", row.get("value", 0)) or 0),
                    }
                    transactions.append(txn)
        except Exception:
            pass

        # Get major holders
        holders = {}
        try:
            major = ticker.major_holders
            if major is not None and not major.empty:
                holders = {
                    "insiderPct": float(major.iloc[0, 0]) if len(major) > 0 else None,
                    "institutionPct": float(major.iloc[1, 0]) if len(major) > 1 else None,
                }
        except Exception:
            pass

        # Get institutional holders
        institutions = []
        try:
            inst = ticker.institutional_holders
            if inst is not None and not inst.empty:
                for _, row in inst.head(10).iterrows():
                    institutions.append({
                        "holder": str(row.get("Holder", "")),
                        "shares": int(row.get("Shares", 0) or 0),
                        "pctHeld": float(row.get("% Out", row.get("pctHeld", 0)) or 0),
                        "value": float(row.get("Value", 0) or 0),
                    })
        except Exception:
            pass

        result = {
            "symbol": symbol,
            "transactions": transactions,
            "holders": holders,
            "institutions": institutions,
        }

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
