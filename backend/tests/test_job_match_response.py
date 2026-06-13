from datetime import date

from app.routers.jobs._shared import to_job_match


def test_to_job_match_preserves_row_batch_week_for_historical_cards() -> None:
    match = to_job_match(
        {
            "id": 1,
            "job_id": "job-old",
            "batch_week": "2026-05-25",
            "overlap_score": 81,
            "matched_skills": [],
            "jobs": {
                "job_title": "Analyst",
                "company_name": "Acme",
                "first_seen": 20260601,
                "last_seen": 20200101,
                "is_active": False,
            },
        },
        date(2026, 6, 1),
    )

    assert match.batch_week == date(2026, 5, 25)
    assert match.first_seen == "2026-06-01"
    assert match.last_seen_at == "2020-01-01"
    assert match.is_stale is True
    assert match.is_active is False
