"""
csv_importer.py — JSON importer (Dump 2+)

Walks All_CSV_Outputs_thru_firecrawl/, picks the latest jobs.json per company,
and upserts directly into Supabase public.jobs.

Run from project root:
    python3 backend/app/services/csv_importer.py
"""

import json
import os
import sys
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

# ── Paths ─────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parents[3]
FIRECRAWL_BASE = Path("/Users/incognito/Mirror CV/firecrawl/All_CSV_Outputs_thru_firecrawl")
ENV_FILE = PROJECT_ROOT / "backend" / ".env"

BATCH_SIZE = 100

# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_date_safe(val: object) -> str | None:
    if val is None:
        return None
    if isinstance(val, (date, datetime)):
        return val if isinstance(val, str) else str(val)[:10]
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def discover_json_files(base: Path) -> list[Path]:
    """Return the latest jobs.json for each company folder."""
    found = []
    for company_dir in sorted(base.iterdir()):
        if not company_dir.is_dir():
            continue
        outputs_dir = company_dir / "Outputs"
        if not outputs_dir.is_dir():
            continue
        date_dirs = sorted(d for d in outputs_dir.iterdir() if d.is_dir())
        if not date_dirs:
            continue
        json_path = date_dirs[-1] / "jobs.json"
        if json_path.exists():
            found.append(json_path)
    return found


def preprocess(jobs: list[dict]) -> tuple[list[dict], int, int]:
    """
    Clean a company's raw job list before upload.
    Returns (clean_jobs, n_dropped_invalid, n_dropped_dupes).
    Steps:
      1. Drop rows missing job_id or title
      2. Deduplicate by job_id — last occurrence wins
      3. Normalize empty strings → None across all string fields
    """
    # 1. drop invalid
    valid = [j for j in jobs if j.get("job_id") and j.get("title")]
    n_invalid = len(jobs) - len(valid)

    # 2. dedup — iterate in order so last occurrence overwrites earlier ones
    seen: dict[str, dict] = {}
    for job in valid:
        seen[str(job["job_id"])] = job
    n_dupes = len(valid) - len(seen)

    # 3. normalize empty strings → None
    clean = []
    for job in seen.values():
        clean.append({
            k: (None if isinstance(v, str) and v.strip() == "" else v)
            for k, v in job.items()
        })

    return clean, n_invalid, n_dupes


def _to_int(val: object) -> int | None:
    try:
        return int(float(val)) if val is not None else None
    except (ValueError, TypeError):
        return None


def build_posting(job: dict, company_folder: str) -> dict:
    city = job.get("location_city") or ""
    country = job.get("location_country") or "India"
    location_parts = [p for p in [city, country] if p]
    location = ", ".join(location_parts) or None

    def _skill_list(field: str) -> list[str]:
        val = job.get(field)
        if isinstance(val, list):
            return [str(s).strip() for s in val if s and str(s).strip()]
        if isinstance(val, str) and val.strip():
            return [val.strip()]
        return []

    return {
        "job_id":           str(job["job_id"]),
        "job_title":        str(job["title"]),
        "company_name":     job.get("company_name") or None,
        "industry":         job.get("industry") or None,
        "location":         location,
        "apply_url":        job.get("job_url") or None,
        "job_description":  job.get("raw_jd_text") or None,
        "main_skills":      _skill_list("skills_required"),
        "side_skills":      _skill_list("skills_preferred"),
        "batch_date":       parse_date_safe(job.get("date_posted")) or date.today().isoformat(),
    }


def upsert_batch(supabase: Client, batch: list[dict]) -> None:
    supabase.table("jobs").upsert(batch, on_conflict="job_id").execute()


def deactivate_removed_jobs(supabase: Client, current_ids: set[str]) -> int:
    result = supabase.table("jobs").select("job_id").execute()
    to_delete = [r["job_id"] for r in result.data if r["job_id"] not in current_ids]
    if not to_delete:
        return 0
    for i in range(0, len(to_delete), BATCH_SIZE):
        supabase.table("jobs").delete().in_(
            "job_id", to_delete[i : i + BATCH_SIZE]
        ).execute()
    return len(to_delete)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    load_dotenv(ENV_FILE)
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in backend/.env")
        sys.exit(1)

    json_files = discover_json_files(FIRECRAWL_BASE)
    if not json_files:
        print(f"ERROR: No jobs.json files found under {FIRECRAWL_BASE}")
        sys.exit(1)
    print(f"Found {len(json_files)} company JSON files")

    supabase: Client = create_client(supabase_url, supabase_key)

    batch: list[dict] = []
    total_jobs = 0
    current_ids: set[str] = set()

    for json_path in json_files:
        company_folder = json_path.parts[-4]  # .../CompanyName/Outputs/date/jobs.json
        with open(json_path) as f:
            jobs = json.load(f)

        clean, n_invalid, n_dupes = preprocess(jobs)
        flags = []
        if n_invalid:
            flags.append(f"{n_invalid} invalid dropped")
        if n_dupes:
            flags.append(f"{n_dupes} dupes removed")
        suffix = f"  ⚠ {', '.join(flags)}" if flags else ""
        print(f"  {company_folder}: {len(clean)} jobs{suffix}")

        for job in clean:
            posting = build_posting(job, company_folder)
            batch.append(posting)
            current_ids.add(str(job["job_id"]))
            total_jobs += 1

            if len(batch) >= BATCH_SIZE:
                upsert_batch(supabase, batch)
                batch = []

    if batch:
        upsert_batch(supabase, batch)

    print(f"\n{total_jobs} job postings upserted")

    print("Running deactivation sweep...")
    n_deactivated = deactivate_removed_jobs(supabase, current_ids)
    print(f"  {n_deactivated} jobs marked inactive" if n_deactivated else "  No jobs deactivated")
    print("\nDone.")


if __name__ == "__main__":
    main()
