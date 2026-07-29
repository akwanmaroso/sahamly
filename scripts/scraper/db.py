"""Supabase client for the scraper service."""

from supabase import create_client, Client
from .config import SUPABASE_URL, SUPABASE_SERVICE_KEY


def get_supabase() -> Client:
    """Create a Supabase client using the service role key (bypasses RLS)."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_active_tickers(client: Client) -> list[dict]:
    """Fetch all active tickers from the database."""
    result = (
        client.table("tickers")
        .select("id, symbol")
        .eq("active", True)
        .execute()
    )
    return result.data or []
