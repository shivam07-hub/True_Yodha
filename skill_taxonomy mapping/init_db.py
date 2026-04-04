"""
init_db.py — Step 1: Initialize the taxonomy database and import IT jobs.

Usage:
    python init_db.py                          # Import all companies
    python init_db.py --company Stripe         # Import one company only
    python init_db.py --company Stripe Google  # Import specific companies

What it does:
  1. Creates review_db.sqlite with the required schema
  2. Discovers the latest *FULL* CSV for each company in All_CSV_Outputs/
  3. Filters to IT-domain jobs in India
  4. Inserts jobs into the DB (skips duplicates by job_id + company)
  5. Records which CSV file was loaded per company
"""

import argparse
import csv
import json
import sqlite3
from datetime import datetime
from pathlib import Path

from config import (
    CSV_BASE,
    DB_PATH,
    IT_INDUSTRY_KEYWORDS,
    MIN_JD_LENGTH,
    TAXONOMY_CATEGORIES,
)

# ── Schema ─────────────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
    company_name     TEXT PRIMARY KEY,
    last_csv_path    TEXT,
    last_imported_at TIMESTAMP,
    last_monitored_at TIMESTAMP,
    total_it_jobs    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jobs (
    job_id            TEXT,
    company_name      TEXT,
    title             TEXT,
    business_unit     TEXT,
    seniority_level   TEXT,
    industry          TEXT,
    location_city     TEXT,
    location_country  TEXT,
    work_mode         TEXT,
    job_url           TEXT,
    raw_jd_text       TEXT,
    date_posted       TEXT,
    source_platform   TEXT,
    is_active         INTEGER DEFAULT 1,
    extraction_status TEXT DEFAULT 'pending',   -- pending | extracted | failed | skipped
    review_status     TEXT DEFAULT 'pending',    -- pending | reviewed | skipped
    extracted_at      TIMESTAMP,
    reviewed_at       TIMESTAMP,
    imported_from     TEXT,
    imported_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (job_id, company_name)
);

CREATE TABLE IF NOT EXISTS extracted_skills (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id                  TEXT,
    company_name            TEXT,
    skill_name              TEXT,               -- normalized lowercase
    skill_raw               TEXT,               -- as Claude extracted it
    suggested_classification TEXT,              -- 'primary' | 'secondary'
    user_classification     TEXT,               -- 'primary' | 'secondary' | 'ignore'
    category                TEXT,               -- taxonomy category
    evidence                TEXT,               -- JD quote
    reviewed_at             TIMESTAMP,
    UNIQUE(job_id, company_name, skill_name)
);

