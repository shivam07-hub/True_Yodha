"""Partner SSO is the front door — 199 of 209 signups in the 30 days to
2026-10-03 — and it took 1.5-2s at the median and 3-5s for a quarter of calls:
four to six sequential hops to Supabase, each with a ~300ms floor that even
`/auth/v1/health` pays (2026-10-03). The lever in code is fewer hops.
"""

from __future__ import annotations

import threading
from types import SimpleNamespace

from app.repositories.partners import PartnerCredential
from app.services import partner_sso

_CREDENTIAL = PartnerCredential(
    key_id="k1", partner_id="p1", slug="acme", name="Acme", scopes=frozenset({"sso"})
)


def test_a_new_account_links_its_seat_and_mints_side_by_side(monkeypatch) -> None:
    """Both need only the account to exist. Sequential, they were two of the
    four hops a brand-new user waited through."""
    mint_started = threading.Event()
    seat_waited: list[bool] = []

    class _Repo:
        def get_link(self, *_a: object) -> None:
            return None

        def link_new_seat(self, **kwargs: object) -> dict[str, object]:
            # Sequential would deadlock here for the full timeout: the mint
            # cannot start until this returns.
            seat_waited.append(mint_started.wait(timeout=2))
            return {"id": "seat1", **kwargs}

    def mint(_admin: object, **_kw: object) -> str:
        mint_started.set()
        return "https://app/magic"

    monkeypatch.setattr(partner_sso.auth_links, "create_user_if_absent", lambda _a, _e: "new-user")
    monkeypatch.setattr(partner_sso.auth_links, "mint_login_link_for_existing_user", mint)

    outcome = partner_sso.start_session(
        _Repo(), SimpleNamespace(), partner=_CREDENTIAL,  # type: ignore[arg-type]
        external_id="ext-1", email="new@example.com", full_name="New",
    )

    assert seat_waited == [True], "the seat write and the mint must overlap"
    assert outcome.login_url == "https://app/magic"
    assert outcome.user_ref == "seat1"


def test_a_failed_seat_write_returns_no_url(monkeypatch) -> None:
    class _Repo:
        def get_link(self, *_a: object) -> None:
            return None

        def link_new_seat(self, **_kw: object) -> dict[str, object]:
            raise RuntimeError("seat write failed")

    monkeypatch.setattr(partner_sso.auth_links, "create_user_if_absent", lambda _a, _e: "new-user")
    monkeypatch.setattr(
        partner_sso.auth_links, "mint_login_link_for_existing_user", lambda _a, **_k: "https://app/magic"
    )

    try:
        partner_sso.start_session(
            _Repo(), SimpleNamespace(), partner=_CREDENTIAL,  # type: ignore[arg-type]
            external_id="ext-1", email="new@example.com", full_name="New",
        )
    except RuntimeError:
        return
    raise AssertionError("a minted link must never outlive a failed seat write")

