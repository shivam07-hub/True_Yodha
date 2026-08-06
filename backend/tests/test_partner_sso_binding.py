"""The partner SSO account-binding gate.

These are the tests that keep a leaked partner API key from becoming a master
key to every Myro account whose email address an attacker can guess. If one of
them starts failing, the fix is never to loosen the assertion.
"""
from __future__ import annotations

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


def test_pre_existing_account_gets_no_url(monkeypatch):
    """The address predates the call. The partner receives NO sign-in url — the
    owner is emailed one instead."""
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

    assert outcome.mode == "verification_required"
    assert outcome.login_url is None
    assert repo.upserts[0]["link_state"] == "pending_verification"
    assert repo.upserts[0]["user_id"] is None
    assert sent and sent[0]["to"] == "victim@example.com"


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

    assert outcome.mode == "verification_required"
    assert outcome.login_url is None


def test_complete_link_requires_the_signed_in_email_to_match():
    repo = _FakeRepo(link={
        "id": "seat1", "link_state": "pending_verification", "email": "owner@example.com",
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


def test_verification_link_carries_the_partner_params(monkeypatch):
    """The emailed link is what completes a pending seat — without these params
    post-signin has nothing to complete."""
    monkeypatch.setattr(partner_sso.settings, "app_base_url", "https://app.myro.test")
    monkeypatch.setattr(partner_sso.auth_links, "create_user_if_absent", lambda admin, email: None)
    monkeypatch.setattr(partner_sso.email_service, "send_email", lambda **kw: True)
    minted: list[str] = []
    monkeypatch.setattr(
        partner_sso.auth_links, "mint_login_link",
        lambda admin, **kw: minted.append(kw["redirect_to"]) or "https://app/magic",
    )

    partner_sso.start_session(
        _FakeRepo(link=None), SimpleNamespace(), partner=CREDENTIAL,
        external_id="ext-1", email="known@example.com", full_name=None,
    )

    assert "link_partner=acme" in minted[0]
    assert "partner_external_id=ext-1" in minted[0]
