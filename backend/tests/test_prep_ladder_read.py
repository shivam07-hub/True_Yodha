"""`/preparations/ladder` — its read shape, its width, and what it answers.

Two separate failures are guarded here. The read SET is what costs round trips
(~165ms each on this path); the fan-out WIDTH is what silently grows and eats
slots of the process-wide read budget. `/jobs/matches` ran over budget for
weeks with an unchanged read set.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.jobs import get_token_jobs_repository
from app.services import prep_ladder, prep_ladder_read
from app.services.concurrent_reads import READ_CONTRACT_MAX_SECTIONS, section_budget

_LADDER_LABEL = "preparations.ladder"


def _skill(job_id: str, key: str, level: int, *, levelled: bool = True) -> dict[str, Any]:
    return {
        "job_id": job_id,
        "is_primary": True,
        "required_level": level,
        "skills": {
            "taxonomy_key": key,
            "practice_mode": "levelled" if levelled else "scenario",
            "skill_kind": "hard",
        },
    }


class _FakeRepo:
    """Counts every read the assembler performs, and models only the four it may make."""

    def __init__(
        self,
        rooms: list[dict[str, Any]] | None = None,
        deepenings: dict[str, dict[str, str]] | None = None,
        skill_rows: list[dict[str, Any]] | None = None,
        user_levels: dict[str, int] | None = None,
    ) -> None:
        self.calls: list[str] = []
        self._rooms = rooms if rooms is not None else []
        self._deepenings = deepenings or {}
        self._skill_rows = skill_rows or []
        self._user_levels = user_levels or {}

    def get_application_rooms(self, user_id: str) -> list[dict[str, Any]]:
        self.calls.append("get_application_rooms")
        return self._rooms

    def get_deepenings_for_jobs(
        self, user_id: str, job_ids: list[str], prompt_keys: tuple[str, ...]
    ) -> dict[str, dict[str, str]]:
        self.calls.append("get_deepenings_for_jobs")
        assert set(prompt_keys) == set(prep_ladder.DEEPENING_KEYS)
        return {jid: self._deepenings.get(jid, {}) for jid in job_ids}

    def get_all_job_skill_rows(self, *, job_ids: list[str] | None = None) -> list[dict[str, Any]]:
        self.calls.append("get_all_job_skill_rows")
        return [r for r in self._skill_rows if r["job_id"] in (job_ids or [])]

    def get_user_skill_map(self, user_id: str) -> dict[str, int]:
        self.calls.append("get_user_skill_map")
        return self._user_levels

    def __getattr__(self, name: str) -> Any:
        raise AssertionError(
            f"/preparations/ladder called an unmodelled repo method: {name!r}. "
            "A new read must fit the read contract (ARCHITECTURE_READ_PATH.md §2), "
            "not just be added to this fake."
        )


_EXPECTED_READS = {
    "get_application_rooms",
    "get_deepenings_for_jobs",
    "get_all_job_skill_rows",
    "get_user_skill_map",
}


def _board() -> _FakeRepo:
    """Three live rooms and one closed, roughly the design's Sanofi board."""
    return _FakeRepo(
        rooms=[
            {"job_id": "j1", "status": "interviewing", "company": "Sanofi"},
            {"job_id": "j2", "status": "applied", "company": "3M"},
            {"job_id": "j3", "status": "applied", "company": "OpenAI"},
            {"job_id": "j4", "status": "rejected", "company": "Deloitte"},
        ],
        deepenings={
            "j1": {
                prep_ladder.COVERAGE_KEY: json.dumps(
                    {"requirements": [{"requirement": "r1", "status": "covered"}]}
                ),
                prep_ladder.REHEARSAL_KEY: json.dumps({"answered": 1, "total": 4}),
            },
        },
        skill_rows=[
            _skill("j1", "Key Performance Indicators (KPIs)", 3),
            _skill("j2", "Key Performance Indicators (KPIs)", 3),
            _skill("j3", "Key Performance Indicators (KPIs)", 3),
            _skill("j2", "Data Analysis", 2),
        ],
        user_levels={},
    )


