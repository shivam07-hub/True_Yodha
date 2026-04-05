"""
csv_importer.py
Reads master job xlsx files, pre-tags skills via Groq, and upserts into Supabase.

Run from project root (after schema + seed applied to Supabase):
    python3 backend/app/services/csv_importer.py

Flow:
  1. Load taxonomy aliases
  2. Read all jobs from master xlsx files
  3. Call Groq (via skill_tagger.py) to extract required/preferred skills per job
     — cached in database/skill_tag_cache.json so re-runs skip already-tagged jobs
  4. Upsert all rows into Supabase job_postings

Data source:
    Market Data/Job_Scrapers/All_CSV_Outputs/Master_Output/ALL_JOBS_NORMALIZED_*.xlsx

Safe to re-run — upserts on external_id conflict key.
"""

import json
import os
import sys
from pathlib import Path

import openpyxl
from dotenv import load_dotenv
from supabase import Client, create_client

from app.services.skill_tagger import get_tags_for_job, tag_jobs_with_groq

# ── Paths ─────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parents[3]
TAXONOMY_JSON = PROJECT_ROOT / "skill_taxonomy mapping" / "taxonomy.json"
MASTER_OUTPUT_DIR = (
    PROJECT_ROOT / "Market Data" / "Job_Scrapers" / "All_CSV_Outputs" / "Master_Output"
)
ENV_FILE = PROJECT_ROOT / "backend" / ".env"
MASTER_FILES = sorted(MASTER_OUTPUT_DIR.glob("ALL_JOBS_NORMALIZED_*.xlsx"))

BATCH_SIZE = 100  # rows per Supabase upsert call

# ── Seniority → required_level ────────────────────────────────────────────────

SENIORITY_LEVEL_MAP: dict[str, int] = {
    "entry": 1,
    "junior": 2,
    "associate": 2,
    "mid": 3,
    "intermediate": 3,
    "senior": 3,
    "lead": 4,
    "principal": 4,
    "staff": 4,
    "director": 4,
    "head": 5,
    "vp": 5,
    "architect": 4,
}
DEFAULT_LEVEL = 3


def load_taxonomy(json_path: Path) -> tuple[dict[str, str], dict]:
    """Returns (alias_map, raw_taxonomy). alias_map: alias_lower → taxonomy_key."""
    with open(json_path, encoding="utf-8") as f:
        taxonomy = json.load(f)

    alias_map: dict[str, str] = {}
    for _category, skills in taxonomy["categories"].items():
        for skill_key, skill_info in skills.items():
            aliases = skill_info["aliases"]
            alias_map[skill_key.lower()] = skill_key
            alias_map[aliases["display_name"].lower()] = skill_key
            for tech in aliases.get("technologies", []):
                alias_map[tech.lower()] = skill_key
    return alias_map, taxonomy


def fetch_skill_id_map(supabase: Client) -> dict[str, int]:
    result = supabase.table("skills").select("id, taxonomy_key").execute()
    return {row["taxonomy_key"]: row["id"] for row in result.data}


def infer_required_level(seniority: str | None) -> int:
    if not seniority:
        return DEFAULT_LEVEL
    return SENIORITY_LEVEL_MAP.get(seniority.strip().lower(), DEFAULT_LEVEL)


def build_skill_jsonb(
    taxonomy_keys: list[str],
    skill_id_map: dict[str, int],
    required_level: int,
) -> list[dict]:
    result = []
    for key in taxonomy_keys:
        skill_id = skill_id_map.get(key)
        if skill_id:
            result.append({"skill_id": skill_id, "required_level": required_level})
    return result


def read_all_jobs(master_files: list[Path]) -> list[dict]:
    """Read all xlsx files and return deduped list of job dicts (keyed by external_id)."""
    seen_ids: set[str] = set()
    jobs: list[dict] = []

    for xlsx_path in master_files:
        wb = openpyxl.load_workbook(xlsx_path, read_only=True)
        ws = wb.active
        rows = ws.iter_rows(values_only=True)
        headers = [str(h) for h in next(rows)]

        for row in rows:
            col = {h: row[i] for i, h in enumerate(headers)}
            external_id = str(col.get("job_id", "")).strip()
            title = str(col.get("title", "")).strip()

            if not external_id or not title or title == "See full role description":
                continue
            if external_id in seen_ids:
                continue

            seen_ids.add(external_id)
            jobs.append({
                "job_id": external_id,
                "title": title,
                "company": str(col.get("company_name") or "").strip() or None,
                "raw_jd_text": str(col.get("raw_jd_text") or "").strip() or None,
                "skills_required_raw": col.get("skills_required"),
                "skills_preferred_raw": col.get("skills_preferred"),
                "seniority_level": col.get("seniority_level"),
                "location_city": col.get("location_city"),
                "location_country": col.get("location_country"),
                "work_mode": col.get("work_mode"),
                "salary_min": col.get("salary_min"),
                "salary_max": col.get("salary_max"),
                "salary_currency": col.get("salary_currency"),
                "date_posted": col.get("date_posted"),
                "is_active": bool(col.get("is_active", True)),
                "job_url": str(col.get("job_url") or "").strip() or None,
                "source_file": xlsx_path.name,
            })

        wb.close()

    return jobs


