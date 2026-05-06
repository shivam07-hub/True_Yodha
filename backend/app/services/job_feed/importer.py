from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable, Mapping
from uuid import uuid4

from supabase import Client

from app.services.job_feed.contract import JobFeedContractError, JobFeedRow
from app.services.location_normalizer import LOCATION_PARSER_VERSION

logger = logging.getLogger(__name__)


class JobFeedLocationQualityError(RuntimeError):
    """Raised when unknown location rate breaches the configured threshold."""


@dataclass(frozen=True)
class JobFeedImportReport:
    accepted: int
    rejected: int
    duplicate_job_ids: int
    low_quality: int
    batches: int
    unknown_location_rows: int
    unknown_location_rate: float
    parser_version: str
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


def _write_run_audit(
    db: Client,
    *,
    total_rows: int,
    unknown_location_rows: int,
    unknown_location_rate: float,
    top_unknown_aliases: list[dict[str, Any]],
    status: str,
    message: str | None,
) -> None:
    payload = {
        "run_id": str(uuid4()),
        "source": "job_feed_importer",
        "parser_version": LOCATION_PARSER_VERSION,
        "total_rows": total_rows,
        "unknown_location_rows": unknown_location_rows,
        "unknown_location_rate": unknown_location_rate,
        "top_unknown_aliases": top_unknown_aliases,
        "status": status,
        "message": message,
    }
    try:
        db.table("job_feed_run_audits").insert(payload).execute()
    except Exception as exc:  # pragma: no cover - best-effort operational write
        logger.warning("Failed to persist job_feed_run_audits row: %s", exc)


def import_job_feed_rows(
    db: Client,
    raw_rows: Iterable[Mapping[str, Any]],
    *,
    default_batch_date: date | None = None,
    min_quality_score: float = 0.0,
    batch_size: int = 500,
    unknown_location_threshold: float = 0.10,
) -> JobFeedImportReport:
    by_job_id: dict[str, JobFeedRow] = {}
    rejected = 0
    low_quality = 0
    duplicates = 0
    errors: list[str] = []
    parsed_rows = 0
    unknown_locations = 0
    unknown_aliases: Counter[str] = Counter()

    for raw in raw_rows:
        try:
            row = JobFeedRow.from_mapping(raw, default_batch_date=default_batch_date)
        except (JobFeedContractError, ValueError) as exc:
            rejected += 1
            errors.append(str(exc))
            continue

        parsed_rows += 1
        if row.location_quality == "unknown":
            unknown_locations += 1
            if row.location_raw:
                unknown_aliases[row.location_raw.lower()] += 1

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

    unknown_location_rate = (unknown_locations / parsed_rows) if parsed_rows else 0.0
    top_unknown_aliases = [{"alias": alias, "count": count} for alias, count in unknown_aliases.most_common(20)]
    is_blocked = unknown_location_rate > unknown_location_threshold
    block_message = None
    if is_blocked:
        block_message = (
            f"Unknown location rate {unknown_location_rate:.2%} exceeded threshold "
            f"{unknown_location_threshold:.2%}"
        )
        logger.error(block_message)
    _write_run_audit(
        db,
        total_rows=parsed_rows,
        unknown_location_rows=unknown_locations,
        unknown_location_rate=unknown_location_rate,
        top_unknown_aliases=top_unknown_aliases,
        status="blocked" if is_blocked else "ok",
        message=block_message,
    )
    if is_blocked:
        raise JobFeedLocationQualityError(block_message or "Unknown location rate exceeded threshold")

    return JobFeedImportReport(
        accepted=len(accepted_rows),
        rejected=rejected,
        duplicate_job_ids=duplicates,
        low_quality=low_quality,
        batches=batches,
        unknown_location_rows=unknown_locations,
        unknown_location_rate=unknown_location_rate,
        parser_version=LOCATION_PARSER_VERSION,
        errors=tuple(errors),
    )
