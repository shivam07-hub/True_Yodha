"""Tests for repositories/job_provenance.py — the provenance read model.

Covers:
- the collective split (agent is derived from total, never counted twice)
- a user's own contribution is filtered by created_by_user_id
- a failing count degrades to 0 rather than taking the surface down
- the verified-live filter asks for a cutoff, not for everything
"""

from __future__ import annotations

from typing import Any

from app.repositories import job_provenance


class _Result:
    def __init__(self, count: int | None) -> None:
        self.count = count


class _Query:
    """Records the filters applied so a test can assert what was asked for."""

    def __init__(self, client: "_FakeClient") -> None:
        self._client = client
        self.filters: dict[str, Any] = {}

    def select(self, *_a: Any, **_k: Any) -> "_Query":
        return self

    def limit(self, *_a: Any, **_k: Any) -> "_Query":
        return self

    def eq(self, column: str, value: Any) -> "_Query":
        self.filters[f"eq:{column}"] = value
        return self

    def gte(self, column: str, value: Any) -> "_Query":
        self.filters[f"gte:{column}"] = value
        return self

    def execute(self) -> _Result:
        if self._client.raise_on is not None and self._client.raise_on in self.filters:
            raise RuntimeError("upstream blew up")
        self._client.seen.append(self.filters)
        return _Result(self._client.counts.get(_key(self.filters), self._client.default))


def _key(filters: dict[str, Any]) -> str:
    """Stable name for a filter set, so a test can pin per-query counts."""
    if "eq:ingestion_source" in filters:
        return "community"
    if "eq:created_by_user_id" in filters:
        return "mine"
    if "gte:last_verified_live_at" in filters:
        return "verified"
    return "total"


class _FakeClient:
    def __init__(
        self,
        counts: dict[str, int | None],
        *,
        default: int | None = 0,
        raise_on: str | None = None,
    ) -> None:
        self.counts = counts
        self.default = default
        self.raise_on = raise_on
        self.seen: list[dict[str, Any]] = []

    def table(self, _name: str) -> _Query:
        return _Query(self)


def test_agent_is_derived_from_total() -> None:
    db = _FakeClient({"total": 62225, "community": 17, "verified": 4632})

    counts = job_provenance.read_provenance(db)

    assert counts["total"] == 62225
    assert counts["community"] == 17
    assert counts["agent"] == 62208
    assert counts["verified_live"] == 4632
    assert counts["verified_window_days"] == job_provenance.VERIFIED_WINDOW_DAYS


def test_agent_never_goes_negative() -> None:
    # A community count that somehow exceeds total (mid-write, cache skew) must
    # not render a negative bar segment.
    db = _FakeClient({"total": 5, "community": 9, "verified": 0})

    assert job_provenance.read_provenance(db)["agent"] == 0


def test_verified_live_asks_for_a_cutoff() -> None:
    db = _FakeClient({"total": 10, "community": 1, "verified": 4})

    job_provenance.read_provenance(db)

    verified = [f for f in db.seen if "gte:last_verified_live_at" in f]
    assert len(verified) == 1
    # A bare "not null" would count listings verified a year ago as live.
    assert verified[0]["gte:last_verified_live_at"]


def test_mine_is_scoped_to_the_caller() -> None:
    db = _FakeClient({"total": 100, "community": 17, "verified": 40, "mine": 3})

    counts = job_provenance.read_contributions(db, "user-abc")

    assert counts["mine"] == 3
    scoped = [f for f in db.seen if "eq:created_by_user_id" in f]
    assert scoped == [{"eq:created_by_user_id": "user-abc"}]


def test_failed_count_degrades_to_zero() -> None:
    # The counter is decoration on a landing page; an upstream blip must not
    # 500 the page. It degrades to 0 and logs.
    db = _FakeClient({"total": 100, "verified": 40}, raise_on="eq:ingestion_source")

    counts = job_provenance.read_provenance(db)

    assert counts["community"] == 0
    assert counts["total"] == 100


def test_null_count_reads_as_zero() -> None:
    db = _FakeClient({}, default=None)

    counts = job_provenance.read_provenance(db)

    assert counts == {
        "total": 0,
        "agent": 0,
        "community": 0,
        "verified_live": 0,
        "verified_window_days": job_provenance.VERIFIED_WINDOW_DAYS,
    }
