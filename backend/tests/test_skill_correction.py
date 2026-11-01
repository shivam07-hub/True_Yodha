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

from app.repositories.users import UserSkillRecord
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


SKILL_KEYS = {7: "FitNesse", 8: "Video Editing", 9: "Python"}


class _CVRepo:
    def __init__(self, baseline: dict[str, Any] | None = BASELINE) -> None:
        self.baseline = baseline
        self.overrides: dict[int, dict[str, Any]] = {}
        self.baseline_reads = 0

    def latest_baseline(self, _user_id: str) -> dict[str, Any] | None:
        return self.baseline

    def baseline_skill_signals(self, _user_id: str) -> dict[str, Any] | None:
        self.baseline_reads += 1
        return self.baseline

    def list_skill_exclusions(self, _user_id: str) -> list[dict[str, Any]]:
        return [
            {
                "baseline_version_id": override["baseline_version_id"],
                "evidence_text": override["evidence_text"],
                "source_location": override["source_location"],
                "skills": {
                    "taxonomy_key": SKILL_KEYS[skill_id],
                    "display_name": SKILL_KEYS[skill_id].upper(),
                    "description": None,
                },
            }
            for skill_id, override in self.overrides.items()
            if override["action"] == "exclude"
        ]

    def get_skill_override(self, _u: str, _b: int, skill_id: int) -> dict[str, Any] | None:
        return self.overrides.get(skill_id)

    def upsert_skill_override(
        self, _u: str, baseline_version_id: int, skill_id: int, action: str,
        evidence_text: str, source_location: dict[str, Any] | None = None,
    ) -> None:
        self.overrides[skill_id] = {
            "baseline_version_id": baseline_version_id,
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
                "source": "cv",
                "evidence_text": "Fitness & Strength Training",
                "forge_sessions_count": 9,
                "total_forge_minutes": 225,
            },
            8: {
                "matched_level": 3,
                "source": "cv",
                "evidence_text": "Edited 20+ advertisement videos",
                "forge_sessions_count": 0,
                "total_forge_minutes": 0,
            },
        }
        self.upserted: list[dict[str, Any]] = []
        self.cv_texts: list[str] = []
        self.gate_refuses = False

    def get_skill_id_for_key(self, key: str) -> int | None:
        # Python is in the catalog but absent from this CV — the case where a
        # restore would have to invent evidence.
        return {"FitNesse": 7, "Video Editing": 8, "Python": 9}.get(key)

    def get_user_skill_row(self, _user_id: str, skill_id: int) -> dict[str, Any] | None:
        return self.rows.get(skill_id)

    def delete_user_skill(self, _user_id: str, skill_id: int) -> None:
        self.rows.pop(skill_id, None)

    def upsert_user_skill_rows(self, rows: list[dict[str, Any]], *, cv_text: str = "") -> None:
        self.cv_texts.append(cv_text)
        if self.gate_refuses:
            return
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


def test_restoring_a_first_run_ruling_rebuilds_from_the_cv(wired) -> None:
    cv_repo, scores_repo, _ = wired
    scores_repo.rows.pop(8)
    cv_repo.upsert_skill_override("u1", 42, 8, action="exclude", evidence_text="")

    skill_correction.set_skill_included(object(), "u1", "Video Editing", included=True)

    restored = scores_repo.rows[8]
    assert restored["matched_level"] == 3, "impact signal → L3, same as the publish path"
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


# ── the route can actually write ────────────────────────────────────────────

def test_restoring_a_skill_this_cv_does_not_carry_puts_the_row_back(wired) -> None:
    """A live skill can be missing from the latest CV's signals: 531 rows across 79
    users on 2026-11-01, most of them with a newer CV not yet confirmed. Their
    level was only ever on the row, so removing it has to keep it."""
    cv_repo, scores_repo, _ = wired
    scores_repo.rows[9] = {
        "matched_level": 4,
        "source": "cv",
        "evidence_text": "Built Python pipelines",
        "forge_sessions_count": 2,
        "total_forge_minutes": 50,
    }

    skill_correction.set_skill_included(object(), "u1", "Python", included=False)
    assert 9 not in scores_repo.rows

    skill_correction.set_skill_included(object(), "u1", "Python", included=True)
    restored = scores_repo.rows[9]
    assert restored["matched_level"] == 4
    assert restored["evidence_text"] == "Built Python pipelines"
    assert restored["forge_sessions_count"] == 2
    assert cv_repo.overrides == {}
    assert scores_repo.cv_texts == [""], "an earlier CV's receipt is not judged by this one"


def test_a_restore_the_evidence_gate_refuses_keeps_the_ruling(wired) -> None:
    """The write gate can drop the row. Clearing the ruling anyway would lose the
    skill twice: gone from the score, and gone from the rail that can bring it back."""
    cv_repo, scores_repo, _ = wired
    skill_correction.set_skill_included(object(), "u1", "FitNesse", included=False)
    scores_repo.gate_refuses = True

    with pytest.raises(HTTPException) as excinfo:
        skill_correction.set_skill_included(object(), "u1", "FitNesse", included=True)

    assert excinfo.value.status_code == 409
    assert 7 in cv_repo.overrides


