"""A tailored CV cannot invent an employer, a title, or a wider date span."""
from __future__ import annotations

import logging
from typing import Any

import pytest

from app.repositories.cv import CVVersionsRepository, CVVersionWriteSpec
from app.services.cv_role_guard import FabricatedRoleError, assert_matches_master, drop_invented
from app.services.cv_structured_shape import BLANK_CONTACT


def _cv(*experience: dict[str, Any]) -> dict[str, Any]:
    return {
        "contact": dict(BLANK_CONTACT),
        "summary": None,
        "education": [],
        "experience": list(experience),
        "projects": [],
        "skills_line": None,
        "certs": [],
    }


def _role(company: str, role: str, dates: str = "2020 – 2022") -> dict[str, str]:
    return {"company": company, "role": role, "dates": dates, "location": "", "bullets": ["Did the work."]}


def test_an_invented_employer_and_title_are_refused() -> None:
    master = _cv(_role("Capgemini", "Management Consulting Intern"))
    document = _cv(_role("Capgemini", "E.L.I.T.E Manager"))
    with pytest.raises(FabricatedRoleError, match="E.L.I.T.E Manager · Capgemini is not a role on your CV"):
        assert_matches_master(master, document)


def test_a_promoted_title_is_a_different_role() -> None:
    master = _cv(_role("Capgemini", "Management Consulting Intern"))
    document = _cv(_role("Capgemini", "Strategy Consultant"))
    with pytest.raises(FabricatedRoleError, match="is not a role on your CV"):
        assert_matches_master(master, document)


def test_punctuation_and_case_still_match_the_master() -> None:
    master = _cv(_role("Capgemini", "E.L.I.T.E Manager"))
    document = _cv(_role("capgemini", "ELITE Manager", "Jan 2020 – Mar 2022"))
    assert_matches_master(master, document)


def test_dates_may_narrow_and_may_not_widen() -> None:
    master = _cv(_role("Capgemini", "Intern", "2020 – 2022"))
    assert_matches_master(master, _cv(_role("Capgemini", "Intern", "Mar 2020 – Jun 2021")))
    with pytest.raises(FabricatedRoleError, match="dates go outside"):
        assert_matches_master(master, _cv(_role("Capgemini", "Intern", "2019 – Present")))


def test_a_role_added_on_the_master_passes() -> None:
    master = _cv(_role("Capgemini", "Strategy Consultant", "2021 – 2023"))
    assert_matches_master(master, _cv(_role("Capgemini", "Strategy Consultant", "2021 – 2023")))


def test_a_model_write_drops_the_invented_role_and_logs_it(caplog: pytest.LogCaptureFixture) -> None:
    master = _cv(_role("Capgemini", "Intern"))
    document = _cv(_role("Capgemini", "Intern"), _role("Capgemini", "E.L.I.T.E Manager"))
    with caplog.at_level(logging.WARNING):
        kept = drop_invented(master, document)
    assert [row["role"] for row in kept["experience"]] == ["Intern"]
    assert "metric cv.fabricated_role_dropped" in caplog.text
    assert "E.L.I.T.E Manager" in caplog.text


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _Query:
    def __init__(self, db: "_DB") -> None:
        self._db = db
        self._op = "select"
        self._cols = ""
        self._filters: dict[str, Any] = {}
        self._payload: dict[str, Any] | None = None

    def select(self, cols: str, *_a: Any, **_k: Any) -> "_Query":
        self._cols = cols
        return self

    def eq(self, key: str, value: Any) -> "_Query":
        self._filters[key] = value
        return self

    def order(self, *_a: Any, **_k: Any) -> "_Query":
        return self

    def limit(self, *_a: Any, **_k: Any) -> "_Query":
        return self

    def insert(self, payload: dict[str, Any]) -> "_Query":
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload: dict[str, Any]) -> "_Query":
        self._op = "update"
        self._payload = payload
        return self

    @property
    def not_(self) -> "_Query":
        return self

    def is_(self, *_a: Any, **_k: Any) -> "_Query":
        return self

    def execute(self) -> _Result:
        if self._op == "insert":
            assert self._payload is not None
            self._db.inserted.append(self._payload)
            return _Result([{**self._payload, "id": 9}])
        if self._op == "update":
            assert self._payload is not None
            self._db.updated.append(self._payload)
            return _Result([{"id": self._filters.get("id", 2)}])
        if self._cols == "user_version_number":
            return _Result([])
        row = self._db.rows.get(self._filters.get("id"))
        return _Result([row] if row else [])


class _DB:
    def __init__(self, rows: dict[int, dict[str, Any]]) -> None:
        self.rows = rows
        self.inserted: list[dict[str, Any]] = []
        self.updated: list[dict[str, Any]] = []

    def table(self, _name: str) -> _Query:
        return _Query(self)


def _repo(rows: dict[int, dict[str, Any]]) -> tuple[CVVersionsRepository, _DB]:
    db = _DB(rows)
    repo = CVVersionsRepository(db)  # type: ignore[arg-type]
    repo._note_tailored = lambda _user_id: None  # type: ignore[method-assign]
    return repo, db


def test_the_write_seam_refuses_an_invented_role_and_accepts_one_on_the_master() -> None:
    held = _role("Capgemini", "Intern")
    master = {
        "id": 1,
        "user_id": "u1",
        "kind": "baseline_upload",
        "cv_structured": _cv(held),
    }
    repo, db = _repo({1: master})
    invented = CVVersionWriteSpec(
        kind="deterministic",
        job_id="job-1",
        parent_version_id=1,
        body_text="tailored",
        cv_structured=_cv(_role("Capgemini", "E.L.I.T.E Manager")),
    )
    with pytest.raises(FabricatedRoleError):
        repo.create("u1", invented)
    assert db.inserted == []

    repo.create("u1", CVVersionWriteSpec(
        kind="deterministic",
        job_id="job-1",
        parent_version_id=1,
        body_text="tailored",
        cv_structured=_cv(held),
    ))
    assert db.inserted[0]["cv_structured"]["experience"][0]["role"] == "Intern"
