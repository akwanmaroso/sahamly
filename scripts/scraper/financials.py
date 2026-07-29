"""IDX Financial Statements scraper — replaces Yahoo Finance for fundamentals.

Fetches financial ratios, industry averages, and company profile data
from IDX's own endpoints. This eliminates the yfinance dependency for
fundamental analysis.
"""

import logging
from datetime import date

from .base import BaseScraper
from .idx_session import IDX_BASE

logger = logging.getLogger(__name__)


class FinancialsScraper(BaseScraper):
    """Scrapes financial ratios and industry data from IDX."""

    name = "financials"

    def _fetch_financial_ratios(self, year: int, month: int) -> list[dict]:
        url = (
            f"{IDX_BASE}/DigitalStatistic/GetApiDataPaginated"
            f"?urlName=LINK_FINANCIAL_DATA_RATIO"
            f"&periodYear={year}&periodMonth={month}"
            f"&periodType=monthly&isPrint=False&cumulative=false"
        )
        data = self.idx.get_json(url)
        return data.get("data") or []

    def _fetch_industry_summary(self, year: int, month: int) -> list[dict]:
        import base64
        import json

        query_obj = {
            "year": str(year),
            "month": str(month),
            "quarter": 0,
            "type": "monthly",
        }
        encoded = base64.b64encode(json.dumps(query_obj).encode()).decode()

        url = (
            f"{IDX_BASE}/DigitalStatistic/GetApiData"
            f"?urlName=LINK_LIST_TRADING_SUMMARY_INDUSTRY_CLASSIFICATION"
            f"&query={encoded}&isPrint=False&cumulative=false"
        )
        data = self.idx.get_json(url)
        return data.get("data") or []

    def _fetch_company_profile(self, symbol: str) -> dict | None:
        """Fetch company profile (sector, sub-sector, listing date, etc.)."""
        url = (
            f"{IDX_BASE}/ListedCompany/GetCompanyProfilesDetail"
            f"?KodeEmiten={symbol}"
        )
        try:
            data = self.idx.get_json(url)
            return data if isinstance(data, dict) else None
        except Exception:
            return None

    def scrape(self, tickers: list[dict]) -> dict:
        now = date.today()
        year = now.year
        month = now.month

        # Fetch all ratios and industry data (2 API calls)
        ratios = self._fetch_financial_ratios(year, month)
        industries = self._fetch_industry_summary(year, month)

        # Index by stock code
        ratio_by_code: dict[str, dict] = {}
        for r in ratios:
            code = (r.get("code") or "").strip().upper()
            if code:
                ratio_by_code[code] = r

        industry_by_name: dict[str, dict] = {}
        for i in industries:
            name = (i.get("Name") or "").strip().upper()
            if name:
                industry_by_name[name] = i

        updated = 0
        errors = 0

        for ticker in tickers:
            ticker_id = ticker["id"]
            symbol = ticker["symbol"].upper()

            try:
                ratio = ratio_by_code.get(symbol, {})
                sector = (ratio.get("sector") or "").strip()
                sector_data = industry_by_name.get(sector.upper(), {})

                # Fetch company profile for extra data
                profile = self._fetch_company_profile(symbol)

                fundamentals = {
                    "pe_ratio": float(ratio.get("per", 0) or 0),
                    "pbv_ratio": float(ratio.get("priceBV", 0) or 0),
                    "de_ratio": float(ratio.get("deRatio", 0) or 0),
                    "roa": float(ratio.get("roa", 0) or 0) / 100,
                    "roe": float(ratio.get("roe", 0) or 0) / 100,
                    "npm": float(ratio.get("npm", 0) or 0) / 100,
                    "eps": float(ratio.get("eps", 0) or 0),
                    "revenue": float(ratio.get("sales", 0) or 0),
                    "profit": float(ratio.get("profitPeriod", 0) or 0),
                    "sector": sector,
                    "sector_avg_pe": float(sector_data.get("PER", 0) or 0),
                    "sector_avg_pbv": float(sector_data.get("PBV", 0) or 0),
                    "sector_mcap": float(sector_data.get("MCap", 0) or 0),
                    "sub_sector": (profile or {}).get("SubSector", ""),
                    "listing_date": (profile or {}).get("ListingDate", ""),
                    "scraped_at": now.isoformat(),
                }

                self.db.table("ticker_fundamentals").upsert(
                    {"ticker_id": ticker_id, "data": fundamentals},
                    on_conflict="ticker_id",
                ).execute()

                updated += 1

            except Exception as e:
                errors += 1
                logger.warning("Failed %s: %s", symbol, e)

        return {"updated": updated, "errors": errors}
