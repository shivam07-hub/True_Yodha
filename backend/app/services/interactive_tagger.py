"""
interactive_tagger.py
Human-in-the-loop skill tagger — company by company, copy-paste workflow.

Use this when API providers are exhausted or you want manual control.

Usage:
    python3 -m app.services.interactive_tagger
    python3 -m app.services.interactive_tagger --company "Stripe"
    python3 -m app.services.interactive_tagger --company "Stripe" --chunk-size 20

Workflow:
    1. Script shows companies with untagged job counts
    2. Pick a company (by number or name)
    3. Script prints a prompt — copy it, paste into Claude / ChatGPT
    4. Paste the JSON response back here
    5. Script validates + saves to cache, moves to next chunk
    6. Repeat until company is done, then pick next company
"""

import argparse
import json
import sys
from pathlib import Path

import openpyxl
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = PROJECT_ROOT / "backend" / ".env"
TAXONOMY_JSON = PROJECT_ROOT / "skill_taxonomy mapping" / "taxonomy.json"
MASTER_OUTPUT_DIR = (
    PROJECT_ROOT / "Market Data" / "Job_Scrapers" / "All_CSV_Outputs" / "Master_Output"
)
CACHE_FILE = PROJECT_ROOT / "database" / "skill_tag_cache.json"

DEFAULT_CHUNK_SIZE = 30
VALID_QUALIFICATIONS = {"High School", "Diploma", "Bachelor's", "Master's", "MBA", "PhD", "Any"}

_DIV = "─" * 72


# ── Taxonomy ──────────────────────────────────────────────────────────────────

def load_taxonomy_keys(json_path: Path) -> list[str]:
    with open(json_path, encoding="utf-8") as f:
        taxonomy = json.load(f)
    keys: set[str] = set()
    for _cat, skills in taxonomy["categories"].items():
        for skill_key in skills:
            keys.add(skill_key)
    return sorted(keys)


# ── Cache ─────────────────────────────────────────────────────────────────────

def load_cache() -> dict[str, dict]:
    if CACHE_FILE.exists():
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache: dict[str, dict]) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)


# ── Jobs ──────────────────────────────────────────────────────────────────────

def read_all_jobs(master_files: list[Path]) -> list[dict]:
    seen: set[str] = set()
    jobs: list[dict] = []
    for xlsx_path in master_files:
        wb = openpyxl.load_workbook(xlsx_path, read_only=True)
        ws = wb.active
        rows = ws.iter_rows(values_only=True)
        headers = [str(h) for h in next(rows)]
        for row in rows:
            col = {h: row[i] for i, h in enumerate(headers)}
            jid = str(col.get("job_id", "")).strip()
            title = str(col.get("title", "")).strip()
            if not jid or not title or title == "See full role description":
                continue
            if jid in seen:
                continue
            seen.add(jid)
            jobs.append({
                "job_id": jid,
                "title": title,
                "company": str(col.get("company_name") or "").strip() or "Unknown",
                "raw_jd_text": str(col.get("raw_jd_text") or "").strip() or None,
            })
        wb.close()
    return jobs


def group_by_company(jobs: list[dict], cache: dict) -> dict[str, list[dict]]:
    """Returns {company: [untagged jobs]} sorted by job count desc."""
    groups: dict[str, list[dict]] = {}
    for job in jobs:
        if job["job_id"] in cache:
            continue
        company = job["company"]
        groups.setdefault(company, []).append(job)
    return dict(sorted(groups.items(), key=lambda x: len(x[1]), reverse=True))


# ── Prompt builder ────────────────────────────────────────────────────────────

