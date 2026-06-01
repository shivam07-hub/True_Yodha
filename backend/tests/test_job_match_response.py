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
            "jobs": {"job_title": "Analyst", "company_name": "Acme"},
        },
        date(2026, 6, 1),
    )

    assert match.batch_week == date(2026, 5, 25)
