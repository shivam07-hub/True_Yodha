"""What a partner's user actually receives, and what they must never receive twice.

Two invariants carry the whole feature:
  • the ledger, not a time window, is what stops a repeat;
  • a stale listing never leaves the building — the partner emails their user
    about it, and a dead link is worse for them than silence.
"""
from __future__ import annotations

from typing import Any

from app.services import partner_alerts


class _FakeJobsRepo:
    """Stands in for JobsRepository — records what the feed was asked for."""

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.feed_kwargs: dict[str, Any] = {}

    def feed_jobs(self, **kwargs: Any) -> dict[str, Any]:
        self.feed_kwargs = kwargs
        exclude = kwargs.get("exclude_job_ids") or set()
        return {"rows": [r for r in self.rows if r["job_id"] not in exclude]}

    def user_skill_keys(self, _uid: str) -> set[str]:
        return {"python"}

    def get_user_target_roles(self, _uid: str) -> list[str]:
        return ["analyst"]

    def user_target_locations(self, _uid: str) -> list[str]:
        return ["Bengaluru"]

    def get_user_eligibility_preferences(self, _uid: str) -> dict[str, Any]:
        return {
            "target_career_band": "business_product_operations",
            "explored_career_bands": [],
            "target_seniority": "entry",
        }


class _FakeDeliveryRepo:
    def __init__(self, delivered: set[str] | None = None) -> None:
        self.delivered = delivered or set()
        self.recorded: list[tuple[str, list[str]]] = []

    def delivered_job_ids(self, _seat_id: str, *, limit: int = 2000) -> set[str]:
        return self.delivered

    def record_delivered_jobs(self, seat_id: str, job_ids: list[str]) -> None:
        self.recorded.append((seat_id, job_ids))


SEAT = {"id": "seat1", "user_id": "u1", "external_id": "ext-1", "email": "a@b.c"}


def _row(job_id: str, **over: Any) -> dict[str, Any]:
    base = {
        "job_id": job_id,
        "job_title": "Analyst",
        "company_name": "Acme",
        "location": "Bengaluru",
        "location_city": "Bengaluru",
        "location_country": "India",
        "location_mode": "onsite",
        "role_domain": "finance",
        "seniority_level": "entry",
        "min_years_experience": 0,
        "max_years_experience": 2,
        "skills": ["excel"],
        "source_url": "https://acme.example/job",
        "first_seen": "2026-08-01T00:00:00+00:00",
        "is_stale": False,
    }
    base.update(over)
    return base


def test_already_delivered_jobs_are_excluded():
    jobs_repo = _FakeJobsRepo([_row("j1"), _row("j2")])
    delivery = _FakeDeliveryRepo(delivered={"j1"})

    out = partner_alerts.jobs_for_seat(jobs_repo, delivery, seat=SEAT)

    assert [j["job_id"] for j in out] == ["j2"]
    assert jobs_repo.feed_kwargs["exclude_job_ids"] == {"j1"}


def test_preview_can_ignore_the_ledger_without_consuming_it():
    jobs_repo = _FakeJobsRepo([_row("j1"), _row("j2")])
    delivery = _FakeDeliveryRepo(delivered={"j1"})

    out = partner_alerts.jobs_for_seat(
        jobs_repo, delivery, seat=SEAT, exclude_delivered=False
    )

    assert [j["job_id"] for j in out] == ["j1", "j2"]
    assert delivery.recorded == []


def test_stale_listings_never_go_out():
    jobs_repo = _FakeJobsRepo([_row("j1", is_stale=True), _row("j2")])

    out = partner_alerts.jobs_for_seat(jobs_repo, _FakeDeliveryRepo(), seat=SEAT)

    assert [j["job_id"] for j in out] == ["j2"]


def test_experience_ceiling_filters_by_minimum_required():
    jobs_repo = _FakeJobsRepo([
        _row("j1", min_years_experience=0),
        _row("j2", min_years_experience=2),
        _row("j3", min_years_experience=5),
        _row("j4", min_years_experience=None),
    ])

    out = partner_alerts.jobs_for_seat(
        jobs_repo, _FakeDeliveryRepo(), seat=SEAT, max_experience_years=2
    )

    assert [j["job_id"] for j in out] == ["j1", "j2", "j4"]


def test_limit_is_bounded():
    jobs_repo = _FakeJobsRepo([_row(f"j{i}") for i in range(60)])

    out = partner_alerts.jobs_for_seat(
        jobs_repo, _FakeDeliveryRepo(), seat=SEAT, limit=999
    )

    assert len(out) == partner_alerts.MAX_JOBS_PER_USER


def test_seat_without_a_linked_account_gets_nothing():
    jobs_repo = _FakeJobsRepo([_row("j1")])

    out = partner_alerts.jobs_for_seat(
        jobs_repo, _FakeDeliveryRepo(), seat={"id": "seat1", "user_id": None}
    )

    assert out == []


def test_payload_does_not_leak_internal_ranking_fields():
    jobs_repo = _FakeJobsRepo([_row("j1", matched_skill_count=3, target_role_match=0.9)])

    out = partner_alerts.jobs_for_seat(jobs_repo, _FakeDeliveryRepo(), seat=SEAT)

    assert set(out[0]) == {
        "job_id", "title", "company", "location", "location_city", "location_country",
        "work_mode", "role_domain", "seniority_level", "min_years_experience",
        "max_years_experience", "skills", "apply_url", "first_seen_at",
    }


def test_the_feed_is_asked_for_the_users_own_context():
    jobs_repo = _FakeJobsRepo([_row("j1")])

    partner_alerts.jobs_for_seat(jobs_repo, _FakeDeliveryRepo(), seat=SEAT)

    kwargs = jobs_repo.feed_kwargs
    assert kwargs["user_skill_keys"] == {"python"}
    assert kwargs["user_target_roles"] == ["analyst"]
    assert kwargs["target_seniority"] == "entry"
    assert kwargs["location_prefs"] == ["Bengaluru"]
    assert kwargs["sort"] == "fresh"
