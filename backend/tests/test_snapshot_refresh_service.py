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
        role_family_refresh=lambda: {},
        company_directory_refresh=lambda: {},
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
        role_family_refresh=lambda: ran.append("role_families") or {"families": 334},
        company_directory_refresh=lambda: ran.append("company_directory") or {"companies": 232},
    )

    service.process(
        ["analytics", "skill_demand", "job_search", "role_families", "company_directory"],
        trigger="batch-finalize",
        force=True,
    )

    assert ran == [
        "analytics", "skill_demand", "job_search", "role_families", "company_directory",
    ]
    assert [row["p_success"] for row in db.finished] == [False, True, True, True, True]
    assert "batch deadline" in db.finished[0]["p_error"]
    assert db.finished[1]["p_result"] == {"rows": 374}
    # The role typeahead's Tier-0 refresh is a sibling, not a special case: it
    # runs even though analytics failed first, and its result is persisted.
    assert db.finished[3]["p_result"] == {"families": 334}
    assert db.finished[4]["p_result"] == {"companies": 232}
