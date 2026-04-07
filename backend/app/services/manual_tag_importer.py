"""
manual_tag_importer.py
Human-in-the-loop alternative to groq_tagger.py.

Step 2 of 2: Read LLM-filled Excel back into the skill tag cache.

Usage:
    python3 -m app.services.manual_tag_importer --file "path/to/MANUAL_TAG_BATCH_001_20260407.xlsx"
    python3 -m app.services.manual_tag_importer --file "path/to/filled.xlsx" --dry-run

What it does:
    - Reads the 5 tag columns from the filled Excel
    - Validates skills against taxonomy (silently drops invalid keys)
    - Merges into database/skill_tag_cache.json
    - Reports how many jobs were added / skipped / had no required skills

After all batches are imported, run csv_importer.py to push to Supabase.
"""

import argparse
import json
import sys
from pathlib import Path

import openpyxl

PROJECT_ROOT = Path(__file__).resolve().parents[3]
TAXONOMY_JSON = PROJECT_ROOT / "skill_taxonomy mapping" / "taxonomy.json"
CACHE_FILE = PROJECT_ROOT / "database" / "skill_tag_cache.json"

VALID_QUALIFICATIONS = {"High School", "Diploma", "Bachelor's", "Master's", "MBA", "PhD", "Any"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_taxonomy_keys(json_path: Path) -> set[str]:
    with open(json_path, encoding="utf-8") as f:
        taxonomy = json.load(f)
    keys: set[str] = set()
    for _cat, skills in taxonomy["categories"].items():
        for skill_key in skills:
            keys.add(skill_key)
    return keys


def load_cache() -> dict[str, dict]:
    if CACHE_FILE.exists():
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache: dict[str, dict]) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)


def _split_skills(raw: str | None, valid_keys: set[str]) -> list[str]:
    if not raw:
        return []
    return [s.strip() for s in str(raw).split(",") if s.strip() in valid_keys]


def _parse_years(raw: str | None) -> int | None:
    if raw is None or str(raw).strip() in ("", "None", "null"):
        return None
    try:
        val = float(str(raw).strip())
        return int(val) if val > 0 else None
    except ValueError:
        return None


def _parse_qualification(raw: str | None) -> str:
    val = str(raw or "").strip()
    return val if val in VALID_QUALIFICATIONS else "Any"


def _split_unknown(raw: str | None) -> list[str]:
    if not raw:
        return []
    return list(dict.fromkeys(
        s.strip().lower() for s in str(raw).split(",") if s.strip()
    ))[:5]


# ── Reader ────────────────────────────────────────────────────────────────────

def read_filled_xlsx(xlsx_path: Path, valid_keys: set[str]) -> list[dict]:
    """Returns list of validated tag dicts, each with 'job_id' key."""
    wb = openpyxl.load_workbook(xlsx_path, read_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    headers = [str(h).strip() if h else "" for h in next(rows)]

    required_headers = {"job_id", "required_skills", "preferred_skills",
                        "unknown_skills", "min_years_experience", "min_qualification"}
    missing = required_headers - set(headers)
    if missing:
        print(f"ERROR: Excel is missing columns: {missing}")
        print(f"  Found: {headers}")
        sys.exit(1)

    results: list[dict] = []
    for row in rows:
        col = {h: row[i] for i, h in enumerate(headers) if h}
        jid = str(col.get("job_id", "")).strip()
        if not jid:
            continue

        required = _split_skills(col.get("required_skills"), valid_keys)
        preferred = _split_skills(col.get("preferred_skills"), valid_keys)
        # Ensure no overlap
        preferred = [s for s in preferred if s not in required]

        results.append({
            "job_id": jid,
            "required_skills": required,
            "preferred_skills": preferred,
            "unknown_skills": _split_unknown(col.get("unknown_skills")),
            "min_years_experience": _parse_years(col.get("min_years_experience")),
            "min_qualification": _parse_qualification(col.get("min_qualification")),
        })

    wb.close()
    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Import LLM-filled Excel tags into the skill cache")
    parser.add_argument("--file", required=True, help="Path to the filled Excel file")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate and report without writing to cache")
    args = parser.parse_args()

    xlsx_path = Path(args.file).expanduser().resolve()
    if not xlsx_path.exists():
        print(f"ERROR: File not found: {xlsx_path}")
        sys.exit(1)

    print(f"Loading taxonomy...")
    valid_keys = load_taxonomy_keys(TAXONOMY_JSON)

    print(f"Reading filled Excel: {xlsx_path.name}")
    rows = read_filled_xlsx(xlsx_path, valid_keys)
    print(f"  {len(rows)} rows read")

    cache = load_cache()
    already_cached = sum(1 for r in rows if r["job_id"] in cache)
    no_required = sum(1 for r in rows if not r["required_skills"])
    new_rows = [r for r in rows if r["job_id"] not in cache]

    print(f"\nSummary:")
    print(f"  {len(new_rows)} new jobs to add")
    print(f"  {already_cached} already in cache (will skip)")
    print(f"  {no_required} rows have no required_skills (will still add — may be filtered later)")

    if args.dry_run:
        print("\nDry run — no changes written.")
        if new_rows:
            print("\nSample (first 3):")
            for r in new_rows[:3]:
                print(f"  {r['job_id']}: req={r['required_skills'][:3]} exp={r['min_years_experience']}")
        return

    for r in new_rows:
        jid = r.pop("job_id")
        cache[jid] = r

    save_cache(cache)
    print(f"\nCache updated: {CACHE_FILE}")
    print(f"  Total cached jobs now: {len(cache)}")
    print(f"\nWhen all batches are done, run csv_importer.py to push to Supabase.")


if __name__ == "__main__":
    main()
