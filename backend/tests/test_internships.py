from datetime import datetime, timezone

import pytest

from app.schemas.jobs import JobFeedItem
from app.services.internships import (
    UnpaidInternshipError,
    hosted_job_row,
    intern_card,
    is_intern_job,
    require_paid,
    review_hosted,
    without_dismissed,
)


NOW = datetime(2026, 10, 15, tzinfo=timezone.utc)


def test_unpaid_hosted_internships_are_refused() -> None:
    with pytest.raises(UnpaidInternshipError):
        require_paid(0, 0)
    with pytest.raises(UnpaidInternshipError):
        hosted_job_row(
            "user-1",
            {
                "company_name": "Campus Co",
                "job_title": "Product intern",
                "stipend_low_inr": 0,
                "duration_months": 3,
                "job_description": "Work with the product team on live listings.",
            },
            now=NOW,
        )


def test_hosted_row_is_a_paid_myro_internship() -> None:
    row = hosted_job_row(
        "user-1",
        {
            "company_name": "Campus Co",
            "job_title": "Product intern",
            "stipend_low_inr": 8000,
            "stipend_high_inr": 12000,
            "duration_months": 3,
            "ppo": True,
            "location": "Bengaluru",
            "location_mode": "hybrid",
            "job_description": "Work with the product team on live listings.",
            "skills": ["SQL", "Figma"],
        },
        now=NOW,
    )
    assert row["listing_venue"] == "myro"
    assert row["employment_kind"] == "internship"
    assert row["stipend_low_inr"] == 8000
    assert row["stipend_high_inr"] == 12000
    assert row["duration_months"] == 3
    assert row["ppo"] is True
    assert row["listing_confidence"] == "active"
    assert row["job_id"].startswith("myro_")
    assert row["created_by_user_id"] == "user-1"


def test_a_new_post_is_held_until_myro_clears_it() -> None:
    """Every live read filters is_active; a held post must fail that filter."""
    row = hosted_job_row(
        "user-1",
        {
            "company_name": "Campus Co",
            "job_title": "Product intern",
            "stipend_low_inr": 8000,
            "duration_months": 3,
            "job_description": "Work with the product team on live listings.",
        },
        now=NOW,
    )
    assert row["is_active"] is False
    assert row["hosted_review"] == "pending"


class _Rows:
    """The one PostgREST update chain review_hosted walks."""

    def __init__(self, stored: dict) -> None:
        self.stored = stored
        self.patch: dict = {}
        self.filters: dict = {}

    def table(self, name: str) -> "_Rows":
        assert name == "jobs"
        return self

    def update(self, patch: dict) -> "_Rows":
        self.patch = patch
        return self

    def eq(self, column: str, value: object) -> "_Rows":
        self.filters[column] = value
        return self

    def execute(self) -> "_Rows":
        matches = all(self.stored.get(k) == v for k, v in self.filters.items())
        if matches:
            self.stored.update(self.patch)
        self.data = [dict(self.stored)] if matches else []
        return self


def _held() -> dict:
    return {
        "job_id": "myro_1",
        "job_title": "Product intern",
        "company_name": "Campus Co",
        "listing_venue": "myro",
        "employment_kind": "internship",
        "listing_confidence": "active",
        "is_active": False,
        "hosted_review": "pending",
        "stipend_low_inr": 8000,
        "created_by_user_id": "user-1",
    }


def test_clearing_a_held_post_makes_it_live() -> None:
    db = _Rows(_held())
    card = review_hosted(db, "myro_1", "clear")
    assert card is not None
    assert db.stored["is_active"] is True
    assert card["hosted_review"] == "cleared"
    assert card["poster_id"] == "user-1"


def test_refusing_a_held_post_keeps_it_from_seekers() -> None:
    db = _Rows(_held())
    card = review_hosted(db, "myro_1", "refuse")
    assert card is not None
    assert db.stored["is_active"] is False
    assert card["hosted_review"] == "refused"


def test_a_decided_post_does_not_move_again() -> None:
    db = _Rows({**_held(), "hosted_review": "refused"})
    assert review_hosted(db, "myro_1", "clear") is None
    assert db.stored["is_active"] is False


def test_intern_detection_from_title_and_band() -> None:
    assert is_intern_job({"job_title": "SDE Intern"})
    assert is_intern_job({"job_title": "Analyst", "seniority_level": "intern"})
    assert is_intern_job({"job_title": "Analyst", "employment_kind": "internship"})
    assert not is_intern_job({"job_title": "Data Analyst"})


