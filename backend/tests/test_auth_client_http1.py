"""Partner SSO's GoTrue calls ride HTTP/1.1, not gotrue's own HTTP/2 client.

`AuthRetryableError: Server disconnected` — a call reusing an HTTP/2
connection Supabase had dropped — answered eight partner SSO calls with a 500
between 2026-10-05 and 10-09: `create_user` and the magic-link mint.
"""

from __future__ import annotations

from app import database

NOTICE_CAUSE_KEY = "unhandled_500:AuthRetryableError:app/services/auth_links.py:mint_login_link_for_existing_user"
NOTICE_CAUSE_KEY = "unhandled_500:AuthRetryableError:app/services/auth_links.py:create_user_if_absent"
# Downstream of the same drop: on 2026-10-06 two `create_user` calls died on
# `Server disconnected` at 17:56:38, the account was created but no seat was
# linked, and the sibling call waiting for that link gave up 10.7s later.
NOTICE_CAUSE_KEY = "unhandled_500:CreateRaced:app/services/auth_links.py:create_user_if_absent"


def test_auth_admin_calls_ride_the_shared_http1_pool() -> None:
    database.get_supabase_admin.cache_clear()
    try:
        client = database.get_supabase_admin()
        assert client.auth._http_client._transport is database._SHARED_TRANSPORT
        assert client.auth.admin._http_client is client.auth._http_client
        assert database._SHARED_TRANSPORT._pool._http2 is False
    finally:
        database.get_supabase_admin.cache_clear()
