"""The CV of record, captured when a job is marked applied.

Two apply paths existed and only the builder remembered anything. On prod, 67
users had moved a job past `saved` and 3 had an application attempt. These lock
the rules that make the tracker path trustworthy rather than merely present.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app.services import cv_of_record as svc


class _FakeDB:
    """Routes the three reads and one write this service issues."""

    def __init__(self, *, existing: list, versions: list, explode: bool = False) -> None:
        self.existing = existing
        self.versions = versions
        self.explode = explode
        self.inserted: list[dict[str, Any]] = []
        self._table = ""

    def table(self, name: str) -> "_FakeDB":
        self._table = name
        return self

    def select(self, *_a, **_k) -> "_FakeDB":
        return self

    def eq(self, *_a, **_k) -> "_FakeDB":
        return self

    def order(self, *_a, **_k) -> "_FakeDB":
        return self

    def limit(self, *_a, **_k) -> "_FakeDB":
        return self

    def insert(self, row: dict[str, Any]) -> "_FakeDB":
        self.inserted.append(row)
        return self

    def execute(self) -> Any:
        if self.explode:
            raise RuntimeError("data api down")
        data = {
            "cv_application_attempts": self.existing,
            "cv_versions": self.versions,
            "job_applications": [{"job_id": "j1", "job_title": "Analyst", "company_name": "Acme"}],
        }.get(self._table, [])
        return type("R", (), {"data": data})()


def _version(**over: Any) -> dict[str, Any]:
    base = {
        "id": 1, "job_id": None, "kind": "baseline_upload", "user_version_number": 1,
        "title": "CV", "cv_structured": {"x": 1}, "body_text": "body",
        "polished_text": None, "hidden_items": [], "created_at": "2026-09-01T00:00:00Z",
    }
    base.update(over)
    return base


def _wire(monkeypatch: pytest.MonkeyPatch, db: _FakeDB) -> _FakeDB:
    monkeypatch.setattr(svc, "get_supabase_admin", lambda: db)
    return db


def test_a_submission_is_never_overwritten(monkeypatch: pytest.MonkeyPatch) -> None:
    """A second row for the same job would make the version history claim they
    applied twice."""
    db = _wire(monkeypatch, _FakeDB(existing=[{"id": "a1"}], versions=[_version()]))
    svc.record_on_apply("u1", "j1")
    assert db.inserted == []


def test_a_cv_tailored_for_this_job_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    """That is the whole point of tailoring, and it mirrors the client's
    `latestCVVersionForJob` so room and record cannot disagree."""
    db = _wire(monkeypatch, _FakeDB(existing=[], versions=[
        _version(id=9, created_at="2026-09-05T00:00:00Z"),
        _version(id=4, job_id="j1", kind="tailored", user_version_number=2),
        _version(id=3, job_id="j1", kind="tailored", user_version_number=1),
    ]))
    svc.record_on_apply("u1", "j1")
    assert db.inserted[0]["cv_version_id"] == 4


def test_an_upload_still_counts_when_nothing_is_tailored(monkeypatch: pytest.MonkeyPatch) -> None:
    """382 users have uploaded a CV and 14 have ever edited one. Excluding
    baselines would record nothing for almost everybody and leave this exactly
    as broken as it was."""
    db = _wire(monkeypatch, _FakeDB(existing=[], versions=[_version(id=7)]))
    svc.record_on_apply("u1", "j1")
    assert db.inserted[0]["cv_version_id"] == 7


def test_applying_with_no_cv_records_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    """An empty snapshot would put a row in their history saying they applied
    with nothing."""
    db = _wire(monkeypatch, _FakeDB(existing=[], versions=[]))
    svc.record_on_apply("u1", "j1")
    assert db.inserted == []


def test_the_row_says_how_it_was_captured(monkeypatch: pytest.MonkeyPatch) -> None:
    """A builder snapshot is the exact rendered CV the user pressed Apply on.
    This is the CV they had when they said they applied. Conflating them would
    be the quiet kind of lie."""
    db = _wire(monkeypatch, _FakeDB(existing=[], versions=[_version()]))
    svc.record_on_apply("u1", "j1")
    assert db.inserted[0]["cv_snapshot"]["captured"] == svc.CAPTURE_STATUS_CHANGE


def test_the_snapshot_matches_the_builders_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    """One version history reads rows from both paths."""
    db = _wire(monkeypatch, _FakeDB(existing=[], versions=[_version()]))
    svc.record_on_apply("u1", "j1")
    snapshot = db.inserted[0]["cv_snapshot"]
    for key in ("text", "title", "company", "structured", "hidden"):
        assert key in snapshot


def test_a_capture_failure_never_breaks_the_status_change(monkeypatch: pytest.MonkeyPatch) -> None:
    """A status change is the user telling us something true about their job
    hunt. Failing it because a CV lookup went wrong trades the thing they care
    about for the thing we care about."""
    _wire(monkeypatch, _FakeDB(existing=[], versions=[], explode=True))
    svc.record_on_apply("u1", "j1")  # must not raise


def test_capture_fires_only_on_the_first_move_into_applied() -> None:
    """Re-marking an already-applied job is not a second application."""
    router = (Path(svc.__file__).parents[1] / "routers/jobs/apply.py").read_text()
    assert 'if body.status == "applied" and prior_status != "applied":' in router
    assert "cv_of_record.record_on_apply(user_id, job_id)" in router
