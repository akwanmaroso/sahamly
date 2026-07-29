"""CLI entry point for the scraper service.

Usage:
    python -m scripts.scraper                    # Run all scrapers once
    python -m scripts.scraper broker_summary     # Run specific scraper
    python -m scripts.scraper --schedule         # Run on schedule (after market close)
    python -m scripts.scraper --list             # List available scrapers
"""

import argparse
import logging
import sys
import time
from datetime import datetime

import schedule

from .broker_summary import BrokerSummaryScraper
from .foreign_flow import ForeignFlowScraper
from .running_trades import RunningTradesScraper
from .financials import FinancialsScraper
from .insider import InsiderScraper
from .config import SCRAPE_HOUR, SCRAPE_MINUTE

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("scraper")

SCRAPERS = {
    "broker_summary": BrokerSummaryScraper,
    "foreign_flow": ForeignFlowScraper,
    "running_trades": RunningTradesScraper,
    "financials": FinancialsScraper,
    "insider": InsiderScraper,
}

# Execution order matters — broker_summary and foreign_flow first (most critical)
SCRAPER_ORDER = [
    "broker_summary",
    "foreign_flow",
    "running_trades",
    "financials",
    "insider",
]


def run_all() -> None:
    """Run all scrapers in order."""
    logger.info("=== Scraper run started at %s ===", datetime.now().isoformat())
    results = {}

    for name in SCRAPER_ORDER:
        cls = SCRAPERS[name]
        try:
            scraper = cls()
            result = scraper.run()
            results[name] = result
        except Exception as e:
            logger.exception("Scraper %s crashed: %s", name, e)
            results[name] = {"status": "crash", "error": str(e)}

    logger.info("=== Scraper run complete ===")
    for name, result in results.items():
        status = result.get("status", "unknown")
        logger.info("  %s: %s", name, status)


def run_one(name: str) -> None:
    """Run a single scraper by name."""
    if name not in SCRAPERS:
        logger.error("Unknown scraper: %s. Available: %s", name, list(SCRAPERS.keys()))
        sys.exit(1)

    cls = SCRAPERS[name]
    scraper = cls()
    result = scraper.run()
    logger.info("Result: %s", result)


def main() -> None:
    parser = argparse.ArgumentParser(description="Sahamly IDX data scraper")
    parser.add_argument("scraper", nargs="?", help="Run a specific scraper")
    parser.add_argument("--schedule", action="store_true", help="Run on daily schedule")
    parser.add_argument("--list", action="store_true", help="List available scrapers")
    args = parser.parse_args()

    if args.list:
        print("Available scrapers:")
        for name in SCRAPER_ORDER:
            print(f"  - {name}")
        return

    if args.schedule:
        time_str = f"{SCRAPE_HOUR:02d}:{SCRAPE_MINUTE:02d}"
        logger.info("Scheduling daily run at %s", time_str)
        schedule.every().day.at(time_str).do(run_all)

        # Also run immediately on start
        run_all()

        while True:
            schedule.run_pending()
            time.sleep(60)
    elif args.scraper:
        run_one(args.scraper)
    else:
        run_all()


if __name__ == "__main__":
    main()