class TestReadShape:
    def test_read_set_has_not_grown(self) -> None:
        repo = _board()
        prep_ladder_read.assemble(repo, "u1")
        assert set(repo.calls) == _EXPECTED_READS, (
            f"ladder read set changed: {sorted(set(repo.calls))}. Fold a new read "
            "into the existing wave or precompute it."
        )

    def test_each_read_runs_once(self) -> None:
        repo = _board()
        prep_ladder_read.assemble(repo, "u1")
        for name in _EXPECTED_READS:
            assert repo.calls.count(name) == 1, f"{name} ran {repo.calls.count(name)} times"

    def test_an_empty_board_reads_nothing_further(self) -> None:
        """No rooms, no wave — a new user must not pay three reads to be told so."""
        repo = _FakeRepo(rooms=[])
        prep_ladder_read.assemble(repo, "u1")
        assert repo.calls == ["get_application_rooms"]

    def test_fanout_is_within_budget(self, monkeypatch) -> None:
        widths: list[int] = []
        real = prep_ladder_read.run_concurrently

        def _spy(sections, *, label=""):
            if label == _LADDER_LABEL:
                widths.append(len(sections))
            return real(sections, label=label)

        monkeypatch.setattr(prep_ladder_read, "run_concurrently", _spy)
        prep_ladder_read.assemble(_board(), "u1")

        assert widths, f"ladder no longer fans out under the label {_LADDER_LABEL!r}"
        assert max(widths) <= section_budget(_LADDER_LABEL) == READ_CONTRACT_MAX_SECTIONS


class TestAssembly:
    def test_only_live_rooms_appear(self) -> None:
        result = prep_ladder_read.assemble(_board(), "u1")
        assert [room["job_id"] for room in result["rooms"]] == ["j1", "j2", "j3"]
        assert result["totals"]["rooms"] == 3

    def test_a_closed_room_never_drags_the_totals(self) -> None:
        """A rejected application is the past, not a stall on the board."""
        result = prep_ladder_read.assemble(_board(), "u1")
        assert result["totals"]["rooms"] == 3

    def test_steps_read_the_signals_that_exist(self) -> None:
        rooms = {r["job_id"]: r for r in prep_ladder_read.assemble(_board(), "u1")["rooms"]}
        # j1: coverage all covered → clear; no levels held → 0; rehearsal 1/4 → started.
        assert rooms["j1"]["steps"] == [2, 0, 1, 0]
        assert rooms["j1"]["current_step"] == 2
        # j2/j3: no cached coverage, no rehearsal, no brief.
        assert rooms["j3"]["steps"] == [0, 0, 0, 0]

    def test_a_room_with_no_levelled_skills_clears_step_two(self) -> None:
        repo = _FakeRepo(rooms=[{"job_id": "j9", "status": "applied", "company": "A"}])
        result = prep_ladder_read.assemble(repo, "u1")
        assert result["rooms"][0]["steps"][1] == prep_ladder.CLEAR

    def test_training_is_matched_from_the_boards_own_gaps(self) -> None:
        result = prep_ladder_read.assemble(_board(), "u1")
        training = result["training"]
        assert len(training) == 3
        assert training[0]["program_id"] == "pm"
        assert training[0]["why"] == (
            "Covers Key Performance Indicators · the L3 ask in 3 of your rooms"
        )

    def test_a_non_levelled_ask_is_still_a_gap_the_rail_can_answer(self) -> None:
        """`is_levelled_skill` False means /practice cannot serve it at all."""
        repo = _FakeRepo(
            rooms=[{"job_id": "j1", "status": "applied", "company": "Sanofi"}],
            skill_rows=[_skill("j1", "Product Management", 3, levelled=False)],
        )
        result = prep_ladder_read.assemble(repo, "u1")
        assert result["training"][0]["why"] == (
            "Covers Product Management · the one level with no drill yet"
        )

    def test_empty_board_answers_without_claiming_a_stall(self) -> None:
        result = prep_ladder_read.assemble(_FakeRepo(rooms=[]), "u1")
        assert result["rooms"] == []
        assert result["training"] == []
        assert result["training_note"] == "Nothing in your live rooms is short a level right now."


def test_endpoint_returns_the_ladder() -> None:
    repo = _board()
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            response = client.get("/preparations/ladder")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert len(body["rooms"]) == 3
    assert body["totals"]["bottleneck_step"] in (1, 2, 3, 4)
    assert len(body["training"]) == 3
    # The response carries no role/company — /preparations already holds them.
    assert set(body["rooms"][0]) == {"job_id", "steps", "pct", "current_step"}
