"""IDX Foreign Flow scraper — daily foreign net buy/sell per stock.

Scrapes from IDX's stock summary endpoint which contains ForeignBuy/ForeignSell
for each stock on a given date. This replaces the Index Alpha foreign-flow API.

Data is stored in a foreign_daily_flow table for historical trend analysis.
"""

import logging
from datetime import date, timedelta

from .base import BaseScraper
from .idx_session import IDX_BASE

logger = logging.getLogger(__name__)


def trading_dates(lookback_days: int) -> list[str]:
    """Generate recent weekday dates as YYYYMMDD strings."""
    dates: list[str] = []
    d = date.today()
    while len(dates) < lookback_days:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            dates.append(d.strftime("%Y%m%d"))
    return list(reversed(dates))


class ForeignFlowScraper(BaseScraper):
    """Scrapes daily foreign buy/sell from IDX stock summary."""

    name = "foreign_flow"

    def __init__(self, lookback_days: int = 20) -> None:
        super().__init__()
        self.lookback_days = lookback_days

    def _fetch_stock_summary(self, date_str: str) -> list[dict]:
        """Fetch stock summary for all stocks on a date.

        Returns the full list — we filter to our tickers afterward.
        """
        url = f"{IDX_BASE}/TradingSummary/GetStockSummary?date={date_str}"
        data = self.idx.get_json(url)
        rows = data.get("data") or []
        return rows if isinstance(rows, list) else []

    def _existing_dates(self, ticker_id: str) -> set[str]:
        result = (
            self.db.table("foreign_daily_flow")
            .select("trade_date")
            .eq("ticker_id", ticker_id)
            .execute()
        )
        return {row["trade_date"] for row in (result.data or [])}

    def scrape(self, tickers: list[dict]) -> dict:
        dates = trading_dates(self.lookback_days)
        symbol_to_id = {t["symbol"].upper(): t["id"] for t in tickers}
        total_inserted = 0
        total_skipped = 0
        errors = 0

        # Collect existing dates per ticker
        existing_by_ticker: dict[str, set[str]] = {}
        for ticker in tickers:
            existing_by_ticker[ticker["id"]] = self._existing_dates(ticker["id"])

        for date_str in dates:
            iso_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"

            # Check if all tickers already have this date
            all_exist = all(
                iso_date in existing_by_ticker.get(t["id"], set())
                for t in tickers
            )
            if all_exist:
                total_skipped += 1
                continue

            try:
                summary = self._fetch_stock_summary(date_str)

                rows_to_upsert = []
                for row in summary:
                    code = (row.get("StockCode") or "").strip().upper()
                    ticker_id = symbol_to_id.get(code)
                    if not ticker_id:
                        continue
                    if iso_date in existing_by_ticker.get(ticker_id, set()):
                        continue

                    close_price = float(row.get("Close", 0) or 0)
                    foreign_buy = int(row.get("ForeignBuy", 0) or 0)
                    foreign_sell = int(row.get("ForeignSell", 0) or 0)
                    net_foreign_vol = foreign_buy - foreign_sell
                    net_foreign_val = round(net_foreign_vol * close_price)

                    rows_to_upsert.append({
                        "ticker_id": ticker_id,
                        "trade_date": iso_date,
                        "foreign_buy_volume": foreign_buy,
                        "foreign_sell_volume": foreign_sell,
                        # net_foreign_volume is a generated column — don't insert it
                        "net_foreign_value": net_foreign_val,
                        "close_price": close_price,
                    })

                if rows_to_upsert:
                    self.db.table("foreign_daily_flow").upsert(
                        rows_to_upsert,
                        on_conflict="ticker_id,trade_date",
                    ).execute()
                    total_inserted += len(rows_to_upsert)

                logger.debug("%s: %d tickers", iso_date, len(rows_to_upsert))

            except Exception as e:
                errors += 1
                logger.warning("Failed date %s: %s", date_str, e)

        return {
            "inserted": total_inserted,
            "skipped_dates": total_skipped,
            "errors": errors,
        }
