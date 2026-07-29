"""IDX Insider Transaction scraper — replaces yfinance insider data.

Scrapes insider/related party transactions from IDX's disclosure pages.
Also fetches major shareholders data.

Falls back gracefully if the endpoint structure changes.
"""

import logging
from datetime import date

from .base import BaseScraper
from .idx_session import IDX_BASE

logger = logging.getLogger(__name__)


class InsiderScraper(BaseScraper):
    """Scrapes insider transactions and major shareholders from IDX."""

    name = "insider"

    def _fetch_insider_transactions(self, symbol: str) -> list[dict]:
        """Fetch insider/related-party transactions from IDX disclosure."""
        url = (
            f"{IDX_BASE}/ListedCompany/GetInsiderTrading"
            f"?KodeEmiten={symbol}&start=0&length=50"
        )
        try:
            data = self.idx.get_json(url)
            return data.get("data") or data.get("replies") or []
        except Exception:
            return []

    def _fetch_shareholders(self, symbol: str) -> list[dict]:
        """Fetch major shareholders from company profile."""
        url = (
            f"{IDX_BASE}/ListedCompany/GetShareHolder"
            f"?KodeEmiten={symbol}"
        )
        try:
            data = self.idx.get_json(url)
            rows = data.get("data") or data.get("replies") or []
            return rows if isinstance(rows, list) else []
        except Exception:
            return []

    def scrape(self, tickers: list[dict]) -> dict:
        updated = 0
        errors = 0
        today = date.today().isoformat()

        for ticker in tickers:
            ticker_id = ticker["id"]
            symbol = ticker["symbol"].upper()

            try:
                raw_txns = self._fetch_insider_transactions(symbol)
                raw_holders = self._fetch_shareholders(symbol)

                # Normalize transactions
                transactions = []
                buy_value = 0.0
                sell_value = 0.0

                for t in raw_txns:
                    txn_type = str(t.get("TransactionType") or t.get("type") or "").lower()
                    shares = abs(int(t.get("Volume") or t.get("shares") or 0))
                    price = float(t.get("Price") or t.get("price") or 0)
                    value = shares * price

                    is_buy = "purchase" in txn_type or "buy" in txn_type or "acquisition" in txn_type
                    is_sell = "sale" in txn_type or "sell" in txn_type or "disposal" in txn_type

                    if is_buy:
                        buy_value += value
                    elif is_sell:
                        sell_value += value

                    transactions.append({
                        "date": str(t.get("TransactionDate") or t.get("date") or ""),
                        "insider": str(t.get("InsiderName") or t.get("name") or "Unknown"),
                        "position": str(t.get("Position") or t.get("position") or ""),
                        "transaction": txn_type,
                        "shares": shares,
                        "value": value,
                    })

                # Compute sentiment
                total = buy_value + sell_value
                if buy_value > sell_value * 1.5:
                    sentiment = "buying"
                elif sell_value > buy_value * 1.5:
                    sentiment = "selling"
                else:
                    sentiment = "neutral"

                activity_score = (
                    max(-100, min(100, round(((buy_value - sell_value) / total) * 100)))
                    if total > 0
                    else 0
                )

                # Normalize shareholders
                holders = []
                for h in raw_holders:
                    holders.append({
                        "name": str(h.get("ShareHolderName") or h.get("name") or ""),
                        "shares": int(h.get("NumberOfShares") or h.get("shares") or 0),
                        "pct": float(h.get("Percentage") or h.get("pct") or 0),
                    })

                insider_data = {
                    "transactions": transactions[:20],  # Keep last 20
                    "holders": holders,
                    "net_sentiment": sentiment,
                    "activity_score": activity_score,
                    "scraped_at": today,
                }

                self.db.table("ticker_insider_data").upsert(
                    {"ticker_id": ticker_id, "data": insider_data},
                    on_conflict="ticker_id",
                ).execute()

                updated += 1

            except Exception as e:
                errors += 1
                logger.warning("Failed %s: %s", symbol, e)

        return {"updated": updated, "errors": errors}
