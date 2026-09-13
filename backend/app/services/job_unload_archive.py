"""job_archive_v1 files written before a closed listing is deleted.

Same JSON + CSV shape as the 2026-07-15 / 2026-08-13 laptop unloads, so a
later restore can put the rows back into `jobs`. Disk only — not Storage.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from supabase import Client


log = logging.getLogger(__name__)

ARCHIVE_FORMAT = "job_archive_v1"
# Same columns as firecrawl export_job_archive.py, minus `embedding` (PostgREST
# 400s that filter) so a restore can stand the old corpus back up.
JOB_COLUMNS = (
    "job_id,job_title,job_description,company_name,industry,location,apply_url,"
    "main_skills,side_skills,batch_date,first_seen,last_seen,is_active,"
    "change_fingerprint,role_domain,industry_group,location_city,report_count,"
    "location_raw,location_country,location_mode,location_quality,locations,"
    "job_summary,date_posted,seniority_level,work_mode,min_years_experience,"
    "max_years_experience,ingestion_source,source_platform,quality_status,"
    "source_url,listing_confidence,last_verified_live_at,"
    "last_verification_attempt_at,consecutive_complete_misses,confidence_reason,"
    "quarantined_at,quarantine_until,deletion_eligible_at,retired_at,"
    "reactivated_at,lifecycle_updated_at,company_id,last_source_run_id,"
    "source_content_hash,enriched_source_hash,job_content_hash,"
    "enrichment_status,enrichment_model,enrichment_version,"
    "enrichment_queued_at,enrichment_started_at,enriched_at,"
    "enrichment_last_error,enrichment_priority_requested_at,"
    "last_conclusive_verification_at,consecutive_verify_failures"
)
_IN_CHUNK = 40


def write_archive_bundle(
    jobs: list[dict[str, Any]],
    skill_edges: list[dict[str, Any]],
    output_dir: Path,
    *,
    created_at: datetime,
) -> dict[str, Any]:
    """Write archive_jobs.json, archive_job_skills.json, CSV, and manifest."""
    output_dir.mkdir(parents=True, exist_ok=True)
    jobs_path = output_dir / "archive_jobs.json"
    skills_path = output_dir / "archive_job_skills.json"
    csv_path = output_dir / "archive_jobs.csv"
    jobs_path.write_text(json.dumps(jobs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    skills_path.write_text(
        json.dumps(skill_edges, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    csv_path.write_text(_jobs_csv(jobs), encoding="utf-8")
    by_company: Counter[str] = Counter(str(job.get("company_name") or "Unknown") for job in jobs)
    manifest = {
        "archive_format": ARCHIVE_FORMAT,
        "project_ref": "gipvxuugajkugntwkeiz",
        "created_at_utc": created_at.isoformat(),
        "selector": "listing_confidence=closed AND deletion_eligible_at<=now()",
        "jobs": {
            "count": len(jobs),
            "distinct_companies": len(by_company),
            "sha256": _sha256(jobs_path),
        },
        "job_skills": {"count": len(skill_edges), "sha256": _sha256(skills_path)},
        "csv": {"sha256": _sha256(csv_path)},
    }
    (output_dir / "archive_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def archive_then_retire(
    db: Client,
    *,
    limit: int = 500,
    now: Callable[[], datetime] | None = None,
    local_root: Path | None = None,
) -> int:
    """Write a v1 bundle to disk, then delete exactly those job ids."""
    if (
        local_root is None
        and os.getenv("RAILWAY_ENVIRONMENT")
        and not os.getenv("JOB_UNLOAD_ARCHIVE_DIR")
    ):
        log.info("metric job_unload.skipped reason=no_persistent_disk")
        return 0
    capped = max(1, min(limit, 5000))
    listed = (
        db.rpc("list_unload_candidates", {"p_limit": capped}).execute().data or []
    )
    ids = [str(row["job_id"]) for row in listed if row.get("job_id")]
    if not ids:
        return 0
    jobs = _fetch_jobs(db, ids)
    archived_ids = [str(job["job_id"]) for job in jobs if job.get("job_id")]
    if not archived_ids:
        log.error("metric job_unload.fetch_empty listed=%d", len(ids))
        return 0
    skills = _fetch_skills(db, archived_ids)
    stamp = (now or (lambda: datetime.now(timezone.utc)))()
    batch = stamp.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]
    root = local_root if local_root is not None else _default_local_root()
    output_dir = root / stamp.strftime("%Y-%m-%d") / batch
    write_archive_bundle(jobs, skills, output_dir, created_at=stamp)
    deleted = (
        db.rpc(
            "retire_closed_jobs",
            {"p_limit": capped, "p_job_ids": archived_ids},
        ).execute().data
        or []
    )
    log.info(
        "metric job_unload.archived jobs=%d skills=%d deleted=%d dir=%s",
        len(jobs), len(skills), len(deleted), output_dir,
    )
    return len(deleted)


def _default_local_root() -> Path:
    return Path(os.getenv("JOB_UNLOAD_ARCHIVE_DIR", "job_unloads"))


def _fetch_jobs(db: Client, ids: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for start in range(0, len(ids), _IN_CHUNK):
        chunk = ids[start : start + _IN_CHUNK]
        batch = (
            db.table("jobs")
            .select(JOB_COLUMNS)
            .in_("job_id", chunk)
            .execute()
            .data
            or []
        )
        rows.extend(batch)
    return rows


def _fetch_skills(db: Client, ids: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for start in range(0, len(ids), _IN_CHUNK):
        chunk = ids[start : start + _IN_CHUNK]
        batch = (
            db.table("job_skills")
            .select("job_id,skill_id,is_primary,required_level")
            .in_("job_id", chunk)
            .execute()
            .data
            or []
        )
        rows.extend(batch)
    return rows


def _jobs_csv(jobs: list[dict[str, Any]]) -> str:
    fields = (
        "job_id", "job_title", "company_name", "listing_confidence",
        "last_seen", "apply_url", "location",
    )
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for job in jobs:
        writer.writerow({key: job.get(key) or "" for key in fields})
    return buf.getvalue()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()
