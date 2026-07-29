"""IDX Running Trades (RTI) scraper — individual trade data for block trade detection.

Scrapes from IDX's RTI endpoint which shows individual trades with buyer/seller
broker codes. This enables real block trade detection (single trades >500M IDR)
instead of estimating from averages.

Data is stored in the running_trades table.
"""

import logging
from datetime import date, timedelta

from .base import BaseScraper
from .idx_session import IDX_BASE
from .broker_summary import classify_broker

logger = logging.getLogger(__name__)


class RunningTradesScraper(BaseScraper):
    """Scrapes individual trade records (RTI) from IDX."""

    name = "running_trades"

    def __init__(self, lookback_days: int = 5) -> None:
        super().__init__()
        self.lookback_days = lookback_days

    def _fetch_running_trades(self, symbol: str, date_str: str) -> list[dict]:
        """Fetch running trade data for a stock on a date."""
        url = (
            f"{IDX_BASE}/TradingSummary/GetRunningTrade"
            f"?stock={symbol}&date={date_str}"
        )
        data = self.idx.get_json(url)
        rows = data.get("data") or data.get("replies") or []
        return rows if isinstance(rows, list) else []

    def _existing_dates(self, ticker_id: str) -> set[str]:
        result = (
            self.db.table("running_trades")
            .select("trade_date")
            .eq("ticker_id", ticker_id)
            .limit(100)
            .execute()
        )
        return {row["trade_date"] for row in (result.data or [])}

    def scrape(self, tickers: list[dict]) -> dict:
        total_inserted = 0
        total_skipped = 0
        errors = 0

        d = date.today()
        dates: list[str] = []
        while len(dates) < self.lookback_days:
            d -= timedelta(days=1)
            if d.weekday() < 5:
                dates.append(d.strftime("%Y%m%d"))
        dates.reverse()

        consecutive_503 = 0
        MAX_CONSECUTIVE_503 = 3

        for ticker in tickers:
            ticker_id = ticker["id"]
            symbol = ticker["symbol"]
            existing = self._existing_dates(ticker_id)

            if consecutive_503 >= MAX_CONSECUTIVE_503:
                logger.warning(
                    "Aborting running_trades — endpoint blocked (%d consecutive 503s).",
                    consecutive_503,
                )
                break

            for date_str in dates:
                if consecutive_503 >= MAX_CONSECUTIVE_503:
                    break

                iso_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
                if iso_date in existing:
                    total_skipped += 1
                    continue

                try:
                    trades = self._fetch_running_trades(symbol, date_str)
                    consecutive_503 = 0

                    if not trades:
                        continue

                    rows = []
                    for t in trades:
                        price = float(t.get("Price", 0) or t.get("price", 0) or 0)
                        volume = int(t.get("Volume", 0) or t.get("volume", 0) or 0)
                        value = round(price * volume)
                        buyer = (t.get("BuyerBroker") or t.get("buyer") or "").strip().upper()
                        seller = (t.get("SellerBroker") or t.get("seller") or "").strip().upper()

                        if not buyer or not seller:
                            continue

                        rows.append({
                            "ticker_id": ticker_id,
                            "trade_date": iso_date,
                            "trade_time": str(t.get("Time") or t.get("time") or ""),
                            "price": price,
                            "volume": volume,
                            "value": value,
                            "buyer_broker": buyer,
                            "buyer_type": classify_broker(buyer),
                            "seller_broker": seller,
                            "seller_type": classify_broker(seller),
                            "is_block_trade": value >= 500_000_000,
                        })

                    if rows:
                        self.db.table("running_trades").upsert(
                            rows,
                            on_conflict="ticker_id,trade_date,trade_time,buyer_broker,seller_broker",
                        ).execute()
                        total_inserted += len(rows)

                    logger.debug("%s %s: %d trades", symbol, iso_date, len(rows))

                except Exception as e:
                    errors += 1
                    if "503" in str(e):
                        consecutive_503 += 1
                    else:
                        consecutive_503 = 0
                    logger.warning("Failed %s %s: %s", symbol, date_str, e)

        return {
            "inserted": total_inserted,
            "skipped_dates": total_skipped,
            "errors": errors,
            "aborted_503": consecutive_503 >= MAX_CONSECUTIVE_503,
        }
