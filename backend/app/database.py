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

from postgrest.utils import SyncClient as _PostgrestSyncClient
from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions

from app.config import settings

# Hard ceiling on any single PostgREST round-trip. A hung Supabase call must
# not occupy a request thread indefinitely — it fails fast instead of holding
# a threadpool slot for the full client timeout (the 14s 499s we saw). Kept
# generous enough for legitimately heavy reads, tight enough to bound the tail.
_POSTGREST_TIMEOUT_SECONDS = 8


def _client_options() -> ClientOptions:
    return ClientOptions(postgrest_client_timeout=_POSTGREST_TIMEOUT_SECONDS)


def _force_postgrest_http1(client: Client) -> Client:
    """postgrest 0.16.x hardcodes ``http2=True`` on its httpx session. A
    long-lived (lru_cached) client plus an HTTP/2 keepalive pool throws
    ``httpcore.RemoteProtocolError: Server disconnected`` whenever Supabase
    drops an idle connection and httpx then reuses the now-dead one — a 500
    with no partial body, independent of query content. HTTP/2 buys a
    synchronous request/response client nothing (no multiplexing), so rebuild
    the PostgREST session as HTTP/1.1, which reconnects cleanly on an idle drop.
    Mirrors the exact factory params (base_url / headers / timeout /
    follow_redirects) so behaviour is otherwise unchanged.
    """
    old = client.postgrest.session
    client.postgrest.session = _PostgrestSyncClient(
        base_url=old.base_url,
        headers=old.headers,
        timeout=old.timeout,
        follow_redirects=True,
        http2=False,
    )
    return client


@lru_cache(maxsize=1)
def get_supabase_admin() -> Client:
    """Service role client — bypasses RLS. Admin/import scripts only."""
    return _force_postgrest_http1(
        create_client(
            settings.supabase_url,
            settings.supabase_service_key,
            options=_client_options(),
        )
    )


def get_supabase() -> Client:
    """Anon client — respects RLS. Use in user-facing FastAPI routes."""
    return _force_postgrest_http1(
        create_client(
            settings.supabase_url,
            settings.supabase_anon_key,
            options=_client_options(),
        )
    )


def get_supabase_for_token(token: str) -> Client:
    """Anon client with the user's JWT attached for RLS-protected PostgREST calls."""
    client = get_supabase()
    client.postgrest.auth(token)
    return client
