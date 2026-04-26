from datetime import date

import pytest

from app.services.job_feed import JobFeedContractError, normalize_job_feed_row


def test_normalizes_firecrawl_crawler_row_to_public_jobs_contract() -> None:
    row = normalize_job_feed_row(
        {
            "job_id": "wd_123",
            "job_title": "Data Engineer",
            "job_description": "Build data products with Python and SQL.",
            "company_name": "Acme",
            "Industry": "Technology",
            "Location": "Bengaluru",
            "apply_url": "https://jobs.example.com/123",
            "main_skills": "Python (Programming Language), SQL, Python (Programming Language)",
            "side_skills": ["Communication", "SQL", "communication"],
            "batch_date": 20260426,
        }
    )

    assert row == {
        "job_id": "wd_123",
        "job_title": "Data Engineer",
        "job_description": "Build data products with Python and SQL.",
        "company_name": "Acme",
        "industry": "Technology",
        "location": "Bengaluru",
        "apply_url": "https://jobs.example.com/123",
        "main_skills": ["Python (Programming Language)", "SQL"],
        "side_skills": ["Communication", "SQL"],
        "batch_date": "2026-04-26",
    }


def test_accepts_snake_case_keys_and_defaults_location_for_india_feed() -> None:
    row = normalize_job_feed_row(
        {
            "job_id": "gh_456",
            "job_title": "Product Analyst",
            "company_name": "Acme",
            "industry": "Financial Services",
            "main_skills": [],
            "side_skills": None,
        },
        default_batch_date=date(2026, 4, 26),
    )

    assert row["industry"] == "Financial Services"
    assert row["location"] == "India"
    assert row["apply_url"] is None
    assert row["batch_date"] == "2026-04-26"
    assert row["main_skills"] == []
    assert row["side_skills"] == []


def test_rejects_rows_without_stable_job_identity() -> None:
    with pytest.raises(JobFeedContractError, match="jobs.job_id"):
        normalize_job_feed_row({"job_title": "Data Engineer"})


def test_rejects_non_list_skill_shapes() -> None:
    with pytest.raises(JobFeedContractError, match="Skill fields"):
        normalize_job_feed_row(
            {
                "job_id": "wd_123",
                "job_title": "Data Engineer",
                "main_skills": {"Python": True},
            }
        )
