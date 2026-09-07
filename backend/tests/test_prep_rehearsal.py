"""Step 3's record — the write that made the step clearable at all.

Before this, nothing wrote `prep_rehearsal`, so the ladder read step 3 as "not
started" for every user forever. These pin the two properties that keep it
honest: the state is recomputed against the LIVE questions, and it can only
ever hold questions this job actually asks.
"""
from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository
from app.services import prep_ladder, prep_rehearsal
from app.services.jd_coverage import CACHE_PROMPT_KEY

REQS = ["Own quota planning", "Run the weekly review", "Brief the exec team"]


def _coverage(requirements: list[str]) -> str:
    return json.dumps(
        {"requirements": [{"requirement": r, "status": "covered"} for r in requirements]}
    )


class _FakeRepo:
    def __init__(self, requirements: list[str] | None = None, stored: str | None = None) -> None:
        self.deepenings: dict[str, str] = {}
        if requirements is not None:
            self.deepenings[CACHE_PROMPT_KEY] = _coverage(requirements)
        if stored is not None:
            self.deepenings[prep_ladder.REHEARSAL_KEY] = stored
        self.writes: list[tuple[str, str]] = []

    def get_deepening(self, user_id: str, job_id: str, prompt_key: str) -> str | None:
        return self.deepenings.get(prompt_key)

    def upsert_deepening(self, user_id: str, job_id: str, prompt_key: str, answer: str) -> None:
        self.writes.append((prompt_key, answer))
        self.deepenings[prompt_key] = answer

    def __getattr__(self, name: str) -> Any:
        raise AssertionError(f"rehearsal reached an unmodelled repo method: {name!r}")


class TestRead:
    def test_nothing_rehearsed_yet(self) -> None:
        state = prep_rehearsal.read_state(_FakeRepo(REQS), "u1", "j1")
        assert state == {"rehearsed": [], "answered": 0, "total": 3}

    def test_no_coverage_means_no_questions(self) -> None:
        """Step 3 is downstream of step 1 and never triggers an assessment."""
        state = prep_rehearsal.read_state(_FakeRepo(), "u1", "j1")
        assert state == {"rehearsed": [], "answered": 0, "total": 0}

    def test_a_stale_entry_is_dropped_from_the_state(self) -> None:
        repo = _FakeRepo(REQS, json.dumps({"rehearsed": [REQS[0], "an old requirement"]}))
        state = prep_rehearsal.read_state(repo, "u1", "j1")
        assert state["rehearsed"] == [REQS[0]]
        assert state["answered"] == 1

    def test_a_corrupt_payload_reads_as_empty(self) -> None:
        repo = _FakeRepo(REQS, "{not json")
        assert prep_rehearsal.read_state(repo, "u1", "j1")["answered"] == 0


class TestWrite:
    def test_records_the_set(self) -> None:
        repo = _FakeRepo(REQS)
        state = prep_rehearsal.write_state(repo, "u1", "j1", [REQS[0], REQS[2]])
        assert state["answered"] == 2
        assert state["total"] == 3
        key, payload = repo.writes[0]
        assert key == prep_ladder.REHEARSAL_KEY
        assert json.loads(payload) == {"rehearsed": [REQS[0], REQS[2]]}

    def test_the_ladder_reads_what_was_written(self) -> None:
        """The write and the ladder must agree, or the pip and the panel differ."""
        repo = _FakeRepo(REQS)
        prep_rehearsal.write_state(repo, "u1", "j1", REQS)
        stored = json.loads(repo.deepenings[prep_ladder.REHEARSAL_KEY])
        assert prep_ladder.rehearsal_step(stored, REQS) == prep_ladder.CLEAR

    def test_a_requirement_this_job_never_asked_is_refused(self) -> None:
        """Otherwise the endpoint is a place to store arbitrary strings, and the
        step could be cleared without answering anything."""
        repo = _FakeRepo(REQS)
        state = prep_rehearsal.write_state(repo, "u1", "j1", ["something I made up"])
        assert state["rehearsed"] == []
        assert state["answered"] == 0

    def test_the_stored_form_is_the_jobs_wording_not_the_clients(self) -> None:
        repo = _FakeRepo(REQS)
        state = prep_rehearsal.write_state(repo, "u1", "j1", ["  own QUOTA planning "])
        assert state["rehearsed"] == [REQS[0]]

    def test_duplicates_collapse(self) -> None:
        repo = _FakeRepo(REQS)
        state = prep_rehearsal.write_state(repo, "u1", "j1", [REQS[0], REQS[0]])
        assert state["rehearsed"] == [REQS[0]]

    def test_unrehearsing_writes_the_smaller_set(self) -> None:
        repo = _FakeRepo(REQS, json.dumps({"rehearsed": REQS}))
        state = prep_rehearsal.write_state(repo, "u1", "j1", [REQS[0]])
        assert state["answered"] == 1
        assert json.loads(repo.deepenings[prep_ladder.REHEARSAL_KEY])["rehearsed"] == [REQS[0]]


@pytest.fixture
def client_repo():
    repo = _FakeRepo(REQS)
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            yield client, repo
    finally:
        app.dependency_overrides.clear()


def test_endpoint_round_trip(client_repo) -> None:
    client, _repo = client_repo
    assert client.get("/preparations/j1/rehearsal").json() == {
        "rehearsed": [], "answered": 0, "total": 3,
    }
    put = client.put("/preparations/j1/rehearsal", json={"rehearsed": [REQS[1]]})
    assert put.status_code == 200
    assert put.json() == {"rehearsed": [REQS[1]], "answered": 1, "total": 3}
    assert client.get("/preparations/j1/rehearsal").json()["answered"] == 1
