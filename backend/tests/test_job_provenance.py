"""Tests for repositories/job_provenance.py — the provenance read model.

The counts are Tier 0 (migration 20261019090000): this module reads one row of
`public_provenance_snapshot` and counts nothing, except the caller's own `mine`.

Covers:
- the row becomes the payload; agent is derived from total, never counted
- no row, or a failed read, is no number: every field zero together
- the provenance read never counts `jobs`
- a user's own contribution is the one live count, filtered by created_by_user_id
"""

from __future__ import annotations

from typing import Any

from app.repositories import job_provenance


class _Result:
    def __init__(self, *, data: list[dict[str, Any]] | None = None, count: int | None = None) -> None:
        self.data = data
        self.count = count


class _Query:
    def __init__(self, client: "_FakeClient", table: str) -> None:
        self._client = client
        self._table = table
        self.filters: dict[str, Any] = {}
        self.counted = False

    def select(self, *_a: Any, **kwargs: Any) -> "_Query":
        self.counted = kwargs.get("count") == "exact"
        return self

    def limit(self, *_a: Any, **_k: Any) -> "_Query":
        return self

    def eq(self, column: str, value: Any) -> "_Query":
        self.filters[column] = value
        return self

    def execute(self) -> _Result:
        if self._table in self._client.raise_on:
            raise RuntimeError("upstream blew up")
        self._client.seen.append((self._table, self.counted, dict(self.filters)))
        if self._table == "public_provenance_snapshot":
            return _Result(data=self._client.rows)
        return _Result(count=self._client.mine)


class _FakeClient:
    def __init__(
        self,
        rows: list[dict[str, Any]] | None,
        *,
        mine: int | None = 0,
        raise_on: tuple[str, ...] = (),
    ) -> None:
        self.rows = rows
        self.mine = mine
        self.raise_on = raise_on
        self.seen: list[tuple[str, bool, dict[str, Any]]] = []

    def table(self, name: str) -> _Query:
        return _Query(self, name)


def _row(**overrides: int) -> dict[str, int]:
    row = {"total": 71852, "community": 8, "verified_live": 6221, "verified_window_days": 7}
    row.update(overrides)
    return row


def test_the_row_is_the_payload() -> None:
    db = _FakeClient([_row()])

    counts = job_provenance.read_provenance(db)

    assert counts == {
        "total": 71852,
        "agent": 71844,
        "community": 8,
        "verified_live": 6221,
        "verified_window_days": 7,
    }
    assert db.seen == [("public_provenance_snapshot", False, {"id": 1})]


def test_agent_never_goes_negative() -> None:
    # A community count that somehow exceeds total must not render a negative
    # bar segment.
    db = _FakeClient([_row(total=5, community=9)])

    assert job_provenance.read_provenance(db)["agent"] == 0


def test_the_provenance_read_counts_nothing() -> None:
    """Counted per request, `verified_live` averaged 3.3s and hit the 8s
    ceiling. The answer lives in the snapshot; `jobs` is not asked."""
    db = _FakeClient([_row()])

    job_provenance.read_provenance(db)

    assert all(table != "jobs" and not counted for table, counted, _ in db.seen)


def test_no_row_is_no_number() -> None:
    db = _FakeClient([])

    counts = job_provenance.read_provenance(db)

    assert counts == {
        "total": 0,
        "agent": 0,
        "community": 0,
        "verified_live": 0,
        "verified_window_days": 0,
    }


def test_a_failed_read_is_no_number_not_a_half() -> None:
    # Never a real total beside a zero that only means one count failed: the
    # counts arrive together or not at all.
    db = _FakeClient([_row()], raise_on=("public_provenance_snapshot",))

    counts = job_provenance.read_provenance(db)

    assert set(counts.values()) == {0}


def test_mine_is_scoped_to_the_caller() -> None:
    db = _FakeClient([_row()], mine=3)

    counts = job_provenance.read_contributions(db, "user-abc")

    assert counts["mine"] == 3
    assert counts["verified_live"] == 6221
    live = [(table, filters) for table, counted, filters in db.seen if counted]
    assert live == [("jobs", {"created_by_user_id": "user-abc"})]


def test_a_failed_mine_count_degrades_to_zero() -> None:
    db = _FakeClient([_row()], raise_on=("jobs",))

    counts = job_provenance.read_contributions(db, "user-abc")

    assert counts["mine"] == 0
    assert counts["total"] == 71852
