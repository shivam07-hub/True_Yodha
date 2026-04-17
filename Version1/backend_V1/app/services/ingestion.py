"""
CSV → SQLite ingestion service.
Reads the master normalized CSV and upserts into the jobs table.
"""

import logging
from pathlib import Path

import pandas as pd
from sqlalchemy.orm import Session

from app.models import Job

logger = logging.getLogger(__name__)


def _clean_value(val):
    """Convert pandas NaN / 'nan' / empty string to None."""
    if pd.isna(val) or val == "" or str(val).strip().lower() == "nan":
        return None
    return val


def _parse_bool(val) -> bool | None:
    if pd.isna(val) or val == "":
        return None
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() in ("true", "1", "yes")


def _parse_float(val) -> float | None:
    if pd.isna(val) or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def ingest_csv(db: Session, csv_path: Path, clear_existing: bool = True) -> dict:
    """
    Load the master CSV into the jobs table.

    Args:
        db: SQLAlchemy session
        csv_path: Path to ALL_JOBS_NORMALIZED_*.csv
        clear_existing: If True, delete all existing jobs before import

    Returns:
        dict with ingestion stats
    """
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    df = pd.read_csv(csv_path, dtype=str)  # read everything as string for safety
    logger.info(f"Read {len(df)} rows from {csv_path.name}")

    # Drop rows where title AND company_name are both missing — these are empty
    df = df.dropna(subset=["title", "company_name"], how="all")
    logger.info(f"{len(df)} rows after dropping empty title+company")

    if clear_existing:
        deleted = db.query(Job).delete()
        db.commit()
        logger.info(f"Cleared {deleted} existing jobs")

    jobs_added = 0
    jobs_skipped = 0

    for _, row in df.iterrows():
        title = _clean_value(row.get("title"))
        company = _clean_value(row.get("company_name"))

        if not title and not company:
            jobs_skipped += 1
            continue

        job = Job(
            job_id=_clean_value(row.get("job_id")),
            title=title,
            company_name=company,
            business_unit=_clean_value(row.get("business_unit")),
            job_url=_clean_value(row.get("job_url")),
            source_platform=_clean_value(row.get("source_platform")),
            raw_jd_text=_clean_value(row.get("raw_jd_text")),
            skills_required=_clean_value(row.get("skills_required")),
            skills_preferred=_clean_value(row.get("skills_preferred")),
            min_years_experience=_parse_float(row.get("min_years_experience")),
            max_years_experience=_parse_float(row.get("max_years_experience")),
            seniority_level=_clean_value(row.get("seniority_level")),
            location_city=_clean_value(row.get("location_city")),
            location_country=_clean_value(row.get("location_country")),
            work_mode=_clean_value(row.get("work_mode")),
            employment_type=_clean_value(row.get("employment_type")),
            degree_required=_clean_value(row.get("degree_required")),
            degree_preferred_field=_clean_value(row.get("degree_preferred_field")),
            industry=_clean_value(row.get("industry")),
            salary_min=_parse_float(row.get("salary_min")),
            salary_max=_parse_float(row.get("salary_max")),
            salary_currency=_clean_value(row.get("salary_currency")),
            date_posted=_clean_value(row.get("date_posted")),
            is_active=_parse_bool(row.get("is_active")),
        )
        db.add(job)
        jobs_added += 1

    db.commit()
    logger.info(f"Ingested {jobs_added} jobs, skipped {jobs_skipped}")

    return {
        "csv_rows_read": len(df) + jobs_skipped,
        "jobs_ingested": jobs_added,
        "jobs_skipped": jobs_skipped,
    }
