"""
skill_tagger.py
Uses Groq LLM to extract structured data from raw job descriptions:
  - required skills (primary) — contextually understood, not just keyword matched
  - preferred skills (secondary) — contextually understood
  - min_years_experience — minimum years explicitly or implicitly required
  - min_qualification — minimum education level required

Results cached locally so re-runs don't re-call the API.
Cache file: database/skill_tag_cache.json

Called by csv_importer.py — not run directly.
"""

import json
import time
from pathlib import Path

from groq import Groq

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CACHE_FILE = PROJECT_ROOT / "database" / "skill_tag_cache.json"

BATCH_SIZE = 3          # jobs per Groq call — smaller = more accurate context reading
GROQ_MODEL = "llama3-70b-8192"   # 70b for better contextual understanding
BATCH_PAUSE_SECONDS = 3.0        # Groq free tier: ~30 req/min

VALID_QUALIFICATIONS = {
    "High School", "Diploma", "Bachelor's", "Master's", "MBA", "PhD", "Any"
}


def load_cache() -> dict[str, dict]:
    if CACHE_FILE.exists():
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache: dict[str, dict]) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)


def build_taxonomy_list(alias_map: dict[str, str]) -> list[str]:
    return sorted(set(alias_map.values()))


def build_batch_prompt(jobs: list[dict], taxonomy_keys: list[str]) -> str:
    taxonomy_str = "\n".join(f"- {k}" for k in taxonomy_keys)
    jobs_str = "\n\n---\n\n".join(
        f"JOB_ID: {j['job_id']}\n"
        f"TITLE: {j['title']}\n"
        f"COMPANY: {j.get('company', 'Unknown')}\n"
        f"DESCRIPTION:\n{(j.get('raw_jd_text') or '')[:3000]}"
        for j in jobs
    )

    return f"""You are an expert job analyst. Read each job description carefully and extract structured information.

SKILL TAXONOMY (use ONLY these exact keys — lowercase):
{taxonomy_str}

JOBS TO ANALYSE:
{jobs_str}

---

For each job, extract the following by reading and understanding the FULL context of the description:

1. **required_skills**: Skills the job explicitly requires, or that are clearly essential based on the role's responsibilities and day-to-day duties. Go beyond keyword spotting — if the description says "build data pipelines" that implies ETL skills even if not named. Use taxonomy keys only.

2. **preferred_skills**: Skills mentioned as a bonus, nice-to-have, or desirable but not essential. Also include skills that appear contextually relevant but are not central to the role.

3. **min_years_experience**: The minimum years of experience required. Extract from phrases like "3+ years", "at least 5 years", "minimum 2 years". If a range is given (3–5 years), return the lower bound. If not mentioned, return null.

4. **min_qualification**: The minimum education qualification required. Must be exactly one of: "High School", "Diploma", "Bachelor's", "Master's", "MBA", "PhD", "Any". If not mentioned or not required, return "Any".

Return a JSON array — one object per job, in the same order:
[
  {{
    "job_id": "...",
    "required_skills": ["taxonomy_key_1", "taxonomy_key_2"],
    "preferred_skills": ["taxonomy_key_3"],
    "min_years_experience": 3,
    "min_qualification": "Bachelor's"
  }}
]

Rules:
- Only use taxonomy keys from the list above — exact match, lowercase.
- Read the FULL description before classifying — do not just keyword match.
- A skill mentioned only in "nice to have" / "preferred" / "plus" sections → preferred_skills.
- A skill central to the role's function or in "required" / "must have" sections → required_skills.
- The same skill cannot appear in both lists — put it in required_skills if in doubt.
- Return valid JSON only. No explanation, no markdown, no preamble."""


def parse_groq_response(response_text: str) -> list[dict]:
    text = response_text.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
    start = text.find("[")
    end = text.rfind("]") + 1
    if start == -1 or end == 0:
        return []
    return json.loads(text[start:end])


