"""Shared test fixtures.

Single source of truth for the authenticated-principal shape used in
`app.dependency_overrides[get_current_user]` / `[get_principal]` test mocks.
"""
from __future__ import annotations

import pytest
from typing import Any

from app.deps import CurrentUser, Principal
from app.services import test_accounts


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


class RecordedSnapshotWrites:
    """The service-role client `career_target.record_from_profile` holds."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> "RecordedSnapshotWrites":
        self.calls.append((name, params))
        return self

    def execute(self) -> None:
        return None


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
