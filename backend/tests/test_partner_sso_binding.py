"""The partner SSO account-binding gate.

These are the tests that keep a leaked partner API key from becoming a master
key to every Myro account whose email address an attacker can guess. If one of
them starts failing, the fix is never to loosen the assertion.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.repositories.partners import PartnerCredential
from app.services import partner_sso


class _FakeRepo:
    def __init__(self, link: dict | None = None) -> None:
        self.link = link
        self.upserts: list[dict] = []
        self.marked: list[tuple[str, str]] = []
        self.partner = {"id": "p1", "slug": "acme", "name": "Acme"}

    def get_link(self, partner_id, external_id):  # noqa: ANN001
        return self.link

    def get_link_by_connect_token(self, token_hash):  # noqa: ANN001
        self.looked_up = token_hash
        return self.link

    def get_partner_by_slug(self, slug):  # noqa: ANN001
        return self.partner if slug == "acme" else None

    def upsert_link(self, **kwargs):  # noqa: ANN003
        self.upserts.append(kwargs)
        return {"id": "seat1", "external_id": kwargs["external_id"], **kwargs}

    def mark_linked(self, link_id, *, user_id):  # noqa: ANN001
        self.marked.append((link_id, user_id))

    def touch_sso(self, link_id):  # noqa: ANN001
        pass


CREDENTIAL = PartnerCredential(
    key_id="k1", partner_id="p1", slug="acme", name="Acme", scopes=frozenset({"sso"})
)


@pytest.fixture(autouse=True)
def _no_provisioning(monkeypatch):
    monkeypatch.setattr(partner_sso, "ensure_user_provisioned", lambda *a, **k: True)


def test_new_account_is_linked_and_gets_a_url(monkeypatch):
    """Nobody has ever used this address — there is nothing to take over."""
    monkeypatch.setattr(partner_sso.auth_links, "create_user_if_absent", lambda admin, email: "new-user")
    monkeypatch.setattr(
        partner_sso.auth_links, "mint_login_link", lambda admin, **kw: "https://app/magic"
    )
    repo = _FakeRepo(link=None)

    outcome = partner_sso.start_session(
        repo, SimpleNamespace(), partner=CREDENTIAL,
        external_id="ext-1", email="New@Example.com", full_name="New",
    )

    assert outcome.mode == "direct"
    assert outcome.login_url == "https://app/magic"
    assert repo.upserts[0]["link_state"] == "linked"
    assert repo.upserts[0]["email"] == "new@example.com"


def test_pre_existing_account_gets_a_consent_url_not_a_session(monkeypatch):
    """The address predates the call. The partner gets a consent screen — never a
    sign-in url, and never an email fired on their behalf."""
    monkeypatch.setattr(partner_sso.settings, "app_base_url", "https://app.myro.test")
    monkeypatch.setattr(partner_sso.auth_links, "create_user_if_absent", lambda admin, email: None)
    monkeypatch.setattr(
        partner_sso.auth_links, "mint_login_link", lambda admin, **kw: "https://app/magic"
    )
    sent: list[dict] = []
    monkeypatch.setattr(
        partner_sso.email_service, "send_email",
        lambda **kw: sent.append(kw) or True,
    )
    repo = _FakeRepo(link=None)

    outcome = partner_sso.start_session(
        repo, SimpleNamespace(), partner=CREDENTIAL,
        external_id="ext-1", email="victim@example.com", full_name=None,
    )

    assert outcome.mode == "connect_required"
    assert outcome.login_url is None
    assert outcome.connect_url.startswith("https://app.myro.test/connect/acme?t=")
    assert repo.upserts[0]["link_state"] == "pending_connect"
    assert repo.upserts[0]["user_id"] is None
    # The user is mid-flow. Mailing them here is exactly the round-trip this
    # design removed; it happens only if they ask for it on the screen.
    assert sent == []


def test_the_stored_connect_token_is_hashed(monkeypatch):
    """A table dump must not yield a working consent url."""
    monkeypatch.setattr(partner_sso.settings, "app_base_url", "https://app.myro.test")
    monkeypatch.setattr(partner_sso.auth_links, "create_user_if_absent", lambda admin, email: None)
    repo = _FakeRepo(link=None)

    outcome = partner_sso.start_session(
        repo, SimpleNamespace(), partner=CREDENTIAL,
        external_id="ext-1", email="known@example.com", full_name=None,
    )

    raw = outcome.connect_url.split("t=")[1]
    stored = repo.upserts[0]["connect_token_hash"]
    assert stored != raw
    assert stored == partner_sso.hash_connect_token(raw)
    assert repo.upserts[0]["connect_token_expires_at"]


def test_already_linked_seat_skips_the_gate(monkeypatch):
    """A seat that passed the gate once does not re-probe on every sign-in."""
    probed: list[str] = []
    monkeypatch.setattr(
        partner_sso.auth_links, "create_user_if_absent",
        lambda admin, email: probed.append(email) or None,
    )
    monkeypatch.setattr(
        partner_sso.auth_links, "mint_login_link", lambda admin, **kw: "https://app/magic"
    )
    repo = _FakeRepo(link={
        "id": "seat1", "link_state": "linked", "user_id": "u1", "email": "known@example.com",
    })

    outcome = partner_sso.start_session(
        repo, SimpleNamespace(), partner=CREDENTIAL,
        external_id="ext-1", email="known@example.com", full_name=None,
    )

    assert outcome.mode == "direct"
    assert probed == []


def test_changed_email_reopens_the_gate(monkeypatch):
    """A linked seat whose email now names somebody ELSE must go back through the
    gate — otherwise the partner edits one field and inherits another account."""
    monkeypatch.setattr(partner_sso.auth_links, "create_user_if_absent", lambda admin, email: None)
    monkeypatch.setattr(partner_sso.email_service, "send_email", lambda **kw: True)
    monkeypatch.setattr(
        partner_sso.auth_links, "mint_login_link", lambda admin, **kw: "https://app/magic"
    )
    repo = _FakeRepo(link={
        "id": "seat1", "link_state": "linked", "user_id": "u1", "email": "old@example.com",
    })

    outcome = partner_sso.start_session(
        repo, SimpleNamespace(), partner=CREDENTIAL,
        external_id="ext-1", email="someone-else@example.com", full_name=None,
    )

    assert outcome.mode == "connect_required"
    assert outcome.login_url is None


def test_complete_link_requires_the_signed_in_email_to_match():
    repo = _FakeRepo(link={
        "id": "seat1", "link_state": "pending_connect", "email": "owner@example.com",
    })

    assert partner_sso.complete_link(
        repo, partner_slug="acme", external_id="ext-1",
        user_id="u9", user_email="attacker@example.com",
    ) is False
    assert repo.marked == []

    assert partner_sso.complete_link(
        repo, partner_slug="acme", external_id="ext-1",
        user_id="u9", user_email="Owner@example.com",
    ) is True
    assert repo.marked == [("seat1", "u9")]


def test_sign_in_links_always_land_on_our_own_callback(monkeypatch):
    """The origin comes from config, never from partner input, and the path is
    the one page that can consume a Supabase token."""
    monkeypatch.setattr(partner_sso.settings, "app_base_url", "https://app.myro.test")

    assert partner_sso.callback_url() == "https://app.myro.test/auth/callback"
    assert partner_sso.callback_url(link_partner="acme", partner_external_id="e 1") == (
        "https://app.myro.test/auth/callback?link_partner=acme&partner_external_id=e+1"
    )


def test_the_email_fallback_link_carries_the_partner_params(monkeypatch):
    """Only fires when the USER asks for it. Without these params post-signin has
    nothing to complete."""
    monkeypatch.setattr(partner_sso.settings, "app_base_url", "https://app.myro.test")
    monkeypatch.setattr(partner_sso.email_service, "send_email", lambda **kw: True)
    minted: list[str] = []
    monkeypatch.setattr(
        partner_sso.auth_links, "mint_login_link",
        lambda admin, **kw: minted.append(kw["redirect_to"]) or "https://app/magic",
    )
    repo = _FakeRepo(link={
        "id": "seat1", "link_state": "pending_connect", "email": "owner@example.com",
        "external_id": "ext-1", "connect_token_expires_at": _future(),
        "partners": {"slug": "acme", "name": "Acme", "status": "active"},
    })

    assert partner_sso.send_connect_email(repo, SimpleNamespace(), token="tok") is True
    assert "link_partner=acme" in minted[0]
    assert "partner_external_id=ext-1" in minted[0]


# ── the consent screen ─────────────────────────────────────────────────────


def _future() -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()


def _past() -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()


def _pending_seat(**over) -> dict:
    seat = {
        "id": "seat1",
        "link_state": "pending_connect",
        "email": "owner@example.com",
        "external_id": "ext-1",
        "connect_token_expires_at": _future(),
        "partners": {"slug": "acme", "name": "Acme", "status": "active"},
    }
    seat.update(over)
    return seat


def test_connect_context_masks_the_email():
    """Whoever holds the token has not proved anything yet."""
    context = partner_sso.resolve_connect_token(_FakeRepo(link=_pending_seat()), "tok")

    assert context.partner_name == "Acme"
    assert context.email_masked.endswith("@example.com")
    assert "owner" not in context.email_masked


@pytest.mark.parametrize(
    "seat",
    [
        _pending_seat(connect_token_expires_at=_past()),
        _pending_seat(link_state="linked"),
        _pending_seat(partners={"slug": "acme", "name": "Acme", "status": "suspended"}),
        None,
    ],
)
def test_connect_context_refuses_anything_not_live(seat):
    assert partner_sso.resolve_connect_token(_FakeRepo(link=seat), "tok") is None


def test_approve_links_only_for_the_matching_signed_in_account():
    repo = _FakeRepo(link=_pending_seat())

    assert partner_sso.approve_connect(
        repo, token="tok", user_id="u9", user_email="someone-else@example.com"
    ) is False
    assert repo.marked == []

    assert partner_sso.approve_connect(
        repo, token="tok", user_id="u9", user_email="Owner@example.com"
    ) is True
    assert repo.marked == [("seat1", "u9")]


def test_approve_refuses_an_expired_token():
    repo = _FakeRepo(link=_pending_seat(connect_token_expires_at=_past()))

    assert partner_sso.approve_connect(
        repo, token="tok", user_id="u9", user_email="owner@example.com"
    ) is False


def test_approve_refuses_a_seat_that_is_already_linked():
    """A spent consent screen must not be replayable."""
    repo = _FakeRepo(link=_pending_seat(link_state="linked"))

    assert partner_sso.approve_connect(
        repo, token="tok", user_id="u9", user_email="owner@example.com"
    ) is False


def test_a_token_lookup_is_by_hash_never_by_the_raw_value():
    repo = _FakeRepo(link=_pending_seat())

    partner_sso.resolve_connect_token(repo, "tok")

    assert repo.looked_up == partner_sso.hash_connect_token("tok")
