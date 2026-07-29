"""IDX Broker Summary scraper — replaces Index Alpha API.

Scrapes per-broker buy/sell data from IDX's broker summary page.
The IDX endpoint: /primary/TradingSummary/GetBrokerSummaryByStock
returns per-broker activity for a single stock on a single date.

We iterate over each ticker × each date in the lookback window,
storing results in the broker_flows table.
"""

import logging
from datetime import date, timedelta

from .base import BaseScraper
from .idx_session import IDX_BASE

logger = logging.getLogger(__name__)

# Known foreign broker codes (mirrors lib/market-data/broker-codes.ts)
FOREIGN_BROKERS = {
    "MS", "CS", "UB", "GS", "JP", "ML", "CG", "DB", "CC", "LG",
    "RX", "AZ", "DX", "NI", "MU", "OD", "SQ", "BK", "FS", "KZ",
    "YJ", "KK", "PG", "CL", "IG", "MA", "BW", "SC", "BI", "AG",
    "LP", "PT", "SK", "NE", "FG", "IS", "HG",
}


def classify_broker(code: str) -> str:
    return "foreign" if code.upper() in FOREIGN_BROKERS else "domestic"


def trading_dates(lookback_days: int) -> list[str]:
    """Generate recent trading dates (weekdays only) as YYYYMMDD strings."""
    dates: list[str] = []
    d = date.today()
    while len(dates) < lookback_days:
        d -= timedelta(days=1)
        if d.weekday() < 5:  # Mon-Fri
            dates.append(d.strftime("%Y%m%d"))
    return list(reversed(dates))


class BrokerSummaryScraper(BaseScraper):
    """Scrapes per-broker buy/sell from IDX for each ticker."""

    name = "broker_summary"

    def __init__(self, lookback_days: int = 20) -> None:
        super().__init__()
        self.lookback_days = lookback_days

    def _fetch_broker_summary(self, symbol: str, date_str: str) -> list[dict]:
        """Fetch broker summary for a single stock on a single date.

        Returns list of broker activity dicts.
        """
        url = (
            f"{IDX_BASE}/TradingSummary/GetBrokerSummaryByStock"
            f"?stock={symbol}&date={date_str}"
        )
        data = self.idx.get_json(url)

        # IDX returns { data: [...] } or { replies: [...] } depending on endpoint
        rows = data.get("data") or data.get("replies") or []
        if not isinstance(rows, list):
            return []

        results = []
        for row in rows:
            broker_code = (row.get("BrokerCode") or row.get("broker") or "").strip()
            if not broker_code:
                continue

            results.append({
                "broker_code": broker_code.upper(),
                "broker_type": classify_broker(broker_code),
                "buy_volume": int(row.get("BuyVolume", 0) or row.get("bVol", 0) or 0),
                "buy_value": int(row.get("BuyValue", 0) or row.get("bVal", 0) or 0),
                "sell_volume": int(row.get("SellVolume", 0) or row.get("sVol", 0) or 0),
                "sell_value": int(row.get("SellValue", 0) or row.get("sVal", 0) or 0),
            })

        return results

    def _existing_dates(self, ticker_id: str) -> set[str]:
        """Get dates already in broker_flows for this ticker."""
        result = (
            self.db.table("broker_flows")
            .select("trade_date")
            .eq("ticker_id", ticker_id)
            .execute()
        )
        return {row["trade_date"] for row in (result.data or [])}

    def scrape(self, tickers: list[dict]) -> dict:
        dates = trading_dates(self.lookback_days)
        total_inserted = 0
        total_skipped = 0
        errors = 0
        consecutive_503 = 0
        MAX_CONSECUTIVE_503 = 3  # Abort if endpoint is consistently blocked

        for ticker in tickers:
            ticker_id = ticker["id"]
            symbol = ticker["symbol"]
            existing = self._existing_dates(ticker_id)

            if consecutive_503 >= MAX_CONSECUTIVE_503:
                logger.warning(
                    "Aborting broker_summary — endpoint appears blocked by Cloudflare "
                    "(%d consecutive 503s). Try again later.",
                    consecutive_503,
                )
                break

            for date_str in dates:
                if consecutive_503 >= MAX_CONSECUTIVE_503:
                    break

                # Convert YYYYMMDD to YYYY-MM-DD for comparison
                iso_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
                if iso_date in existing:
                    total_skipped += 1
                    continue

                try:
                    brokers = self._fetch_broker_summary(symbol, date_str)
                    consecutive_503 = 0  # Reset on success

                    if not brokers:
                        continue

                    rows = [
                        {
                            "ticker_id": ticker_id,
                            "trade_date": iso_date,
                            **b,
                        }
                        for b in brokers
                    ]

                    self.db.table("broker_flows").upsert(
                        rows,
                        on_conflict="ticker_id,trade_date,broker_code",
                    ).execute()

                    total_inserted += len(rows)
                    logger.debug(
                        "%s %s: %d brokers", symbol, iso_date, len(rows)
                    )

                except Exception as e:
                    errors += 1
                    if "503" in str(e):
                        consecutive_503 += 1
                    else:
                        consecutive_503 = 0
                    logger.warning(
                        "Failed %s %s: %s", symbol, date_str, e
                    )

        return {
            "inserted": total_inserted,
            "skipped_dates": total_skipped,
            "errors": errors,
            "aborted_503": consecutive_503 >= MAX_CONSECUTIVE_503,
        }
