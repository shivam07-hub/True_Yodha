"""The family pile carries the person's year span to the SQL (migration
20261127120000), and a caller without one reads exactly as before."""

from __future__ import annotations

from typing import Any

from app.repositories import live_list
from app.repositories.jobs import JobsRepository
from app.services.job_eligibility import person_year_span


class _Rpc:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> "_Rpc":
        self.calls.append((name, params))
        return self

    def execute(self) -> "_Rpc":
        return self

    @property
    def data(self) -> list[dict[str, Any]]:
        return [{"job_id": "j1"}]


def test_a_year_span_becomes_the_top_and_the_centre() -> None:
    db = _Rpc()
    ids = live_list.jobs_for_families(db, ["Banking Services"], year_span=(-1.0, 1.0), limit=50)  # type: ignore[arg-type]

    assert ids == ["j1"]
    [(name, params)] = db.calls
    assert name == "live_jobs_for_families"
    assert (params["p_year_hi"], params["p_centre"]) == (1.0, 0.0)


def test_no_span_sends_no_level_parameters() -> None:
    db = _Rpc()
    live_list.jobs_for_families(db, ["Banking Services"], limit=50)  # type: ignore[arg-type]

    [(_name, params)] = db.calls
    assert "p_year_hi" not in params and "p_centre" not in params


def test_the_repository_turns_a_profile_into_its_year_span() -> None:
    db = _Rpc()
    profile = {"target_seniority": "intern", "years_experience": None}

    JobsRepository(db).get_candidate_job_ids_for_roles(["Banking Services"], profile=profile)  # type: ignore[arg-type]

    lo, hi = person_year_span(profile)
    [(_name, params)] = db.calls
    assert (params["p_year_hi"], params["p_centre"]) == (hi, (lo + hi) / 2)
