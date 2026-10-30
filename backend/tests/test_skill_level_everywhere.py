"""One skill level, one name, on every surface (CONTEXT → Skill Level and Role Standing).

Measured 2026-10-27: Career Path ran its own rule — on the CV only with a quoted
line, and then the CV level even when practice proved higher — and disagreed with
Role Standing for 16 people. The demand snapshot re-typed `level_of` inline. The
level's name was stored per row and had drifted on 16 of them; "Legend" (L5) was
never once stored. `mirror_scores.skill_scores` was written `{}` on every score.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest

from app.services import career_skill_path_cards as cards
from app.services.scoring import level_name

ROOT = Path(__file__).resolve().parents[2]


# ── the level's name is derived, never stored ───────────────────────────────

@pytest.mark.parametrize(
    ("level", "name"),
    [(1, "Scout"), (2, "Trailblazer"), (3, "Excavator"), (4, "Cartographer"), (5, "Legend"), (0, "Scout"), (None, "Scout")],
)
def test_every_level_has_one_name(level: Any, name: str) -> None:
    assert level_name(level) == name


# ── Career Path reads level_of ──────────────────────────────────────────────

_MARKET = [{
    "taxonomy_key": "Cold Calling", "band_job_count": 10, "primary_job_count": 8,
    "has_side_skill": False, "skill_job_count": 8,
}]


def _card(monkeypatch: pytest.MonkeyPatch, cv_row: dict[str, Any] | None, assessed: int) -> dict[str, Any]:
    built = cards.build_band(
        kind="anchor", seniority="mid", market=_MARKET,
        skills={"Cold Calling": {"id": 1, "display_name": "Cold Calling"}},
        user_rows={1: cv_row} if cv_row else {},
        assessed={1: assessed} if assessed else {},
        ladders={}, requests={}, certs={},
    )
    return built["cards"][0]


def test_practice_above_the_cv_shows_the_proven_level(monkeypatch: pytest.MonkeyPatch) -> None:
    """The person Career Path showed L1 while Role Standing said L3."""
    card = _card(monkeypatch, {"matched_level": 1, "evidence_text": "Ran outbound."}, 3)
    assert card["current_level"] == 3
    assert card["state"] == "practised"
    assert card["evidence_pointer"] is None


def test_a_tie_goes_to_the_cv(monkeypatch: pytest.MonkeyPatch) -> None:
    card = _card(monkeypatch, {"matched_level": 3, "evidence_text": "Ran outbound."}, 3)
    assert card["current_level"] == 3
    assert card["state"] == "on_cv"
    assert card["evidence_pointer"] == "Ran outbound."


def test_a_cv_skill_without_a_quoted_line_is_still_on_the_cv(monkeypatch: pytest.MonkeyPatch) -> None:
    """Shivam, 2026-10-27: 19 of 6,730 CV skills kept no line — a parser gap."""
    card = _card(monkeypatch, {"matched_level": 2, "evidence_text": ""}, 0)
    assert card["state"] == "on_cv"
    assert card["current_level"] == 2
    assert card["evidence_pointer"] is None


def test_neither_is_not_evidenced(monkeypatch: pytest.MonkeyPatch) -> None:
    card = _card(monkeypatch, None, 0)
    assert card["state"] == "not_evidenced"
    assert card["current_level"] is None


# ── the demand snapshot reads level_of and names the level ──────────────────

class _Rows:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def __getattr__(self, _name: str) -> Any:
        return lambda *a, **k: self

    def execute(self) -> Any:
        return type("R", (), {"data": self._rows})()


class _DB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables

    def table(self, name: str) -> _Rows:
        return _Rows(self._tables.get(name, []))


def test_the_demand_snapshot_takes_the_higher_level_and_names_it() -> None:
    from app.repositories.jobs import JobsRepository

    skill = {"id": 1, "taxonomy_key": "Cold Calling", "display_name": "Cold Calling", "practice_mode": "levelled"}
    other = {"id": 2, "taxonomy_key": "Negotiation", "display_name": "Negotiation", "practice_mode": "levelled"}
    db = _DB({
        "user_skills": [
            {"matched_level": 2, "proficiency_title": "Scout", "skills": skill},
            {"matched_level": 5, "proficiency_title": "Scout", "skills": other},
        ],
        "skill_assessed_level": [{"assessed_level": 3, "skills": skill}],
    })
    repo = JobsRepository(db, db)  # type: ignore[arg-type]
    repo._job_demand_counts = lambda ids: ({i: 0 for i in ids}, {i: 0 for i in ids})  # type: ignore[method-assign]

    rows = {r["skill"]: r for r in repo.get_user_skill_demand_snapshot("u1")}

    assert rows["Cold Calling"]["current_level"] == 3
    assert rows["Cold Calling"]["proficiency_title"] == "Excavator"
    # The stored "Scout" on an L5 row is never what a person reads.
    assert rows["Negotiation"]["proficiency_title"] == "Legend"


# ── the score stops writing an empty column ─────────────────────────────────

def test_the_score_never_writes_skill_scores() -> None:
    from app.services.scoring.orchestrator import MIRROR_SCORE_COLUMNS

    assert "skill_scores" not in MIRROR_SCORE_COLUMNS
    source = (ROOT / "backend/app/services/scoring/orchestrator.py").read_text()
    assert '"skill_scores"' not in source


# ── nothing reads the stored level name ─────────────────────────────────────

_TITLE_READ = re.compile(
    r"""\.get\(\s*["']proficiency_title["']\)|\[["']proficiency_title["']\]|select\([^)]*proficiency_title"""
)


def test_no_reader_takes_the_stored_level_name() -> None:
    backend = ROOT / "backend"
    offenders = []
    for path in (backend / "app").rglob("*.py"):
        rel = str(path.relative_to(backend))
        text = path.read_text()
        for hit in _TITLE_READ.finditer(text):
            offenders.append(f"{rel}:{text.count(chr(10), 0, hit.start()) + 1}")
    assert offenders == [], "derive it: scoring.level_name(level): " + ", ".join(offenders)


# ── the direction keys hash the lists, and do not move ──────────────────────

_PROFILE = {
    "baseline_version_id": 7,
    "target_role_titles": ["  Data Analyst ", "BI Analyst"],
    "target_role_title": "Data Analyst",
    "target_seniority": "Mid",
    "target_locations": ["Pune", "Mumbai"],
    "target_location": "Pune",
    "known_facts": ["prefers product companies"],
}


def test_the_scoping_key_is_the_same_from_the_lists_alone() -> None:
    """0 of 1,080 profiles differed between a singular and its list's first
    element (2026-10-27), so reading the list moves no key and re-rates nothing."""
    from app.services.onboarding_service import context_key, target_context_hash

    lists_only = {k: v for k, v in _PROFILE.items() if k not in ("target_role_title", "target_location")}
    expected = target_context_hash(7, "Data Analyst", "mid", "Pune")
    assert context_key(_PROFILE) == expected
    assert context_key(lists_only) == expected


def test_the_staleness_key_is_the_same_from_the_lists_alone() -> None:
    import hashlib
    import json

    from app.services.llm_ranker import PROMPT_VERSION
    from app.services.onboarding_service import eval_context_key

    lists_only = {k: v for k, v in _PROFILE.items() if k not in ("target_role_title", "target_location")}
    raw = json.dumps(
        [PROMPT_VERSION, 7, "data analyst", "mid", "pune", ["prefers product companies"]],
        separators=(",", ":"),
    )
    expected = hashlib.sha256(raw.encode()).hexdigest()
    assert eval_context_key(_PROFILE) == expected
    assert eval_context_key(lists_only) == expected
