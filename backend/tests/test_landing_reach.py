"""Spec #66 L7 — the role the visitor picked on the landing, read against the CV
they just scored: matched and missing skills, and how many live jobs are within
reach.

Two halves: the pure index and counts, and `POST /public/score-cv` carrying the
pick as `role` + `level`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import public as public_router
from app.security import anon_rate_limit
from app.services import landing_reach, landing_roles, shared_cache
from app.services.background import debounce
from app.services.landing_reach import (
    REACH_MIN_SHARED,
    compile_family_reach,
    count_within_reach,
    role_gap,
)


def _job(band: str | None, *skills: str) -> dict[str, Any]:
    return {"seniority_level": band, "main_skills": list(skills)}


def _role(**bands: list[str]) -> dict[str, Any]:
    return {
        "family": "Business Analysis",
        "jobs": 20,
        "skills": [{"skill": "SQL (Programming Language)", "share": 0.4}, {"skill": "Stakeholder Management", "share": 0.3}],
        "bands": [
            {"band": band, "jobs": 20, "companies": 5, "thin": not skills, "skills": [{"skill": s, "share": 0.5} for s in skills]}
            for band, skills in bands.items()
        ],
    }


# ── the index ───────────────────────────────────────────────────────────────


def test_index_counts_every_job_and_folds_repeated_skill_sets() -> None:
    rows = [_job("entry", "SQL", "Excel")] * 3 + [_job("entry", "Excel", "SQL"), _job("mid", "SQL")]
    index = compile_family_reach(rows)
    assert index["jobs"] == {"entry": 4, "mid": 1}
    # The same set in any order is one entry with a count, so the cache holds
    # distinct sets, not one row per job.
    entry_sets = index["sets"]["entry"]
    assert len(entry_sets) == 1
    assert entry_sets[0][1] == 4
    assert sorted(index["vocab"][i] for i in entry_sets[0][0]) == ["Excel", "SQL"]


def test_index_files_an_unstated_level_apart_from_the_bands() -> None:
    index = compile_family_reach([_job(None, "SQL", "Excel"), _job("", "SQL", "Excel"), _job("entry", "SQL", "Excel")])
    assert index["jobs"] == {"": 2, "entry": 1}


def test_index_counts_a_job_too_thin_to_reach() -> None:
    # One named skill can never share two: it counts as open, never as reach.
    index = compile_family_reach([_job("entry", "SQL"), _job("entry")])
    assert index["jobs"] == {"entry": 2}
    assert index["sets"].get("entry", []) == []


# ── within reach ────────────────────────────────────────────────────────────


def test_within_reach_needs_two_shared_skills_at_the_level() -> None:
    assert REACH_MIN_SHARED == 2
    rows = [
        _job("entry", "SQL", "Excel", "Power BI"),  # shares SQL + Excel
        _job("entry", "SQL", "Tableau"),  # shares SQL only
        _job("entry", "Excel", "SQL"),  # shares both
        _job("mid", "SQL", "Excel"),  # another level
    ]
    index = compile_family_reach(rows)
    assert count_within_reach(index, "entry", {"SQL", "Excel"}) == (2, 3)


def test_within_reach_without_a_level_reads_every_job_in_the_role() -> None:
    rows = [_job("entry", "SQL", "Excel"), _job("mid", "SQL", "Excel"), _job(None, "SQL", "Excel"), _job("lead", "Java")]
    index = compile_family_reach(rows)
    assert count_within_reach(index, None, {"SQL", "Excel"}) == (3, 4)


def test_within_reach_matches_skill_names_whatever_their_case() -> None:
    index = compile_family_reach([_job("entry", "SQL (Programming Language)", "Excel")])
    assert count_within_reach(index, "entry", {"sql (programming language)", "EXCEL"}) == (1, 1)


def test_within_reach_of_an_empty_level_is_zero_of_zero() -> None:
    assert count_within_reach(compile_family_reach([]), "intern", {"SQL", "Excel"}) == (0, 0)


# ── the gap ─────────────────────────────────────────────────────────────────


def test_gap_reads_the_skills_the_landing_showed_for_that_level() -> None:
    role = _role(entry=["SQL (Programming Language)", "Excel", "Power BI"])
    matched, missing = role_gap(role, "entry", {"excel", "Python"})
    assert matched == ["Excel"]
    assert missing == ["SQL (Programming Language)", "Power BI"]


def test_gap_falls_back_to_the_role_when_the_level_is_thin_or_unpicked() -> None:
    role = _role(entry=[], mid=["Excel"])
    for band in ("entry", None, "executive"):
        matched, missing = role_gap(role, band, {"Stakeholder Management"})
        assert matched == ["Stakeholder Management"]
        assert missing == ["SQL (Programming Language)"]


# ── the endpoint ────────────────────────────────────────────────────────────


@dataclass
class _FakeProjection:
    total_score: float
    domain_scores: dict[str, float]


class _FakeRepo:
    def __init__(self, roles: list[dict[str, Any]], rows: list[dict[str, Any]]) -> None:
        self.roles = roles
        self.rows = rows
        self.family_reads: list[str] = []

    def compile_market_analytics(self) -> dict[str, Any]:
        return {"landing_roles": self.roles}

    def live_family_skill_rows(self, family: str) -> list[dict[str, Any]]:
        self.family_reads.append(family)
        return self.rows


@pytest.fixture(autouse=True)
def _reset(monkeypatch: pytest.MonkeyPatch):
    anon_rate_limit.reset()
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()
    monkeypatch.setattr(public_router.settings, "turnstile_enabled", False)
    monkeypatch.setattr(public_router.settings, "turnstile_secret", "", raising=False)
    yield
    anon_rate_limit.reset()
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()


def _wire(monkeypatch: pytest.MonkeyPatch, repo: _FakeRepo, held: dict[str, int]) -> None:
    async def _parse(text: str, provider: Any = None) -> dict[str, Any]:
        return {"skills_detected": [{"taxonomy_key": key} for key in held], "cv_structured": None, "provider_failed": False}

    async def _read(_data: bytes, **_kwargs: Any) -> str:
        return "x" * 400

    monkeypatch.setattr(public_router.cv_parser, "read_cv_file", _read)
    monkeypatch.setattr(public_router.cv_parser, "parse_cv_text", _parse)
    monkeypatch.setattr(public_router, "get_cv_upload_provider", lambda: object())
    monkeypatch.setattr(public_router, "build_skill_level_map", lambda _signals: dict(held))
    monkeypatch.setattr(public_router, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(public_router, "ScoresRepository", lambda db: object())
    monkeypatch.setattr(
        public_router,
        "project_score",
        lambda repo, level_map, include_market_signals=True, target_seniority=None: _FakeProjection(
            total_score=61.0, domain_scores={"Data": 70.0}
        ),
    )
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: repo)
    monkeypatch.setattr(landing_reach, "get_public_jobs_repository", lambda: repo)


def _post(**form: str) -> Any:
    return TestClient(app).post("/public/score-cv", files={"file": ("cv.pdf", b"x" * 500, "application/pdf")}, data=form)


def test_score_cv_reads_the_cv_against_the_picked_role(monkeypatch: pytest.MonkeyPatch) -> None:
    role = _role(entry=["SQL (Programming Language)", "Excel", "Power BI"])
    rows = [_job("entry", "SQL (Programming Language)", "Excel"), _job("entry", "Power BI", "Excel"), _job("mid", "Excel")]
    repo = _FakeRepo([role], rows)
    _wire(monkeypatch, repo, {"SQL (Programming Language)": 3, "Excel": 2, "Dormant": 0})

    res = _post(role="Business Analysis", level="entry")
    assert res.status_code == 200
    assert res.json()["target"] == {
        "family": "Business Analysis",
        "band": "entry",
        "jobs": 2,
        "within_reach": 1,
        "matched": ["SQL (Programming Language)", "Excel"],
        "missing": ["Power BI"],
    }


def test_score_cv_reads_a_family_once_for_every_visitor(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo([_role(entry=["Excel"])], [_job("entry", "Excel", "SQL")])
    _wire(monkeypatch, repo, {"Excel": 2, "SQL": 2})
    assert _post(role="Business Analysis", level="entry").status_code == 200
    assert _post(role="Business Analysis").status_code == 200
    assert repo.family_reads == ["Business Analysis"]


def test_score_cv_without_a_level_reads_the_whole_role(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo([_role(entry=["Excel"])], [_job("entry", "Excel", "SQL"), _job(None, "Excel", "SQL")])
    _wire(monkeypatch, repo, {"Excel": 2, "SQL": 2})
    target = _post(role="Business Analysis").json()["target"]
    assert target["band"] is None
    assert (target["within_reach"], target["jobs"]) == (2, 2)


@pytest.mark.parametrize(
    "form",
    [{}, {"role": "Astronaut", "level": "entry"}, {"role": "Business Analysis", "level": "wizard"}],
)
def test_score_cv_reads_no_role_it_does_not_offer(monkeypatch: pytest.MonkeyPatch, form: dict[str, str]) -> None:
    # Only the landing's own roles and the six bands: a free-text role would let
    # anyone make the server page through any family.
    repo = _FakeRepo([_role(entry=["Excel"])], [_job("entry", "Excel", "SQL")])
    _wire(monkeypatch, repo, {"Excel": 2})
    res = _post(**form)
    assert res.status_code == 200
    assert res.json()["target"] is None
    assert repo.family_reads == []


def test_score_cv_reads_a_searched_family_like_a_chip(monkeypatch: pytest.MonkeyPatch) -> None:
    # L2b: a family found by the hero's search, past the eight chips, carries
    # into the upload and is read against the CV the same way.
    chips = [{**_role(entry=["Excel"]), "family": f"Chip {i}"} for i in range(landing_roles.ROLES_SHOWN)]
    searched = {**_role(entry=["SQL (Programming Language)", "Tableau"]), "family": "Data Analysis"}
    repo = _FakeRepo([*chips, searched], [_job("entry", "SQL (Programming Language)", "Excel")])
    _wire(monkeypatch, repo, {"SQL (Programming Language)": 3, "Excel": 2})

    target = _post(role="Data Analysis", level="entry").json()["target"]
    assert target["family"] == "Data Analysis"
    assert (target["matched"], target["missing"]) == (["SQL (Programming Language)"], ["Tableau"])
    assert (target["within_reach"], target["jobs"]) == (1, 1)
    assert repo.family_reads == ["Data Analysis"]
