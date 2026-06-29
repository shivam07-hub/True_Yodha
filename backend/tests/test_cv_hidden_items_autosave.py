"""Option C — auto-save the playground projection in place.

PATCH /cv/versions/{id}/hidden-items updates a job's deterministic working draft
without appending a new snapshot row (Option C drops the explicit Save). Covers
the repo in-place update + the router guard that immutable snapshots are rejected.
"""
from typing import Any

import pytest
from fastapi import HTTPException

from app.repositories.cv import CVVersionsRepository
from app.routers.cv.versions import (
    HiddenItemsRequest,
    update_cv_version_hidden_items,
)


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Query:
    def __init__(self, table: str, sink: dict) -> None:
        self._table = table
        self._sink = sink
        self._op = "select"
        self._payload: Any = None

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self._op == "update":
            self._sink["update_payload"] = self._payload
            if not self._sink.get("match", True):
                return _Result([])
            return _Result([{**self._sink["row"], **self._payload}])
        return _Result([self._sink.get("row")])


class _DB:
    def __init__(self, sink: dict) -> None:
        self._sink = sink

    def table(self, name: str) -> _Query:
        return _Query(name, self._sink)


def _repo(sink: dict) -> CVVersionsRepository:
    return CVVersionsRepository(_DB(sink))  # type: ignore[arg-type]


def test_update_hidden_items_writes_projection_and_body() -> None:
    sink = {"row": {"id": 7, "kind": "deterministic", "hidden_items": []}, "match": True}
    row = _repo(sink).update_hidden_items(7, "u1", ["exp_bullet:1:foo"], "BODY")
    assert sink["update_payload"] == {
        "hidden_items": ["exp_bullet:1:foo"],
        "body_text": "BODY",
    }
    assert row["hidden_items"] == ["exp_bullet:1:foo"]


def test_update_hidden_items_404_when_not_editable_draft() -> None:
    sink = {"row": None, "match": False}
    with pytest.raises(HTTPException) as exc:
        _repo(sink).update_hidden_items(7, "u1", [], "")
    assert exc.value.status_code == 404


class _FakeRepo:
    def __init__(self, version: dict | None) -> None:
        self._version = version
        self.updated: dict | None = None

    def find(self, version_id: int, user_id: str) -> dict | None:
        return self._version

    def update_hidden_items(self, version_id, user_id, hidden_items, body_text):
        self.updated = {"hidden_items": hidden_items, "body_text": body_text}
        return {**self._version, "hidden_items": hidden_items, "body_text": body_text}


class _Principal:
    id = "u1"


def _call(repo: _FakeRepo, hidden):
    return update_cv_version_hidden_items(
        version_id=7,
        body=HiddenItemsRequest(hidden_items=hidden),
        principal=_Principal(),  # type: ignore[arg-type]
        cv_repo=repo,  # type: ignore[arg-type]
    )


def _det_row() -> dict:
    return {
        "id": 7,
        "kind": "deterministic",
        "job_id": "acme-pm",
        "cv_structured": {"contact": {"name": "Ada"}, "summary": "S", "experience": [], "projects": [], "education": [], "skills_line": "", "certs": []},
        "hidden_items": [],
        "edited_items": {},
        "body_text": "",
        "user_version_number": 3,
        "created_at": datetime_now(),
    }


def datetime_now():
    from datetime import datetime, timezone
    return datetime(2026, 6, 29, tzinfo=timezone.utc)


def test_router_persists_deterministic_job_draft() -> None:
    repo = _FakeRepo(_det_row())
    resp = _call(repo, ["summary:0:S"])
    assert repo.updated is not None
    assert resp.hidden_items == ["summary:0:S"]


def test_router_404_when_version_missing() -> None:
    with pytest.raises(HTTPException) as exc:
        _call(_FakeRepo(None), [])
    assert exc.value.status_code == 404


def test_router_400_on_immutable_snapshot() -> None:
    row = {**_det_row(), "kind": "polished"}
    with pytest.raises(HTTPException) as exc:
        _call(_FakeRepo(row), [])
    assert exc.value.status_code == 400


def test_router_400_on_master_baseline() -> None:
    row = {**_det_row(), "kind": "deterministic", "job_id": None}
    with pytest.raises(HTTPException) as exc:
        _call(_FakeRepo(row), [])
    assert exc.value.status_code == 400
