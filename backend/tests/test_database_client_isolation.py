"""Per-request auth isolation vs. shared connection pooling.

The performance win here (reuse Supabase connections instead of opening fresh
TLS per request) has exactly one safe shape, and one very tempting unsafe one.

  SAFE   — share the TRANSPORT. It owns the connection pool. No token ever
           touches it.
  UNSAFE — share the CLIENT. `get_supabase_for_token` mutates it via
           `.auth(token)`, so a shared client shares one Authorization header
           across concurrent requests: user A's query runs under user B's
           token and RLS returns B's rows.

These tests exist because the unsafe version is a one-line change that looks
like a pure optimisation, and nothing else in the suite would catch it.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest

import app.database as database

_TEST_ANON_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature"
_TEST_SERVICE_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature"


@pytest.fixture(autouse=True)
def _client_factory_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Keep factory-only tests independent of deployment credentials.

    These tests never make a request; they inspect the clients and shared
    transport created locally. A syntactically valid, test-only configuration
    lets supabase-py build those clients without teaching production code to
    accept blank credentials.
    """
    database.get_supabase_admin.cache_clear()
    monkeypatch.setattr(database.settings, "supabase_url", "https://test.supabase.co")
    # supabase-py validates the JWT shape at construction time. These are
    # deliberately unsigned placeholders, valid only because no test sends a
    # request.
    monkeypatch.setattr(database.settings, "supabase_anon_key", _TEST_ANON_KEY)
    monkeypatch.setattr(database.settings, "supabase_service_key", _TEST_SERVICE_KEY)

    yield

    database.get_supabase_admin.cache_clear()


def test_each_token_client_is_a_distinct_object() -> None:
    # If this ever returns the same object for two tokens, the Authorization
    # header is shared and the isolation below is already broken.
    a = database.get_supabase_for_token("token-aaa")
    b = database.get_supabase_for_token("token-bbb")
    assert a is not b


def test_two_tokens_never_share_an_authorization_header() -> None:
    a = database.get_supabase_for_token("token-aaa")
    b = database.get_supabase_for_token("token-bbb")

    auth_a = a.postgrest.session.headers.get("Authorization")
    auth_b = b.postgrest.session.headers.get("Authorization")

    assert auth_a == "Bearer token-aaa"
    assert auth_b == "Bearer token-bbb"
    # The real regression: building B must not retroactively change A.
    assert auth_a != auth_b


def test_building_a_second_client_does_not_mutate_the_first() -> None:
    # Ordering matters — the leak shows up as "the previous request's client
    # now carries the newest token", which only a re-read of A exposes.
    a = database.get_supabase_for_token("first")
    assert a.postgrest.session.headers.get("Authorization") == "Bearer first"

    database.get_supabase_for_token("second")
    database.get_supabase_for_token("third")

    assert a.postgrest.session.headers.get("Authorization") == "Bearer first"


def test_clients_share_one_transport_so_connections_are_reused() -> None:
    # The performance half of the contract. Distinct clients, ONE pool — every
    # authed request used to build its own empty pool and pay fresh TLS
    # handshakes on every section of a fan-out.
    a = database.get_supabase_for_token("token-aaa")
    b = database.get_supabase_for_token("token-bbb")

    transport_a = a.postgrest.session._transport
    transport_b = b.postgrest.session._transport

    assert transport_a is transport_b
    assert transport_a is database._SHARED_TRANSPORT


def test_admin_client_shares_the_same_pool_as_token_clients() -> None:
    # Admin reads (public surfaces, snapshots) and authed reads both go to the
    # same Supabase host, so they should draw on the same warm pool rather than
    # maintaining two.
    admin = database.get_supabase_admin()
    token_client = database.get_supabase_for_token("token-aaa")
    assert admin.postgrest.session._transport is token_client.postgrest.session._transport
