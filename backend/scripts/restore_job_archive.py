#!/usr/bin/env python3
"""Restore a job_archive_v1 directory back into public.jobs.

From backend/ with the venv and .env loaded:
    python -m scripts.restore_job_archive path/to/archive_dir
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from app.database import get_supabase_admin


CHUNK = 200


def skill_rows_for_restore(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop the serial PK so restore cannot collide; upsert on (job_id, skill_id)."""
    restored: list[dict[str, Any]] = []
    for row in rows:
        item: dict[str, Any] = {
            "job_id": row["job_id"],
            "skill_id": row["skill_id"],
            "is_primary": row.get("is_primary", True),
        }
        if "required_level" in row:
            item["required_level"] = row["required_level"]
        restored.append(item)
    return restored


def main() -> None:
    parser = argparse.ArgumentParser(description="Upsert a job_archive_v1 bundle into jobs")
    parser.add_argument("archive_dir", type=Path)
    args = parser.parse_args()
    jobs_path = args.archive_dir / "archive_jobs.json"
    skills_path = args.archive_dir / "archive_job_skills.json"
    if not jobs_path.is_file():
        raise SystemExit(f"missing {jobs_path}")
    db = get_supabase_admin()
    jobs = json.loads(jobs_path.read_text(encoding="utf-8"))
    raw_skills = json.loads(skills_path.read_text(encoding="utf-8")) if skills_path.is_file() else []
    skills = skill_rows_for_restore(raw_skills)
    for start in range(0, len(jobs), CHUNK):
        db.table("jobs").upsert(jobs[start : start + CHUNK], on_conflict="job_id").execute()
    for start in range(0, len(skills), CHUNK):
        db.table("job_skills").upsert(
            skills[start : start + CHUNK],
            on_conflict="job_id,skill_id",
        ).execute()
    print(f"restored {len(jobs)} jobs, {len(skills)} skill edges from {args.archive_dir}")


if __name__ == "__main__":
    main()
