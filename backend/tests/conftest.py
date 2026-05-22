"""Shared test fixtures.

Single source of truth for the authenticated-principal shape used in
`app.dependency_overrides[get_current_user]` / `[get_principal]` test mocks.
"""
from __future__ import annotations

from app.deps import CurrentUser, Principal


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
