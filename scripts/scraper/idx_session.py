"""IDX session management — handles cookie auth with automatic refresh.

IDX endpoints require a session cookie obtained by visiting idx.co.id first.
The session expires after ~10 minutes and must be refreshed.
Uses curl_cffi for TLS fingerprint impersonation to bypass Cloudflare.

Some endpoints (GetBrokerSummaryByStock, GetRunningTrade) require additional
warmup by visiting their parent pages first.
"""

import time
import logging
from curl_cffi.requests import Session

from .config import IDX_SESSION_TTL_S, IDX_REQUEST_DELAY_S

logger = logging.getLogger(__name__)

IDX_BASE = "https://www.idx.co.id/primary"

BROWSER_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
    "Referer": "https://www.idx.co.id/",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
    ),
}

# Pages to visit during warmup to unlock their child API endpoints
WARMUP_PAGES = [
    "https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/ringkasan-broker",
    "https://www.idx.co.id/id/data-pasar/ringkasan-perdagangan/seluruh-saham",
]


class IdxSession:
    """Manages an authenticated session to idx.co.id with auto-refresh."""

    def __init__(self) -> None:
        self._session = Session(impersonate="chrome")
        self._expiry = 0.0
        self._last_request_at = 0.0

    def _ensure_session(self) -> None:
        """Refresh the session cookie if expired."""
        if time.time() < self._expiry:
            return

        logger.info("Refreshing IDX session cookie...")

        # Step 1: Visit the homepage to get session cookie
        resp = self._session.get(
            "https://www.idx.co.id/id",
            headers=BROWSER_HEADERS,
            allow_redirects=True,
        )
        resp.raise_for_status()
        time.sleep(1)

        # Step 2: Warm the session with a lightweight API call
        warmup = self._session.get(
            f"{IDX_BASE}/home/GetIndexList",
            headers=BROWSER_HEADERS,
        )
        warmup.raise_for_status()
        time.sleep(0.5)

        # Step 3: Visit specific pages to unlock their API endpoints
        for page_url in WARMUP_PAGES:
            try:
                page_resp = self._session.get(
                    page_url,
                    headers={
                        **BROWSER_HEADERS,
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    },
                    allow_redirects=True,
                )
                page_resp.raise_for_status()
                time.sleep(0.5)
            except Exception as e:
                logger.debug("Warmup page %s failed (non-fatal): %s", page_url, e)

        self._expiry = time.time() + IDX_SESSION_TTL_S
        logger.info("IDX session refreshed, expires in %ds", IDX_SESSION_TTL_S)

    def _rate_limit(self) -> None:
        """Enforce minimum delay between requests."""
        elapsed = time.time() - self._last_request_at
        if elapsed < IDX_REQUEST_DELAY_S:
            time.sleep(IDX_REQUEST_DELAY_S - elapsed)

    def get_json(self, url: str, max_retries: int = 2) -> dict:
        """Make an authenticated GET request and return parsed JSON.

        Retries on 403/503 with session refresh and exponential backoff.
        """
        self._ensure_session()
        self._rate_limit()

        headers = {
            **BROWSER_HEADERS,
            "X-Requested-With": "XMLHttpRequest",
        }

        for attempt in range(max_retries + 1):
            resp = self._session.get(url, headers=headers)
            self._last_request_at = time.time()

            if resp.status_code in (403, 503):
                if attempt < max_retries:
                    wait = (attempt + 1) * 3  # 3s, 6s backoff
                    logger.warning(
                        "Got %d on attempt %d, refreshing session and retrying in %ds...",
                        resp.status_code, attempt + 1, wait,
                    )
                    time.sleep(wait)
                    self._expiry = 0
                    self._ensure_session()
                    self._rate_limit()
                    continue

            resp.raise_for_status()
            return resp.json()

        # Should not reach here, but just in case
        resp.raise_for_status()
        return resp.json()


# Singleton session instance
_session: IdxSession | None = None


def get_idx_session() -> IdxSession:
    """Get or create the singleton IDX session."""
    global _session
    if _session is None:
        _session = IdxSession()
    return _session
