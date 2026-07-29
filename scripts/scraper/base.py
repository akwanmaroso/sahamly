"""Base scraper class with common utilities."""

import logging
import time
from abc import ABC, abstractmethod

from supabase import Client

from .db import get_supabase, get_active_tickers
from .idx_session import get_idx_session, IdxSession

logger = logging.getLogger(__name__)


class BaseScraper(ABC):
    """Base class for all IDX scrapers."""

    name: str = "base"

    def __init__(self) -> None:
        self.db: Client = get_supabase()
        self.idx: IdxSession = get_idx_session()

    @abstractmethod
    def scrape(self, tickers: list[dict]) -> dict:
        """Run the scraper for the given tickers.

        Args:
            tickers: List of dicts with 'id' and 'symbol' keys.

        Returns:
            Summary dict with stats about what was scraped.
        """
        ...

    def run(self) -> dict:
        """Fetch active tickers and run the scraper."""
        tickers = get_active_tickers(self.db)
        if not tickers:
            logger.warning("[%s] No active tickers found, skipping.", self.name)
            return {"status": "skipped", "reason": "no_active_tickers"}

        logger.info("[%s] Running for %d tickers...", self.name, len(tickers))
        start = time.time()

        try:
            result = self.scrape(tickers)
            elapsed = round(time.time() - start, 1)
            logger.info("[%s] Done in %.1fs: %s", self.name, elapsed, result)
            return {"status": "ok", "elapsed_s": elapsed, **result}
        except Exception as e:
            logger.exception("[%s] Failed: %s", self.name, e)
            return {"status": "error", "error": str(e)}
