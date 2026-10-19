"""Shared test fixtures.

Single source of truth for the authenticated-principal shape used in
`app.dependency_overrides[get_current_user]` / `[get_principal]` test mocks.
"""
from __future__ import annotations

import pytest
from typing import Any

from tests.shipped_runtime import refuse_off_the_shipped_runtime

refuse_off_the_shipped_runtime()

from app.deps import CurrentUser, Principal  # noqa: E402
from app.services import test_accounts  # noqa: E402


def fake_principal(user_id: str = "u1", email: str | None = "test@example.com") -> Principal:
    return Principal(id=user_id, email=email)


def fake_current_user(
    user_id: str = "u1",
    email: str | None = "test@example.com",
    token: str = "test-token",
) -> CurrentUser:
    """Use in `app.dependency_overrides[get_current_user] = lambda: fake_current_user(...)`.

    Cascades through both `get_principal` and `get_user_db` because both
    deps internally depend on `get_current_user`.
    """
    return CurrentUser(id=user_id, email=email, token=token)


@pytest.fixture(autouse=True)
def _reset_test_account_memo() -> Any:
    """`test_accounts.excluded_user_ids` memoises for 5 minutes, which is right
    in a process serving requests and wrong in a suite: one test's fake ids
    would otherwise decide whether a LATER test's counter filters at all, and
    the failure would depend on collection order.
    """
    test_accounts.reset_cache()
    yield
    test_accounts.reset_cache()


@pytest.fixture(autouse=True)
def _reset_partner_credential_cache() -> Any:
    """A partner key resolved in one test must not stay valid in the next: a
    revoked-key test run after a valid-key test would pass for the wrong reason."""
    from app.security import partner_auth

    partner_auth.reset_credential_cache()
    yield
    partner_auth.reset_credential_cache()


def _vocab_rows() -> list[dict[str, Any]]:
    """A slice of public.location_vocab (seeded from the scraper's india_cities.json)."""
    rows: list[dict[str, Any]] = [
        {"kind": "country", "key": key, "canonical": key, "state": None}
        for key in ("india", "united states", "united kingdom", "singapore", "us", "uk")
    ]
    for state in ("Maharashtra", "Karnataka", "Haryana", "Uttar Pradesh", "Tamil Nadu",
                  "Gujarat", "Goa", "Telangana", "West Bengal"):
        rows.append({"kind": "state", "key": state.casefold(), "canonical": state, "state": state})
    for city, state in (
        ("Pune", "Maharashtra"), ("Mumbai", "Maharashtra"), ("Thane", "Maharashtra"),
        ("Bengaluru", "Karnataka"), ("Chennai", "Tamil Nadu"), ("Hyderabad", "Telangana"),
        ("Gurugram", "Haryana"), ("Noida", "Uttar Pradesh"), ("Lucknow", "Uttar Pradesh"),
        ("Delhi NCR", "Delhi"), ("Ahmedabad", "Gujarat"), ("Kolkata", "West Bengal"),
    ):
        rows.append({"kind": "city", "key": city.casefold(), "canonical": city, "state": state})
    for alias, city, state in (
        ("bangalore", "Bengaluru", "Karnataka"), ("gurgaon", "Gurugram", "Haryana"),
        ("new delhi", "Delhi NCR", "Delhi"), ("delhi", "Delhi NCR", "Delhi"),
    ):
        rows.append({"kind": "alias", "key": alias, "canonical": city, "state": state})
    for member, state in (("Delhi NCR", "Delhi"), ("Gurugram", "Haryana"), ("Noida", "Uttar Pradesh")):
        rows.append({"kind": "metro", "key": "delhi ncr", "canonical": member, "state": state})
    return rows


@pytest.fixture(autouse=True)
def _pinned_location_vocab() -> Any:
    """Location rules read public.location_vocab; a suite must never reach the network for it."""
    from app.services import location_vocab

    location_vocab.set_vocab(location_vocab.build_vocab(_vocab_rows()))
    yield
    location_vocab.set_vocab(None)


class RecordedSnapshotWrites:
    """The service-role client `career_target.record_from_profile` holds."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> "RecordedSnapshotWrites":
        self.calls.append((name, params))
        return self

    def execute(self) -> None:
        return None


#: Settings fields that open a paid model provider. Embeddings ride the
#: OpenRouter key too.
_LLM_KEY_FIELDS = (
    "openrouter_api_key", "groq_api_key", "google_api_key", "openai_api_key", "anthropic_api_key",
)
#: The same providers as plain environment variables (`skill_tagger` reads these).
_LLM_KEY_ENV = (
    "OPENROUTER_API_KEY", "GROQ_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY",
    "CEREBRAS_API_KEY", "SAMBANOVA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
)


@pytest.fixture(autouse=True)
def no_live_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    """No test reaches a paid model, on any machine.

    Settings loads the real `.env`, so on a laptop with keys a test that forgot
    to stub its provider made a live call and passed, while CI (no keys) failed:
    the weave answer route's judge, 2026-10-19. Blank here, a missing stub fails
    the same way everywhere. A test that needs a provider passes a fake one.
    """
    from app.config import settings

    for field in _LLM_KEY_FIELDS:
        monkeypatch.setattr(settings, field, "")
    for name in _LLM_KEY_ENV:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture(autouse=True)
def snapshot_writes(monkeypatch: pytest.MonkeyPatch) -> RecordedSnapshotWrites:
    """Every direction write ends in `record_from_profile`, which holds its own
    service-role client. With a real `.env` that client is production: no test
    writes a career target there. A test that cares reads `.calls`.
    """
    from app.services import career_target

    writes = RecordedSnapshotWrites()
    monkeypatch.setattr(career_target, "get_supabase_admin", lambda: writes)
    return writes