def build_prompt(jobs: list[dict], taxonomy_keys: list[str]) -> str:
    taxonomy_str = "\n".join(f"  - {k}" for k in taxonomy_keys)
    jobs_str = "\n\n---\n\n".join(
        f"JOB_ID: {j['job_id']}\nTITLE: {j['title']}\n"
        f"DESCRIPTION:\n{(j.get('raw_jd_text') or 'No description provided.')[:2500]}"
        for j in jobs
    )
    ids = [j["job_id"] for j in jobs]
    return f"""You are an expert job analyst. Tag each job with skills from the taxonomy below.

SKILL TAXONOMY — use ONLY these exact keys (lowercase):
{taxonomy_str}

JOBS TO TAG ({len(jobs)} jobs):
{jobs_str}

---

For each job return a JSON array — one object per job:

[
  {{
    "job_id": "<exact job_id from above>",
    "required_skills": ["<taxonomy key>", ...],
    "preferred_skills": ["<taxonomy key>", ...],
    "unknown_skills": ["<raw skill not in taxonomy>", ...],
    "min_years_experience": <integer or null>,
    "min_qualification": "<High School|Diploma|Bachelor's|Master's|MBA|PhD|Any>"
  }}
]

Rules:
- required_skills: essential skills inferred from the description
- preferred_skills: nice-to-have; cannot overlap with required_skills
- unknown_skills: clearly needed skills NOT in the taxonomy, max 5, raw lowercase
- Return ALL {len(ids)} job IDs: {ids}
- Return valid JSON only — no explanation text outside the array"""


# ── Response validation ───────────────────────────────────────────────────────