def test_intern_card_carries_stipend_not_career_band() -> None:
    card = intern_card(
        {
            "job_id": "myro_abc",
            "job_title": "Product intern",
            "company_name": "Campus Co",
            "listing_venue": "myro",
            "employment_kind": "internship",
            "stipend_low_inr": 5000,
            "stipend_high_inr": 10000,
            "duration_months": 3,
            "ppo": True,
            "listing_confidence": "active",
            "is_active": True,
            "first_seen": 20261015,
            "last_verified_live_at": NOW.isoformat(),
            "last_conclusive_verification_at": NOW.isoformat(),
            "main_skills": ["SQL"],
        },
        now=NOW,
    )
    assert "career_band" not in card
    assert card["listing_venue"] == "myro"
    assert card["stipend_low_inr"] == 5000
    assert card["skills"] == ["SQL"]
    assert card["is_stale"] is False
    item = JobFeedItem(**card)
    assert item.listing_venue == "myro"
    assert item.stipend_low_inr == 5000


def test_without_dismissed_drops_skipped_interns() -> None:
    cards = [{"job_id": "keep"}, {"job_id": "gone"}]
    assert without_dismissed(cards, {"gone"}) == [{"job_id": "keep"}]
    assert without_dismissed(cards, set()) == cards


# ── Apply here is a Yes (CONTEXT → Application Yes) ─────────────────────────


class _HostedRepo:
    def __init__(self) -> None:
        self.row: dict | None = None
        self.intents: list[dict] = []

    def record_apply_intent(self, _uid: str, _job_id: str, intent: dict) -> None:
        self.intents.append(intent)

    def get_application_with_job(self, _uid: str, job_id: str) -> dict | None:
        if self.row is None:
            return None
        return {
            "id": 1, "job_id": job_id, "created_at": "2026-10-27T00:00:00+00:00",
            "jobs": {"job_title": "Growth Intern", "company_name": "Myro"}, **self.row,
        }

    def upsert_application(self, _uid: str, _job_id: str, updates: dict) -> None:
        self.row = {**(self.row or {}), **updates}

    def answer_apply_intents(self, _uid: str, _job_id: str) -> None:
        pass


def test_apply_here_is_a_yes_through_the_hosted_door(monkeypatch: pytest.MonkeyPatch) -> None:
    """The intern apply page is the submit. It used to stamp the date and skip the
    CV, the judge and the door, so a hosted application never named its door."""
    from fastapi.testclient import TestClient

    from app.database import get_supabase_admin
    from app.deps import Principal, get_principal
    from app.main import app
    from app.repositories.jobs import get_token_jobs_repository
    from app.routers.jobs import internships as router
    from app.services import application_yes

    repo = _HostedRepo()
    seen: list = []
    monkeypatch.setattr(router, "get_internship", lambda _db, _jid: {"listing_venue": "myro"})
    monkeypatch.setattr(application_yes.cv_of_record, "record_on_apply", lambda *_a, **_k: seen.append("cv"))
    monkeypatch.setattr(application_yes.on_demand, "open_job_eval", lambda *_a: seen.append("judge"))
    monkeypatch.setattr(application_yes.core_loop, "record_step", lambda *a: seen.append(a))
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email=None)
    app.dependency_overrides[get_supabase_admin] = lambda: object()
    app.dependency_overrides[get_token_jobs_repository] = lambda: repo
    try:
        with TestClient(app) as client:
            res = client.post("/jobs/internships/myro_1/apply")
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200
    assert res.json()["status"] == "applied"
    assert res.json()["applied_at"] is not None
    assert repo.intents[0]["destination_type"] == "hosted_role"
    assert seen == ["cv", "judge", ("u1", "myro_1", "applied", "hosted")]


class _ForYouRpc:
    def __init__(self, out: dict) -> None:
        self.out = out
        self.calls: list = []

    def rpc(self, name: str, params: dict) -> "_ForYouRpc":
        self.calls.append((name, params))
        return self

    def execute(self) -> "_ForYouRpc":
        self.data = self.out
        return self


def test_internships_for_him_carry_the_skills_he_has() -> None:
    from app.services.internships import internships_for

    db = _ForYouRpc({
        "total": 3,
        "jobs": [{
            "job_id": "myro_1", "job_title": "Product intern", "company_name": "Campus Co",
            "listing_venue": "myro", "employment_kind": "internship", "is_active": True,
            "listing_confidence": "active", "first_seen": 20261108, "main_skills": ["SQL", "Figma"],
            "matched_skills": ["SQL"], "stipend_low_inr": 8000,
        }],
    })
    out = internships_for(db, "u1")
    assert db.calls == [("hosted_internships_for", {"p_user_id": "u1"})]
    assert out["total"] == 3
    card = out["jobs"][0]
    assert card["listing_venue"] == "myro"
    assert card["matched_skills"] == ["SQL"] and card["matched_skill_count"] == 1
    assert card["first_seen"] == "2026-11-08"
    JobFeedItem(**card)


def test_no_live_internships_is_an_empty_band_not_an_error() -> None:
    from app.services.internships import internships_for

    assert internships_for(_ForYouRpc({}), "u1") == {"total": 0, "jobs": []}
