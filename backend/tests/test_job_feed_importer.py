from datetime import date

import pytest

from app.services.job_feed.importer import JobFeedLocationQualityError, import_job_feed_rows, quality_score


class _Query:
    def __init__(self) -> None:
        self.upserts: list[tuple[list[dict], str]] = []
        self.inserts: list[dict] = []

    def upsert(self, rows: list[dict], on_conflict: str) -> "_Query":
        self.upserts.append((rows, on_conflict))
        return self

    def insert(self, row: dict) -> "_Query":
        self.inserts.append(row)
        return self

    def execute(self) -> object:
        return object()


class _Db:
    def __init__(self) -> None:
        self.jobs = _Query()
        self.audits = _Query()

    def table(self, name: str) -> _Query:
        if name == "jobs":
            return self.jobs
        assert name == "job_feed_run_audits"
        return self.audits


def _row(job_id: str = "job-1", description: str | None = None) -> dict:
    return {
        "job_id": job_id,
        "job_title": "Data Analyst",
        "company_name": "Acme",
        "job_description": description or "Build analytics pipelines for product and finance teams. " * 4,
        "industry": "Technology",
        "location": "Remote",
        "apply_url": "https://example.com",
        "main_skills": ["Python (Programming Language)"],
        "side_skills": ["SQL"],
        "batch_date": "2026-04-26",
    }


def test_quality_score_rewards_description_and_skills() -> None:
    assert quality_score(_row()) == 1.0
    assert quality_score(_row(description="tiny")) < 1.0


def test_import_job_feed_rows_normalizes_and_batches_supabase_upserts() -> None:
    db = _Db()

    report = import_job_feed_rows(
        db,
        [_row("job-1"), _row("job-2")],
        batch_size=1,
    )

    assert report.accepted == 2
    assert report.batches == 2
    assert report.unknown_location_rows == 0
    assert report.unknown_location_rate == 0
    assert db.jobs.upserts[0][0][0]["job_id"] == "job-1"
    assert db.jobs.upserts[0][1] == "job_id"
    assert len(db.audits.inserts) == 1


def test_import_job_feed_rows_dedupes_by_job_id_and_keeps_latest() -> None:
    db = _Db()

    report = import_job_feed_rows(
        db,
        [_row("job-1", "Old " * 40), _row("job-1", "New " * 40)],
    )

    assert report.accepted == 1
    assert report.duplicate_job_ids == 1
    assert db.jobs.upserts[0][0][0]["job_description"].startswith("New")


def test_import_job_feed_rows_reports_rejected_and_low_quality_rows() -> None:
    db = _Db()

    report = import_job_feed_rows(
        db,
        [
            {"job_title": "Missing id"},
            _row("low-quality", description="tiny"),
            _row("job-1"),
        ],
        default_batch_date=date(2026, 4, 26),
        min_quality_score=0.9,
    )

    assert report.accepted == 1
    assert report.rejected == 1
    assert report.low_quality == 1
    assert report.unknown_location_rows == 0
    assert "Missing required jobs.job_id" in report.errors[0]


def test_import_job_feed_rows_blocks_when_unknown_location_rate_exceeds_threshold() -> None:
    db = _Db()

    with pytest.raises(JobFeedLocationQualityError, match="Unknown location rate"):
        import_job_feed_rows(
            db,
            [
                _row("job-1"),
                {
                    "job_id": "job-2",
                    "job_title": "Analyst",
                    "job_description": "desc " * 40,
                    "company_name": "Acme",
                    "industry": "Technology",
                    "location": "",
                    "main_skills": ["SQL"],
                    "side_skills": [],
                    "batch_date": "2026-04-26",
                },
            ],
            unknown_location_threshold=0.1,
        )