CREATE TABLE IF NOT EXISTS taxonomy (
    skill_name         TEXT PRIMARY KEY,
    category           TEXT NOT NULL,
    aliases            TEXT DEFAULT '[]',       -- JSON array
    first_seen_job_id  TEXT,
    first_seen_company TEXT,
    primary_count      INTEGER DEFAULT 0,
    secondary_count    INTEGER DEFAULT 0,
    added_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT,
    csv_file     TEXT,
    new_jobs     INTEGER DEFAULT 0,
    updated_jobs INTEGER DEFAULT 0,
    run_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_extraction ON jobs(extraction_status, company_name);
CREATE INDEX IF NOT EXISTS idx_jobs_review     ON jobs(review_status, company_name);
CREATE INDEX IF NOT EXISTS idx_skills_job      ON extracted_skills(job_id, company_name);
"""


# ── Helpers ────────────────────────────────────────────────────────────────────

def is_it_job(row: dict) -> bool:
    """Return True if this job is in the IT domain (India only, all jobs are India)."""
    industry = row.get("industry", "").lower()
    return any(kw in industry for kw in IT_INDUSTRY_KEYWORDS)


def find_latest_full_csv(company_folder: Path) -> Path | None:
    """Return the most recent *FULL* CSV in a company's Outputs folder."""
    candidates = sorted(company_folder.rglob("*FULL*.csv"))
    # Exclude checkpoint files
    candidates = [p for p in candidates if ".ipynb_checkpoints" not in str(p)]
    return candidates[-1] if candidates else None


def discover_companies(csv_base: Path, filter_names: list[str] | None = None) -> list[tuple[str, Path]]:
    """
    Return list of (company_name, latest_csv_path) for all (or selected) companies.
    """
    result = []
    for company_dir in sorted(csv_base.iterdir()):
        if not company_dir.is_dir() or company_dir.name == "Master_Output":
            continue
        company_name = company_dir.name.replace("_", " ").strip()

        if filter_names:
            # Case-insensitive match
            if not any(f.lower() in company_name.lower() for f in filter_names):
                continue

        csv_path = find_latest_full_csv(company_dir)
        if csv_path:
            result.append((company_name, csv_path))
        else:
            print(f"  ⚠️  No FULL CSV found for {company_name} — skipping")

    return result


def import_company(conn: sqlite3.Connection, company_name: str, csv_path: Path) -> dict:
    """Import IT jobs from a company's CSV. Returns import stats."""
    stats = {"inserted": 0, "skipped_dup": 0, "skipped_non_it": 0, "skipped_short_jd": 0}

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    now = datetime.now().isoformat()

    for row in rows:
        if not is_it_job(row):
            stats["skipped_non_it"] += 1
            continue

        job_id = str(row.get("job_id", "")).strip()
        if not job_id:
            continue

        raw_jd = row.get("raw_jd_text", "").strip()

        # Mark very short JDs as skipped-extraction (no point sending to Claude)
        extraction_status = "pending" if len(raw_jd) >= MIN_JD_LENGTH else "skipped"

        try:
            conn.execute(
                """
                INSERT INTO jobs
                    (job_id, company_name, title, business_unit, seniority_level,
                     industry, location_city, location_country, work_mode, job_url,
                     raw_jd_text, date_posted, source_platform, is_active,
                     extraction_status, imported_from, imported_at)
                VALUES
                    (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    job_id,
                    company_name,
                    row.get("title", "").strip(),
                    row.get("business_unit", "").strip(),
                    row.get("seniority_level", "").strip(),
                    row.get("industry", "").strip(),
                    row.get("location_city", "").strip(),
                    row.get("location_country", "").strip(),
                    row.get("work_mode", "").strip(),
                    row.get("job_url", "").strip(),
                    raw_jd,
                    row.get("date_posted", "").strip(),
                    row.get("source_platform", "").strip(),
                    1 if str(row.get("is_active", "True")).lower() in ("true", "1") else 0,
                    extraction_status,
                    str(csv_path),
                    now,
                ),
            )
            stats["inserted"] += 1
        except sqlite3.IntegrityError:
            stats["skipped_dup"] += 1

    conn.commit()

    # Update companies table
    it_count = stats["inserted"]
    conn.execute(
        """
        INSERT INTO companies (company_name, last_csv_path, last_imported_at, total_it_jobs)
        VALUES (?,?,?,?)
        ON CONFLICT(company_name) DO UPDATE SET
            last_csv_path    = excluded.last_csv_path,
            last_imported_at = excluded.last_imported_at,
            total_it_jobs    = total_it_jobs + excluded.total_it_jobs
        """,
        (company_name, str(csv_path), now, it_count),
    )
    conn.commit()

    return stats


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Initialize the taxonomy DB and import IT jobs.")
    parser.add_argument(
        "--company",
        nargs="*",
        metavar="NAME",
        help="Import only these companies (e.g. --company Stripe Google). Default: all.",
    )
    args = parser.parse_args()

    # Create DB
    print(f"📂 Database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    conn.commit()
    print("✅ Schema created / verified\n")

    # Discover companies
    companies = discover_companies(CSV_BASE, filter_names=args.company)
    print(f"Found {len(companies)} company CSV(s) to import:\n")

    total_inserted = 0
    total_skipped_non_it = 0

    for company_name, csv_path in companies:
        print(f"  [{company_name}]  {csv_path.name}")
        stats = import_company(conn, company_name, csv_path)
        print(
            f"    ✓ {stats['inserted']:>4} IT jobs imported"
            f"  |  {stats['skipped_dup']:>4} duplicates skipped"
            f"  |  {stats['skipped_non_it']:>4} non-IT skipped"
            f"  |  {stats['skipped_short_jd']:>4} short JD (will not extract)"
        )
        total_inserted += stats["inserted"]
        total_skipped_non_it += stats["skipped_non_it"]

    # Summary
    total_jobs = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    pending_extraction = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE extraction_status='pending'"
    ).fetchone()[0]

    print(f"\n{'─'*55}")
    print(f"  Total IT jobs in DB      : {total_jobs:>5}")
    print(f"  Pending skill extraction : {pending_extraction:>5}")
    print(f"\n👉 Next step: python extract_skills.py")
    print(f"   (or: python extract_skills.py --company Stripe)")

    conn.close()


if __name__ == "__main__":
    main()
