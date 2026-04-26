from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable, Mapping

from supabase import Client

from app.services.job_feed.contract import JobFeedContractError, JobFeedRow


@dataclass(frozen=True)
class JobFeedImportReport:
    accepted: int
    rejected: int
    duplicate_job_ids: int
    low_quality: int
    batches: int
    errors: tuple[str, ...] = ()


def quality_score(row: Mapping[str, Any]) -> float:
    description = str(row.get("job_description") or "").strip()
    main_skills = row.get("main_skills") or []
    side_skills = row.get("side_skills") or []
    score = 0.0
    if len(description) >= 120:
        score += 0.5
    elif len(description) >= 40:
        score += 0.25
    if main_skills:
        score += 0.35
    if side_skills:
        score += 0.15
    return min(score, 1.0)


def _upsert_jobs(db: Client, rows: list[dict[str, Any]]) -> None:
    if rows:
        db.table("jobs").upsert(rows, on_conflict="job_id").execute()


def _chunks(rows: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for start in range(0, len(rows), size):
        yield rows[start:start + size]


def import_job_feed_rows(
    db: Client,
    raw_rows: Iterable[Mapping[str, Any]],
    *,
    default_batch_date: date | None = None,
    min_quality_score: float = 0.0,
    batch_size: int = 500,
) -> JobFeedImportReport:
    by_job_id: dict[str, JobFeedRow] = {}
    rejected = 0
    low_quality = 0
    duplicates = 0
    errors: list[str] = []

    for raw in raw_rows:
        try:
            row = JobFeedRow.from_mapping(raw, default_batch_date=default_batch_date)
        except (JobFeedContractError, ValueError) as exc:
            rejected += 1
            errors.append(str(exc))
            continue

        supabase_row = row.to_supabase_row()
        if quality_score(supabase_row) < min_quality_score:
            low_quality += 1
            continue

        if row.job_id in by_job_id:
            duplicates += 1
        by_job_id[row.job_id] = row

    accepted_rows = [row.to_supabase_row() for row in by_job_id.values()]
    batches = 0
    for batch in _chunks(accepted_rows, batch_size):
        _upsert_jobs(db, batch)
        batches += 1

    return JobFeedImportReport(
        accepted=len(accepted_rows),
        rejected=rejected,
        duplicate_job_ids=duplicates,
        low_quality=low_quality,
        batches=batches,
        errors=tuple(errors),
    )

