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

import httpx
from postgrest.utils import SyncClient as _PostgrestSyncClient
from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions

from app.config import settings
from app.services.read_capacity import ReadCapacityLimiter

# Hard ceiling on any single PostgREST round-trip. A hung Supabase call must
# not occupy a request thread indefinitely — it fails fast instead of holding
# a threadpool slot for the full client timeout (the 14s 499s we saw). Kept
# generous enough for legitimately heavy reads, tight enough to bound the tail.
_POSTGREST_TIMEOUT_SECONDS = 8
_read_capacity = ReadCapacityLimiter(
    max_inflight=settings.supabase_read_max_inflight,
    queue_timeout_seconds=settings.supabase_read_queue_timeout_seconds,
)


def _client_options() -> ClientOptions:
    return ClientOptions(postgrest_client_timeout=_POSTGREST_TIMEOUT_SECONDS)


class _RetryingHTTPTransport(httpx.HTTPTransport):
    """Retries once on a transient pooled-connection failure, GET/HEAD only.

    httpx/httpcore's built-in ``retries=`` only covers the TCP-connect phase
    (``ConnectError``/``ConnectTimeout``). It does NOT cover a connection that
    was already established, sat idle in the keep-alive pool, got closed by
    Supabase's edge between requests, and only fails once httpx reuses it and
    tries to read a response — exactly the shape of the prod 500s on
    ``/companies/{name}`` (``httpcore.ReadError``/``RemoteProtocolError``
    inside ``_receive_response_headers``, after the request was already sent
    on a connection the pool believed was still alive). This is a well-known
    gap in pooled HTTP clients (same class of bug urllib3's Retry(connect=,
    read=) exists for) — disabling HTTP/2 (see below) fixed the H2-specific
    manifestation but not this more general one.

    Scoped to GET/HEAD only: a failure here happens strictly after
    ``_send_request_body`` succeeds, so for a write the request may already
    have reached the server — blindly retrying a POST/PATCH risks a double
    write. Reads are safe to retry once on a fresh connection.
    """

    _RETRYABLE = (httpx.ReadError, httpx.RemoteProtocolError, httpx.ConnectError)

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        # PostgREST represents table reads as GET requests.  Bound those at the
        # application boundary, before they claim a scarce database worker.  We
        # leave writes outside this short queue so a retrying reader can never
        # delay a user mutation; write idempotency has its own contracts.
        if request.method in ("GET", "HEAD"):
            with _read_capacity.claim():
                return self._handle_with_retry(request)
        return self._handle_with_retry(request)

    def _handle_with_retry(self, request: httpx.Request) -> httpx.Response:
        try:
            return super().handle_request(request)
        except self._RETRYABLE:
            if request.method not in ("GET", "HEAD"):
                raise
            return super().handle_request(request)


def _force_postgrest_http1(client: Client) -> Client:
    """postgrest 0.16.x hardcodes ``http2=True`` on its httpx session. A
    long-lived (lru_cached) client plus an HTTP/2 keepalive pool throws
    ``httpcore.RemoteProtocolError: Server disconnected`` whenever Supabase
    drops an idle connection and httpx then reuses the now-dead one — a 500
    with no partial body, independent of query content. HTTP/2 buys a
    synchronous request/response client nothing (no multiplexing), so rebuild
    the PostgREST session as HTTP/1.1, which reconnects cleanly on an idle drop.
    Also swaps in ``_RetryingHTTPTransport`` (see above) — HTTP/1.1 alone
    doesn't eliminate stale-connection reuse, only the H2-specific crash mode.
    Mirrors the exact factory params (base_url / headers / timeout /
    follow_redirects) so behaviour is otherwise unchanged.
    """
    old = client.postgrest.session
    client.postgrest.session = _PostgrestSyncClient(
        base_url=old.base_url,
        headers=old.headers,
        timeout=old.timeout,
        follow_redirects=True,
        transport=_RetryingHTTPTransport(http2=False),
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