# ── reading the removed skills back ─────────────────────────────────────────

def test_a_removed_skill_reads_back_as_what_restore_returns(wired) -> None:
    _cv_repo, _scores_repo, _ = wired

    skill_correction.set_skill_included(object(), "u1", "FitNesse", included=False)

    assert skill_correction.removed_skills(object(), "u1") == [
        UserSkillRecord(
            key="FitNesse",
            display_name="FITNESSE",
            level=1,
            proficiency_title=skill_correction.scoring.level_name(1),
            evidence_text="Fitness & Strength Training",
            forge_sessions_count=9,
            forged_level_up_available=False,
        )
    ]

    skill_correction.set_skill_included(object(), "u1", "FitNesse", included=True)
    assert skill_correction.removed_skills(object(), "u1") == []


def test_nobody_with_no_rulings_pays_to_read_their_cv(wired) -> None:
    """41 rulings across 16 users (2026-11-01): the CV page must not fetch every
    other user's CV to learn they removed nothing."""
    cv_repo, _scores_repo, _ = wired

    assert skill_correction.removed_skills(object(), "u1") == []
    assert cv_repo.baseline_reads == 0


def test_a_first_run_ruling_reads_its_level_from_the_cv(wired) -> None:
    """Every ruling so far came from the confirm step, which stashes nothing."""
    cv_repo, _scores_repo, _ = wired
    cv_repo.upsert_skill_override("u1", 42, 8, action="exclude", evidence_text="")

    [item] = skill_correction.removed_skills(object(), "u1")

    assert item.key == "Video Editing"
    assert item.level == 3
    assert item.evidence_text == "Edited 20+ advertisement videos"
    assert item.forge_sessions_count == 0


def test_a_ruling_on_an_older_cv_is_not_shown(wired) -> None:
    """A correction is against the latest baseline, so a Restore could not reach it."""
    cv_repo, _scores_repo, _ = wired
    cv_repo.upsert_skill_override("u1", 41, 8, action="exclude", evidence_text="")

    assert skill_correction.removed_skills(object(), "u1") == []


def test_a_ruling_with_nothing_to_put_back_is_not_shown(wired) -> None:
    """Restore would refuse it, and a button that always refuses is a dead end."""
    cv_repo, _scores_repo, _ = wired
    cv_repo.upsert_skill_override("u1", 42, 9, action="exclude", evidence_text="")

    assert skill_correction.removed_skills(object(), "u1") == []


def test_the_read_uses_the_users_own_token(monkeypatch) -> None:
    """`authenticated` may read `cv_skill_overrides`, so this read needs no admin
    client: RLS holds it to the caller's own rows."""
    from fastapi.testclient import TestClient

    from app.deps import Principal, get_principal, get_user_db
    from app.main import app
    from app.routers import users as router

    user_token = object()
    seen: list[tuple[Any, ...]] = []
    item = UserSkillRecord(
        key="FitNesse",
        display_name="FitNesse",
        level=1,
        proficiency_title="Scout",
        evidence_text=None,
        forge_sessions_count=0,
        forged_level_up_available=False,
    )
    monkeypatch.setattr(
        router.skill_correction,
        "removed_skills",
        lambda *args: seen.append(args) or [item],
    )
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email=None)
    app.dependency_overrides[get_user_db] = lambda: user_token
    try:
        with TestClient(app) as client:
            response = client.get("/users/me/skills/removed")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert seen == [(user_token, "u1")]
    assert [row["key"] for row in response.json()] == ["FitNesse"]


def test_the_route_writes_with_a_client_that_may_write(monkeypatch) -> None:
    """`authenticated` has read `cv_skill_overrides` only since 20260619b. The route
    shipped on the user's token, so every removal failed on its first write: 0 of 41
    override rows ever came through it (2026-10-30). The fakes above replace the
    repos, so only a test of the client the route passes can see this."""
    from fastapi.testclient import TestClient

    from app.deps import Principal, get_principal, get_user_db
    from app.main import app
    from app.routers import users as router

    admin, user_token = object(), object()
    seen: list[tuple[Any, ...]] = []
    monkeypatch.setattr(router, "get_supabase_admin", lambda: admin)
    monkeypatch.setattr(
        router.skill_correction,
        "set_skill_included",
        lambda *args: seen.append(args) or {"total_score": 31.0, "skills_assessed": 4},
    )
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email=None)
    app.dependency_overrides[get_user_db] = lambda: user_token
    try:
        with TestClient(app) as client:
            response = client.post(
                "/users/me/skills/correction",
                json={"skill_key": " FitNesse ", "included": False},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert seen == [(admin, "u1", "FitNesse", False)]