def validate_result(result: dict, valid_taxonomy_keys: set[str]) -> dict:
    """Sanitise a single Groq result — enforce taxonomy keys and valid qual values."""
    required = [k for k in result.get("required_skills", []) if k in valid_taxonomy_keys]
    preferred = [
        k for k in result.get("preferred_skills", [])
        if k in valid_taxonomy_keys and k not in required
    ]

    raw_years = result.get("min_years_experience")
    min_years: int | None = None
    if isinstance(raw_years, (int, float)) and raw_years > 0:
        min_years = int(raw_years)

    raw_qual = result.get("min_qualification", "Any")
    min_qual = raw_qual if raw_qual in VALID_QUALIFICATIONS else "Any"

    return {
        "required_skills": required,
        "preferred_skills": preferred,
        "min_years_experience": min_years,
        "min_qualification": min_qual,
    }


def tag_jobs_with_groq(
    jobs: list[dict],
    alias_map: dict[str, str],
    groq_api_key: str,
    verbose: bool = True,
) -> dict[str, dict]:
    """
    Tags all jobs using Groq for contextual skill extraction.
    Returns dict: job_id → {required_skills, preferred_skills, min_years_experience, min_qualification}.
    Skips jobs already in cache. Saves cache after each batch.
    """
    cache = load_cache()
    taxonomy_keys = build_taxonomy_list(alias_map)
    valid_taxonomy_keys = set(taxonomy_keys)
    client = Groq(api_key=groq_api_key)

    uncached = [j for j in jobs if str(j["job_id"]) not in cache]

    if not uncached:
        if verbose:
            print(f"  All {len(jobs)} jobs already cached — skipping Groq calls")
        return cache

    if verbose:
        print(f"  {len(uncached)} jobs need tagging ({len(jobs) - len(uncached)} cached)")

    total_batches = (len(uncached) + BATCH_SIZE - 1) // BATCH_SIZE

    for batch_num, batch_start in enumerate(range(0, len(uncached), BATCH_SIZE), 1):
        batch = uncached[batch_start: batch_start + BATCH_SIZE]

        if verbose:
            print(f"  Batch {batch_num}/{total_batches} ({len(batch)} jobs)...", end=" ", flush=True)

        prompt = build_batch_prompt(batch, taxonomy_keys)

        try:
            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=2048,
            )
            raw_text = response.choices[0].message.content or ""
            results = parse_groq_response(raw_text)

            tagged_ids = set()
            for result in results:
                job_id = str(result.get("job_id", ""))
                if job_id:
                    cache[job_id] = validate_result(result, valid_taxonomy_keys)
                    tagged_ids.add(job_id)

            # Any jobs in batch that weren't in the response — mark with empty tags
            for job in batch:
                if str(job["job_id"]) not in tagged_ids:
                    cache[str(job["job_id"])] = {
                        "required_skills": [],
                        "preferred_skills": [],
                        "min_years_experience": None,
                        "min_qualification": "Any",
                    }

            save_cache(cache)
            if verbose:
                print(f"done ({len(tagged_ids)} tagged)")

        except Exception as e:  # noqa: BLE001
            if verbose:
                print(f"ERROR: {e} — storing empty tags for this batch")
            for job in batch:
                cache[str(job["job_id"])] = {
                    "required_skills": [],
                    "preferred_skills": [],
                    "min_years_experience": None,
                    "min_qualification": "Any",
                }

        if batch_num < total_batches:
            time.sleep(BATCH_PAUSE_SECONDS)

    return cache


def get_tags_for_job(
    job_id: str,
    cache: dict[str, dict],
) -> tuple[list[str], list[str], int | None, str]:
    """Returns (required_keys, preferred_keys, min_years_experience, min_qualification)."""
    entry = cache.get(str(job_id), {})
    return (
        entry.get("required_skills", []),
        entry.get("preferred_skills", []),
        entry.get("min_years_experience"),
        entry.get("min_qualification", "Any"),
    )
