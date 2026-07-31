"""Correcting a skill after onboarding (backlog #6).

The invariant worth guarding is not "the row disappeared" — it is that a
correction stays surgical. Removing one wrong skill must not touch anybody
else's row, must not reset practice history, and must leave a durable ruling so
a later republish of the same baseline honours it.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import HTTPException

from app.services import skill_correction


BASELINE = {
    "id": 42,
    "kind": "baseline_upload",
    "skills_detected": [
        {
            "taxonomy_key": "FitNesse",
            "signal_type": "mention",
            "evidence": "Fitness & Strength Training",
            "xp_awarded": 100,
        },
        {
            "taxonomy_key": "Video Editing",
            "signal_type": "impact",
            "evidence": "Edited 20+ advertisement videos",
            "xp_awarded": 300,
        },
    ],
}


class _CVRepo:
    def __init__(self, baseline: dict[str, Any] | None = BASELINE) -> None:
        self.baseline = baseline
        self.overrides: dict[int, dict[str, Any]] = {}

    def latest_baseline(self, _user_id: str) -> dict[str, Any] | None:
        return self.baseline

    def get_skill_override(self, _u: str, _b: int, skill_id: int) -> dict[str, Any] | None:
        return self.overrides.get(skill_id)

    def upsert_skill_override(
        self, _u: str, _b: int, skill_id: int, action: str,
        evidence_text: str, source_location: dict[str, Any] | None = None,
    ) -> None:
        self.overrides[skill_id] = {
            "action": action,
            "evidence_text": evidence_text,
            "source_location": source_location or {},
        }

    def delete_skill_override(self, _u: str, _b: int, skill_id: int) -> None:
        self.overrides.pop(skill_id, None)


class _ScoresRepo:
    def __init__(self, rows: dict[int, dict[str, Any]] | None = None) -> None:
        self.rows = rows if rows is not None else {
            7: {
                "matched_level": 1,
                "proficiency_title": "Scout",
                "source": "cv",
                "evidence_text": "Fitness & Strength Training",
                "forge_sessions_count": 9,
                "total_forge_minutes": 225,
            },
            8: {
                "matched_level": 3,
                "proficiency_title": "Excavator",
                "source": "cv",
                "evidence_text": "Edited 20+ advertisement videos",
                "forge_sessions_count": 0,
                "total_forge_minutes": 0,
            },
        }
        self.upserted: list[dict[str, Any]] = []

    def get_skill_id_for_key(self, key: str) -> int | None:
        # Python is in the catalog but absent from this CV — the case where a
        # restore would have to invent evidence.
        return {"FitNesse": 7, "Video Editing": 8, "Python": 9}.get(key)

    def get_user_skill_row(self, _user_id: str, skill_id: int) -> dict[str, Any] | None:
        return self.rows.get(skill_id)

    def delete_user_skill(self, _user_id: str, skill_id: int) -> None:
        self.rows.pop(skill_id, None)

    def upsert_user_skill_rows(self, rows: list[dict[str, Any]]) -> None:
        self.upserted.extend(rows)
        for row in rows:
            self.rows[int(row["skill_id"])] = row


@pytest.fixture
def wired(monkeypatch):
    cv_repo, scores_repo = _CVRepo(), _ScoresRepo()
    recomputed: list[str] = []
    monkeypatch.setattr(skill_correction, "CVVersionsRepository", lambda _db: cv_repo)
    monkeypatch.setattr(skill_correction, "ScoresRepository", lambda _db: scores_repo)
    monkeypatch.setattr(
        skill_correction.scoring,
        "recompute_score",
        lambda _repo, user_id: recomputed.append(user_id) or {"total_score": 31.0},
    )
    return cv_repo, scores_repo, recomputed


def test_excluding_removes_only_that_skill_and_rescores(wired) -> None:
    cv_repo, scores_repo, recomputed = wired

    skill_correction.set_skill_included(object(), "u1", "FitNesse", included=False)

    assert 7 not in scores_repo.rows
    assert 8 in scores_repo.rows, "an unrelated skill must be untouched"
    assert cv_repo.overrides[7]["action"] == "exclude"
    assert recomputed == ["u1"], "the score must not lag the evidence behind it"


def test_exclusion_carries_practice_history_through(wired) -> None:
    """A removal must be undoable without costing the user 9 forge sessions."""
    cv_repo, scores_repo, _ = wired

    skill_correction.set_skill_included(object(), "u1", "FitNesse", included=False)
    assert cv_repo.overrides[7]["source_location"]["forge"] == {
        "forge_sessions_count": 9,
        "total_forge_minutes": 225,
    }

    skill_correction.set_skill_included(object(), "u1", "FitNesse", included=True)
    restored = scores_repo.rows[7]
    assert restored["forge_sessions_count"] == 9
    assert restored["total_forge_minutes"] == 225


def test_restore_rebuilds_level_and_receipt_from_the_cv(wired) -> None:
    _cv_repo, scores_repo, _ = wired

    skill_correction.set_skill_included(object(), "u1", "Video Editing", included=False)
    skill_correction.set_skill_included(object(), "u1", "Video Editing", included=True)

    restored = scores_repo.rows[8]
    assert restored["matched_level"] == 3, "impact signal → L3, same as the publish path"
    assert restored["proficiency_title"] == "Excavator"
    assert restored["evidence_text"] == "Edited 20+ advertisement videos"


def test_restore_clears_the_standing_ruling(wired) -> None:
    cv_repo, _scores_repo, _ = wired

    skill_correction.set_skill_included(object(), "u1", "FitNesse", included=False)
    skill_correction.set_skill_included(object(), "u1", "FitNesse", included=True)

    assert cv_repo.overrides == {}, "a restored skill must not stay excluded on republish"


def test_restoring_a_skill_the_cv_never_evidenced_is_refused(wired) -> None:
    _cv_repo, scores_repo, _ = wired
    scores_repo.rows.clear()

    with pytest.raises(HTTPException) as excinfo:
        skill_correction.set_skill_included(object(), "u1", "Python", included=True)
    assert excinfo.value.status_code == 409


def test_unknown_skill_is_404_not_a_silent_noop(wired) -> None:
    with pytest.raises(HTTPException) as excinfo:
        skill_correction.set_skill_included(object(), "u1", "Underwater Basket Weaving", included=False)
    assert excinfo.value.status_code == 404


def test_correction_requires_a_baseline(monkeypatch) -> None:
    monkeypatch.setattr(skill_correction, "CVVersionsRepository", lambda _db: _CVRepo(baseline=None))
    monkeypatch.setattr(skill_correction, "ScoresRepository", lambda _db: _ScoresRepo())

    with pytest.raises(HTTPException) as excinfo:
        skill_correction.set_skill_included(object(), "u1", "FitNesse", included=False)
    assert excinfo.value.status_code == 409


def test_excluding_twice_is_idempotent(wired) -> None:
    cv_repo, scores_repo, recomputed = wired

    skill_correction.set_skill_included(object(), "u1", "FitNesse", included=False)
    skill_correction.set_skill_included(object(), "u1", "FitNesse", included=False)

    assert 7 not in scores_repo.rows
    assert cv_repo.overrides[7]["action"] == "exclude"
    assert len(recomputed) == 2
