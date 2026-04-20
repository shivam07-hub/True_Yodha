"""
database.py
Supabase client factory for FastAPI routes.

Two clients:
  - get_supabase_admin() — service role key, bypasses RLS.
    Use only in admin/import scripts, never in user-facing routes.
  - get_supabase() — anon key, respects RLS.
    Use in FastAPI routes; pass the user's JWT via set_auth() before querying.

Usage in a FastAPI route:
    from app.database import get_supabase
    from fastapi import Depends

    @router.get("/me")
    async def get_me(client: Client = Depends(get_supabase)):
        ...
"""

from functools import lru_cache

from supabase import Client, create_client

from app.config import settings


@lru_cache(maxsize=1)
def get_supabase_admin() -> Client:
    """Service role client — bypasses RLS. Admin/import scripts only."""
    return create_client(settings.supabase_url, settings.supabase_service_key)


def get_supabase() -> Client:
    """Anon client — respects RLS. Use in user-facing FastAPI routes."""
    return create_client(settings.supabase_url, settings.supabase_anon_key)


def get_supabase_for_token(token: str) -> Client:
    """Anon client with the user's JWT attached for RLS-protected PostgREST calls."""
    client = get_supabase()
    client.postgrest.auth(token)
    return client
