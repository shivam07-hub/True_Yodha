"""PR-3 — living-master autosave (CVVersionsRepository.update_master).

Verifies the non-destructive mutate path: snapshot the current master into
cv_master_revisions, then UPDATE the master row in place with recompute reset.
"""
from typing import Any

import pytest
from fastapi import HTTPException

from app.repositories.cv import CVVersionsRepository


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Query:
    """Chainable stub — records the terminal op + payload, returns canned data."""

    def __init__(self, table: str, sink: dict) -> None:
        self._table = table
        self._sink = sink
        self._op = "select"
        self._payload: Any = None

    def select(self, *_a, **_k):  # noqa: ANN002
        self._op = "select"
        return self

    def insert(self, payload):  # noqa: ANN001
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):  # noqa: ANN001
        self._op = "update"
        self._payload = payload
        return self

    def eq(self, *_a, **_k):  # noqa: ANN002
        return self

    def order(self, *_a, **_k):  # noqa: ANN002
        return self

    def limit(self, *_a, **_k):  # noqa: ANN002
        return self

    def execute(self):
        if self._table == "cv_versions" and self._op == "select":
            return _Result([self._sink["master"]])
        if self._table == "cv_versions" and self._op == "update":
            self._sink["update_payload"] = self._payload
            merged = {**self._sink["master"], **self._payload}
            return _Result([merged])
        if self._table == "cv_master_revisions" and self._op == "select":
            return _Result(self._sink.get("revisions", []))
        if self._table == "cv_master_revisions" and self._op == "insert":
            self._sink["snapshot"] = self._payload
            return _Result([self._payload])
        return _Result([])


class _FakeDB:
    def __init__(self, sink: dict) -> None:
        self._sink = sink

    def table(self, name: str) -> _Query:
        return _Query(name, self._sink)


def _structured(summary: str) -> dict:
    """A full contract payload. `update_master` rejects a partial one — a half-written
    `cv_structured` is what left six users' CV page 500ing on every load."""
    return {
        "contact": {"name": "", "title": "", "email": "", "phone": "", "location": "", "linkedin": ""},
        "summary": summary,
        "education": [],
        "experience": [],
        "projects": [],
        "skills_line": None,
        "certs": [],
    }


def test_update_master_snapshots_then_mutates() -> None:
    sink = {
        "master": {
            "id": 42,
            "user_id": "u1",
            "kind": "baseline_upload",
            "user_version_number": 7,
            "body_text": "old body",
            "cv_structured": _structured("old"),
            "snapshot_hash": "oldhash",
        },
        "revisions": [{"revision_number": 2}],  # → next is 3
    }
    repo = CVVersionsRepository(_FakeDB(sink))  # type: ignore[arg-type]

    updated = repo.update_master(
        "u1",
        body_text="new body",
        cv_structured=_structured("new"),
        snapshot_hash="newhash",
    )

    # 1. Prior content snapshotted before overwrite.
    snap = sink["snapshot"]
    assert snap["master_version_id"] == 42
    assert snap["revision_number"] == 3
    assert snap["body_text"] == "old body"
    assert snap["cv_structured"] == _structured("old")

    # 2. Master mutated in place + recompute reset for the shimmer.
    upd = sink["update_payload"]
    assert upd["body_text"] == "new body"
    assert upd["cv_structured"] == _structured("new")
    assert upd["recompute_finished_at"] is None
    assert upd["confidence_label"] == "user-edited"
    assert updated["id"] == 42


def test_update_master_404_without_baseline() -> None:
    repo = CVVersionsRepository(_FakeDB({"master": None}))  # type: ignore[arg-type]
    with pytest.raises(HTTPException) as exc:
        repo.update_master("u1", body_text="x", cv_structured={})
    assert exc.value.status_code == 404


def test_first_revision_number_is_one() -> None:
    sink = {
        "master": {"id": 9, "user_id": "u1", "body_text": "b", "cv_structured": {}, "snapshot_hash": None},
        "revisions": [],
    }
    repo = CVVersionsRepository(_FakeDB(sink))  # type: ignore[arg-type]
    repo.update_master("u1", body_text="n", cv_structured={})
    assert sink["snapshot"]["revision_number"] == 1
