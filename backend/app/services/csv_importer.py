"""
csv_importer.py
Stage 2 of the two-stage import pipeline.

Reads the enhanced xlsx produced by groq_tagger.py and upserts into Supabase.
No Groq calls — all skill tagging is already done.

Run from project root (after groq_tagger.py has produced an enhanced xlsx):
    python3 backend/app/services/csv_importer.py

Reads:
    Market Data/Job_Scrapers/All_CSV_Outputs/Enhanced/ENHANCED_JOBS_*.xlsx
    (uses the most recently modified file)

Steps:
  1. Load taxonomy → resolve skill keys to DB skill IDs
  2. Read enhanced xlsx
  3. Upsert all jobs to job_postings
  4. Upsert unknown skills to candidate_skills_queue
  5. Deactivation sweep — mark jobs no longer in the feed as is_active = false

Safe to re-run — upserts on external_id conflict key.
"""

import json
import os
import re
import sys
from datetime import date, datetime
from pathlib import Path

import openpyxl
from dotenv import load_dotenv
from supabase import Client, create_client

# ── Paths ─────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parents[3]
ENHANCED_OUTPUT_DIR = (
    PROJECT_ROOT / "Market Data" / "Job_Scrapers" / "All_CSV_Outputs" / "Enhanced"
)
ENV_FILE = PROJECT_ROOT / "backend" / ".env"

BATCH_SIZE = 100

# ── Seniority → required_level ────────────────────────────────────────────────

SENIORITY_LEVEL_MAP: dict[str, int] = {
    "entry": 1, "junior": 2, "associate": 2,
    "mid": 3, "intermediate": 3, "senior": 3,
    "lead": 4, "principal": 4, "staff": 4, "director": 4,
    "head": 5, "vp": 5, "architect": 4,
}
DEFAULT_LEVEL = 3

# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_date_safe(val: object) -> str | None:
    """Parse date to ISO string. Returns None for unparseable values like 'Posted Today'."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date().isoformat()
    if isinstance(val, date):
        return val.isoformat()
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None  # "Posted Today", "2 days ago", etc. → null


def latest_enhanced_file() -> Path | None:
    files = sorted(ENHANCED_OUTPUT_DIR.glob("ENHANCED_JOBS_*.xlsx"), key=lambda p: p.stat().st_mtime)
    return files[-1] if files else None


def fetch_skill_id_map(supabase: Client) -> dict[str, int]:
    result = supabase.table("skills").select("id, taxonomy_key").execute()
    return {row["taxonomy_key"]: row["id"] for row in result.data}


def infer_required_level(seniority: str | None) -> int:
    if not seniority:
        return DEFAULT_LEVEL
    return SENIORITY_LEVEL_MAP.get(seniority.strip().lower(), DEFAULT_LEVEL)


def parse_skill_list(cell_value: str | None, skill_id_map: dict[str, int], required_level: int) -> list[dict]:
    """Parse comma-separated taxonomy keys from enhanced xlsx → [{skill_id, required_level}]."""
    if not cell_value:
        return []
    result = []
    for key in str(cell_value).split(","):
        key = key.strip()
        skill_id = skill_id_map.get(key)
        if skill_id:
            result.append({"skill_id": skill_id, "required_level": required_level})
    return result


def parse_unknown_skills(cell_value: str | None) -> list[str]:
    if not cell_value:
        return []
    return [s.strip() for s in str(cell_value).split(",") if s.strip()]

# ── Read enhanced xlsx ────────────────────────────────────────────────────────

def read_enhanced_jobs(xlsx_path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(xlsx_path, read_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    headers = [str(h) for h in next(rows)]
    jobs = []
    for row in rows:
        col = {h: row[i] for i, h in enumerate(headers)}
        if not col.get("job_id") or not col.get("title"):
            continue
        jobs.append(col)
    wb.close()
    return jobs

# ── Build Supabase row ────────────────────────────────────────────────────────

def build_posting(job: dict, skill_id_map: dict[str, int]) -> dict:
    required_level = infer_required_level(job.get("seniority_level"))

    primary = parse_skill_list(job.get("groq_required_skills"), skill_id_map, required_level)
    secondary = parse_skill_list(job.get("groq_preferred_skills"), skill_id_map, required_level)

    location_parts = [p for p in [job.get("location_city"), job.get("location_country")] if p]
    location = ", ".join(str(p) for p in location_parts) or None

    work_mode = str(job.get("work_mode") or "").lower()
    date_posted = job.get("date_posted")

    return {
        "external_id": str(job["job_id"]),
        "title": str(job["title"]),
        "company": job.get("company") or None,
        "location": location,
        "remote": work_mode in ("remote", "hybrid"),
        "description": job.get("raw_jd_text") or None,
        "primary_skills": json.dumps(primary),
        "secondary_skills": json.dumps(secondary),
        "raw_skill_text": [],
        "min_years_experience": job.get("groq_min_years_experience") or None,
        "min_qualification": job.get("groq_min_qualification") or "Any",
        "salary_min": job.get("salary_min") or None,
        "salary_max": job.get("salary_max") or None,
        "salary_currency": str(job.get("salary_currency") or "INR"),
        "source": job.get("source_file") or None,
        "source_url": job.get("job_url") or None,
        "posted_at": parse_date_safe(date_posted),
        "is_active": True,
    }

# ── Upsert helpers ────────────────────────────────────────────────────────────

def upsert_batch(supabase: Client, batch: list[dict]) -> int:
    supabase.table("job_postings").upsert(batch, on_conflict="external_id").execute()
    return len(batch)


def upsert_candidate_skills(supabase: Client, unknown_counts: dict[str, int]) -> int:
    if not unknown_counts:
        return 0
    rows = [{"skill_name_raw": skill, "job_count": count} for skill, count in unknown_counts.items()]
    supabase.table("candidate_skills_queue").upsert(rows, on_conflict="skill_name_raw").execute()
    return len(rows)

# ── Deactivation sweep ────────────────────────────────────────────────────────

def deactivate_removed_jobs(supabase: Client, current_external_ids: set[str]) -> int:
    """Mark jobs active in DB but absent from this run as is_active = false."""
    result = supabase.table("job_postings").select("external_id").eq("is_active", True).execute()
    active_in_db = {row["external_id"] for row in result.data}
    to_deactivate = list(active_in_db - current_external_ids)

    if not to_deactivate:
        return 0

    for i in range(0, len(to_deactivate), BATCH_SIZE):
        batch = to_deactivate[i: i + BATCH_SIZE]
        supabase.table("job_postings").update({"is_active": False}).in_("external_id", batch).execute()

    return len(to_deactivate)

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    load_dotenv(ENV_FILE)
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")

    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in backend/.env")
        sys.exit(1)

    enhanced_file = latest_enhanced_file()
    if not enhanced_file:
        print(f"ERROR: No enhanced xlsx found in {ENHANCED_OUTPUT_DIR}")
        print("Run groq_tagger.py first.")
        sys.exit(1)

    print(f"Reading enhanced file: {enhanced_file.name}")
    jobs = read_enhanced_jobs(enhanced_file)
    print(f"  {len(jobs)} jobs loaded")

    print("\nConnecting to Supabase...")
    supabase: Client = create_client(supabase_url, supabase_key)
    skill_id_map = fetch_skill_id_map(supabase)
    if not skill_id_map:
        print("ERROR: No skills found in Supabase. Apply seed_skills.sql first.")
        sys.exit(1)
    print(f"  {len(skill_id_map)} skills in DB")

    # Upsert job_postings
    print("\nUpserting job_postings...")
    batch: list[dict] = []
    total_upserted = 0
    current_ids: set[str] = set()
    unknown_counts: dict[str, int] = {}

    for job in jobs:
        posting = build_posting(job, skill_id_map)
        batch.append(posting)
        current_ids.add(str(job["job_id"]))

        for skill in parse_unknown_skills(job.get("groq_unknown_skills")):
            unknown_counts[skill] = unknown_counts.get(skill, 0) + 1

        if len(batch) >= BATCH_SIZE:
            total_upserted += upsert_batch(supabase, batch)
            batch = []
            print(f"  {total_upserted}/{len(jobs)} upserted...", end="\r")

    if batch:
        total_upserted += upsert_batch(supabase, batch)

    print(f"  {total_upserted} job postings upserted.        ")

    # Upsert unknown skills
    n_candidates = upsert_candidate_skills(supabase, unknown_counts)
    if n_candidates:
        print(f"  {n_candidates} unknown skills logged to candidate_skills_queue")

    # Deactivation sweep
    print("\nRunning deactivation sweep...")
    n_deactivated = deactivate_removed_jobs(supabase, current_ids)
    if n_deactivated:
        print(f"  {n_deactivated} jobs marked inactive (no longer in feed)")
    else:
        print("  No jobs deactivated")

    print("\nDone.")


if __name__ == "__main__":
    main()