def validate_and_parse(text: str, valid_keys: set[str]) -> list[dict] | None:
    """Parse + validate LLM response. Returns None if unparseable."""
    text = text.strip()
    if "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("[")
    if start == -1:
        return None
    try:
        result, _ = json.JSONDecoder().raw_decode(text, start)
    except json.JSONDecodeError:
        return None
    if not isinstance(result, list):
        return None

    validated: list[dict] = []
    for item in result:
        if not isinstance(item, dict) or not item.get("job_id"):
            continue
        required = [k for k in item.get("required_skills", []) if k in valid_keys]
        preferred = [k for k in item.get("preferred_skills", []) if k in valid_keys and k not in required]
        raw_years = item.get("min_years_experience")
        try:
            years: int | None = int(float(raw_years)) if raw_years and float(raw_years) > 0 else None
        except (ValueError, TypeError):
            years = None
        raw_qual = str(item.get("min_qualification", "Any")).strip()
        unknown = [
            s.strip().lower() for s in item.get("unknown_skills", [])
            if isinstance(s, str) and s.strip() and s.strip().lower() not in valid_keys
        ]
        validated.append({
            "job_id": str(item["job_id"]),
            "required_skills": required,
            "preferred_skills": preferred,
            "unknown_skills": list(dict.fromkeys(unknown))[:5],
            "min_years_experience": years,
            "min_qualification": raw_qual if raw_qual in VALID_QUALIFICATIONS else "Any",
        })
    return validated


# ── Input helpers ─────────────────────────────────────────────────────────────

def read_multiline(prompt_text: str) -> str:
    """Read multiline paste. User types END on its own line to finish."""
    print(prompt_text)
    print("  (type END on a blank line when done, or SKIP to skip this chunk)\n")
    lines: list[str] = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line.strip() == "END":
            break
        if line.strip() == "SKIP":
            return "SKIP"
        lines.append(line)
    return "\n".join(lines)


def pick_company(groups: dict[str, list[dict]]) -> str | None:
    """Interactive company picker. Returns company name or None to quit."""
    print(f"\n{_DIV}")
    print(f"  COMPANIES WITH UNTAGGED JOBS")
    print(_DIV)
    company_list = list(groups.keys())
    for i, company in enumerate(company_list, 1):
        count = len(groups[company])
        print(f"  {i:>3}. {company:<40} {count} jobs")
    print(_DIV)
    print("  Enter number, company name, ALL (tag all in order), or Q to quit")
    print(_DIV)

    raw = input("\n> ").strip()
    if raw.upper() in ("Q", "QUIT", "EXIT", ""):
        return None
    if raw.upper() == "ALL":
        return "ALL"
    if raw.isdigit():
        idx = int(raw) - 1
        if 0 <= idx < len(company_list):
            return company_list[idx]
        print(f"  Invalid number. Pick 1–{len(company_list)}.")
        return pick_company(groups)
    # Try name match (case-insensitive partial)
    matches = [c for c in company_list if raw.lower() in c.lower()]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        print(f"  Ambiguous — matches: {matches}")
        return pick_company(groups)
    print(f"  Not found: '{raw}'")
    return pick_company(groups)


# ── Core tagger ───────────────────────────────────────────────────────────────

def tag_company(
    company: str,
    jobs: list[dict],
    taxonomy_keys: list[str],
    valid_keys: set[str],
    cache: dict[str, dict],
    chunk_size: int,
) -> int:
    """Tag all jobs for one company. Returns count of newly tagged jobs."""
    total_chunks = (len(jobs) + chunk_size - 1) // chunk_size
    tagged_count = 0

    print(f"\n{_DIV}")
    print(f"  {company.upper()} — {len(jobs)} untagged jobs → {total_chunks} chunk(s) of ~{chunk_size}")
    print(_DIV)

    for chunk_num, start in enumerate(range(0, len(jobs), chunk_size), 1):
        chunk = jobs[start: start + chunk_size]
        print(f"\n  Chunk {chunk_num}/{total_chunks} — {len(chunk)} jobs")

        prompt = build_prompt(chunk, taxonomy_keys)

        print(f"\n{'═' * 72}")
        print("  COPY EVERYTHING BETWEEN THE LINES AND PASTE INTO CLAUDE / CHATGPT")
        print(f"{'═' * 72}\n")
        print(prompt)
        print(f"\n{'═' * 72}")
        print("  END OF PROMPT")
        print(f"{'═' * 72}\n")

        while True:
            raw_response = read_multiline("  Paste the JSON response here:")
            if raw_response == "SKIP":
                print("  Skipping chunk.")
                break

            results = validate_and_parse(raw_response, valid_keys)
            if results is None:
                print("  Could not parse JSON. Try again or type SKIP.")
                continue

            for r in results:
                jid = r.pop("job_id")
                cache[jid] = r
                tagged_count += 1

            save_cache(cache)
            print(f"  Saved {len(results)} jobs to cache.")
            break

    return tagged_count


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    load_dotenv(ENV_FILE)

    parser = argparse.ArgumentParser(description="Interactive company-by-company job tagger")
    parser.add_argument("--company", help="Jump straight to a specific company")
    parser.add_argument("--chunk-size", type=int, default=DEFAULT_CHUNK_SIZE,
                        help=f"Jobs per LLM prompt (default: {DEFAULT_CHUNK_SIZE})")
    args = parser.parse_args()

    master_files = sorted(MASTER_OUTPUT_DIR.glob("ALL_JOBS_NORMALIZED_*.xlsx"))
    if not master_files:
        print(f"ERROR: No master xlsx files in {MASTER_OUTPUT_DIR}")
        sys.exit(1)

    print("Loading taxonomy...")
    taxonomy_keys = load_taxonomy_keys(TAXONOMY_JSON)
    valid_keys = set(taxonomy_keys)

    print("Loading jobs and cache...")
    all_jobs = read_all_jobs(master_files)
    cache = load_cache()
    groups = group_by_company(all_jobs, cache)

    total_untagged = sum(len(v) for v in groups.values())
    print(f"  {len(all_jobs)} total jobs | {len(cache)} cached | {total_untagged} untagged across {len(groups)} companies")

    if not groups:
        print("\nAll jobs are tagged!")
        return

    # Direct company jump
    if args.company:
        matches = [c for c in groups if args.company.lower() in c.lower()]
        if not matches:
            print(f"ERROR: No untagged jobs found for company matching '{args.company}'")
            sys.exit(1)
        company = matches[0]
        tag_company(company, groups[company], taxonomy_keys, valid_keys, cache, args.chunk_size)
        return

    # Interactive loop
    while True:
        # Refresh groups after each company (cache updated)
        groups = group_by_company(all_jobs, cache)
        if not groups:
            print("\nAll jobs are tagged! Run csv_importer.py to push to Supabase.")
            break

        choice = pick_company(groups)
        if choice is None:
            remaining = sum(len(v) for v in groups.values())
            print(f"\nExiting. {remaining} jobs still untagged. Run again to continue.")
            break

        if choice == "ALL":
            for company, jobs in list(groups.items()):
                tag_company(company, jobs, taxonomy_keys, valid_keys, cache, args.chunk_size)
            print("\nAll companies processed!")
            break

        tag_company(choice, groups[choice], taxonomy_keys, valid_keys, cache, args.chunk_size)


if __name__ == "__main__":
    main()
