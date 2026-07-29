"""Scraper configuration — reads from environment variables."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env.local first (Next.js convention), then .env as fallback
_project_root = Path(__file__).resolve().parent.parent.parent
load_dotenv(_project_root / ".env.local")
load_dotenv(_project_root / ".env")

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Rate limiting
IDX_REQUEST_DELAY_S = float(os.environ.get("IDX_REQUEST_DELAY_S", "2.0"))
IDX_SESSION_TTL_S = int(os.environ.get("IDX_SESSION_TTL_S", "600"))  # 10 min

# Scraping schedule (cron-like)
SCRAPE_HOUR = int(os.environ.get("SCRAPE_HOUR", "17"))  # 5 PM WIB (after market close)
SCRAPE_MINUTE = int(os.environ.get("SCRAPE_MINUTE", "30"))
