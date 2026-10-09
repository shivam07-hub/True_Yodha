from __future__ import annotations

from typing import Any

from app.services.snapshot_refresh import SnapshotRefreshService


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _RPC:
    def __init__(self, db: "_DB", name: str, params: dict[str, Any]) -> None:
        self._db = db
        self._name = name
        self._params = params

    def execute(self) -> _Result:
        self._db.calls.append((self._name, self._params))
        if self._name == "request_snapshot_refresh":
            return _Result([{"task": task} for task in self._db.requested])
        if self._name == "claim_snapshot_refresh":
            return _Result(True)
        if self._name == "finish_snapshot_refresh":
            self._db.finished.append(self._params)
            return _Result(None)
        raise AssertionError(self._name)


class _DB:
    def __init__(self) -> None:
        self.requested = ["analytics", "skill_demand", "job_search"]
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.finished: list[dict[str, Any]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _RPC:
        return _RPC(self, name, params)


def test_request_is_one_fast_persisted_rpc() -> None:
    db = _DB()
    service = SnapshotRefreshService(
        db,
        analytics_refresh=lambda *_: {},
        skill_refresh=lambda: {},
        search_refresh=lambda: {},
    )

    assert service.request(trigger="batch-finalize", force=True) == db.requested
    assert db.calls == [(
        "request_snapshot_refresh",
        {"p_trigger": "batch-finalize", "p_force": True},
    )]


def test_one_refresh_failure_is_persisted_and_does_not_gate_the_others() -> None:
    db = _DB()
    ran: list[str] = []

    def analytics(_trigger: str, _force: bool) -> dict[str, Any]:
        ran.append("analytics")
        raise TimeoutError("analytics exceeded its batch deadline")

    service = SnapshotRefreshService(
        db,
        analytics_refresh=analytics,
        skill_refresh=lambda: ran.append("skill_demand") or {"rows": 374},
        search_refresh=lambda: ran.append("job_search") or {"rows": 74379},
    )

    service.process(
        ["analytics", "skill_demand", "job_search"],
        trigger="batch-finalize",
        force=True,
    )

    assert ran == ["analytics", "skill_demand", "job_search"]
    assert [row["p_success"] for row in db.finished] == [False, True, True]
    assert "batch deadline" in db.finished[0]["p_error"]
    assert db.finished[1]["p_result"] == {"rows": 374}


def test_the_in_database_tasks_are_never_claimed_over_postgrest() -> None:
    """A scraper finalize marks every task pending, and `request` hands all of
    them back. role_families, skill_closeness and company_pulse cannot finish
    as `authenticator` (safeupdate, 8s) — they failed that way for 26 days.
    Their pending rows are left for pg_cron's `run_snapshot_sql_refresh`."""
    db = _DB()
    db.requested = ["role_families", "skill_closeness", "company_pulse", "company_directory", "ghost_index"]
    service = SnapshotRefreshService(
        db,
        analytics_refresh=lambda *_: {},
        skill_refresh=lambda: {},
        search_refresh=lambda: {},
    )

    tasks = service.request(trigger="batch-finalize", force=True)
    service.process(list(db.requested), trigger="batch-finalize", force=True)

    assert tasks == []
    assert [name for name, _ in db.calls] == ["request_snapshot_refresh"]


def test_staleness_is_one_rule_and_never_succeeded_is_stale() -> None:
    from datetime import datetime, timedelta, timezone

    from app.services.snapshot_refresh import STALE_AFTER, is_stale

    now = datetime(2026, 10, 4, 8, 0, tzinfo=timezone.utc)
    assert is_stale(None, now)
    assert is_stale((now - STALE_AFTER - timedelta(minutes=1)).isoformat(), now)
    assert not is_stale((now - STALE_AFTER + timedelta(minutes=1)).isoformat(), now)
    # role_families on 2026-10-03: last success 2026-09-07.
    assert is_stale("2026-09-07T19:52:21+00:00", now)