def job_to_posting(
    job: dict,
    tag_cache: dict[str, dict],
    skill_id_map: dict[str, int],
    alias_map: dict[str, str],
) -> dict:
    required_level = infer_required_level(job.get("seniority_level"))

    # Use Groq-tagged skills from cache (contextual extraction)
    required_keys, preferred_keys, min_years, min_qual = get_tags_for_job(
        job["job_id"], tag_cache
    )

    # Fallback: if Groq returned nothing, try explicit xlsx columns
    if not required_keys and not preferred_keys:
        raw_req = job.get("skills_required_raw")
        raw_pref = job.get("skills_preferred_raw")
        if raw_req:
            for s in str(raw_req).split(","):
                k = alias_map.get(s.strip().lower())
                if k:
                    required_keys.append(k)
        if raw_pref:
            for s in str(raw_pref).split(","):
                k = alias_map.get(s.strip().lower())
                if k:
                    preferred_keys.append(k)

    primary_jsonb = build_skill_jsonb(required_keys, skill_id_map, required_level)
    secondary_jsonb = build_skill_jsonb(preferred_keys, skill_id_map, required_level)

    location_parts = [
        p for p in [job.get("location_city"), job.get("location_country")] if p
    ]
    location = ", ".join(str(p) for p in location_parts) or None

    work_mode = str(job.get("work_mode") or "").lower()
    is_remote = work_mode in ("remote", "hybrid")

    date_posted = job.get("date_posted")
    posted_at = str(date_posted) if date_posted else None

    return {
        "external_id": job["job_id"],
        "title": job["title"],
        "company": job.get("company"),
        "location": location,
        "remote": is_remote,
        "description": job.get("raw_jd_text"),
        "primary_skills": json.dumps(primary_jsonb),
        "secondary_skills": json.dumps(secondary_jsonb),
        "raw_skill_text": [],
        "min_years_experience": min_years,
        "min_qualification": min_qual,
        "salary_min": job.get("salary_min"),
        "salary_max": job.get("salary_max"),
        "salary_currency": str(job.get("salary_currency") or "USD"),
        "source": job.get("source_file"),
        "source_url": job.get("job_url"),
        "posted_at": posted_at,
        "is_active": job.get("is_active", True),
    }


def upsert_batch(supabase: Client, batch: list[dict]) -> int:
    supabase.table("job_postings").upsert(batch, on_conflict="external_id").execute()
    return len(batch)


def main() -> None:
    load_dotenv(ENV_FILE)
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", "")
    groq_api_key = os.getenv("GROQ_API_KEY", "")

    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in backend/.env")
        sys.exit(1)

    if not groq_api_key:
        print("ERROR: GROQ_API_KEY must be set in backend/.env")
        sys.exit(1)

    if not MASTER_FILES:
        print(f"ERROR: No master xlsx files found in {MASTER_OUTPUT_DIR}")
        sys.exit(1)

    # ── Step 1: Load taxonomy ─────────────────────────────────────────────────
    print("Loading taxonomy...")
    alias_map, _ = load_taxonomy(TAXONOMY_JSON)
    print(f"  {len(alias_map)} aliases")

    # ── Step 2: Read all jobs from xlsx ───────────────────────────────────────
    print(f"\nReading {len(MASTER_FILES)} master file(s)...")
    all_jobs = read_all_jobs(MASTER_FILES)
    print(f"  {len(all_jobs)} unique jobs loaded")

    # ── Step 3: Tag skills via Groq (cached) ──────────────────────────────────
    print("\nTagging skills with Groq (cached)...")
    tag_cache = tag_jobs_with_groq(all_jobs, alias_map, groq_api_key, verbose=True)

    # ── Step 4: Connect to Supabase ───────────────────────────────────────────
    print("\nConnecting to Supabase...")
    supabase: Client = create_client(supabase_url, supabase_key)

    skill_id_map = fetch_skill_id_map(supabase)
    if not skill_id_map:
        print("ERROR: No skills found in Supabase. Apply seed_skills.sql first.")
        sys.exit(1)
    print(f"  {len(skill_id_map)} skills in DB")

    # ── Step 5: Upsert job_postings ───────────────────────────────────────────
    print("\nUpserting job_postings...")
    batch: list[dict] = []
    total_inserted = 0

    for job in all_jobs:
        posting = job_to_posting(job, tag_cache, skill_id_map, alias_map)
        batch.append(posting)

        if len(batch) >= BATCH_SIZE:
            total_inserted += upsert_batch(supabase, batch)
            batch = []
            print(f"  {total_inserted}/{len(all_jobs)} upserted...", end="\r")

    if batch:
        total_inserted += upsert_batch(supabase, batch)

    print(f"\nDone. {total_inserted} job postings upserted to Supabase.")


if __name__ == "__main__":
    main()
