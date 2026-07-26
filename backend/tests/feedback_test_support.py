from __future__ import annotations

from typing import Any

import pytest

from app.routers import feedback as feedback_router


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class FeedbackChain:
    """PostgREST-style recorder for feedback route contract tests."""

    def __init__(self, routes: dict[str, Any]) -> None:
        self._routes = routes
        self._table: str | None = None
        self._filters: list[tuple[str, Any]] = []
        self._inserted: dict | None = None

    def table(self, name: str) -> "FeedbackChain":
        self._table = name
        self._filters = []
        self._inserted = None
        return self

    def insert(self, payload: dict) -> "FeedbackChain":
        self._inserted = payload
        return self

    def select(self, *_args: Any, **_kwargs: Any) -> "FeedbackChain":
        return self

    def eq(self, column: str, value: Any) -> "FeedbackChain":
        self._filters.append((column, value))
        return self

    def is_(self, column: str, value: Any) -> "FeedbackChain":
        self._filters.append((column, value))
        return self

    def order(self, *_args: Any, **_kwargs: Any) -> "FeedbackChain":
        return self

    def limit(self, _limit: int) -> "FeedbackChain":
        return self

    def execute(self) -> _Result:
        spec = self._routes.get(self._table) or {}
        if self._inserted is not None:
            if spec.get("insert_error") is not None:
                raise spec["insert_error"]
            row = {**self._inserted}
            row.setdefault("id", spec.get("inserted_id", 1))
            row.setdefault(
                "created_at",
                spec.get("created_at", "2026-06-14T12:00:00Z"),
            )
            return _Result([row])
        rows_sequence = spec.get("rows_sequence")
        if rows_sequence:
            return _Result(rows_sequence.pop(0))
        return _Result(spec.get("rows", []))


@pytest.fixture
def patch_admin(monkeypatch: pytest.MonkeyPatch):
    def apply(routes: dict[str, Any]) -> FeedbackChain:
        chain = FeedbackChain(routes)
        monkeypatch.setattr(feedback_router, "get_supabase_admin", lambda: chain)
        return chain

    return apply


@pytest.fixture
def patch_user(monkeypatch: pytest.MonkeyPatch):
    def apply(user_id: str | None) -> None:
        monkeypatch.setattr(
            feedback_router,
            "_resolve_user_id",
            lambda _credentials: user_id,
        )

    return apply
