"""
skill_tagger.py
Uses Groq API to extract required/preferred skills from raw job description text.
Results are cached locally so re-runs don't re-call the API.

Called by csv_importer.py — not run directly.

Cache file: database/skill_tag_cache.json
    { job_id: { "required": [...taxonomy_keys], "preferred": [...taxonomy_keys] } }
"""

import json
import os
import time
from pathlib import Path

from groq import Groq

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CACHE_FILE = PROJECT_ROOT / "database" / "skill_tag_cache.json"

# How many jobs to tag per Groq API call (batching saves tokens + rate limits)
BATCH_SIZE = 5

# Groq model — llama3 is fast and sufficient for structured extraction
GROQ_MODEL = "llama3-8b-8192"

# Rate limit safety: pause between batches (Groq free tier: ~30 req/min)
BATCH_PAUSE_SECONDS = 2.5


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
    """Returns sorted unique taxonomy keys from alias_map."""
    return sorted(set(alias_map.values()))


def build_batch_prompt(jobs: list[dict], taxonomy_keys: list[str]) -> str:
    taxonomy_str = "\n".join(f"- {k}" for k in taxonomy_keys)
    jobs_str = "\n\n".join(
        f"JOB_ID: {j['job_id']}\nTITLE: {j['title']}\nDESCRIPTION:\n{j['raw_jd_text'][:2000]}"
        for j in jobs
    )
    return f"""You are a skill extraction engine. Given job descriptions, identify which skills
from the taxonomy below are REQUIRED (must-have) and which are PREFERRED (nice-to-have).

TAXONOMY SKILLS (use exact keys from this list only):
{taxonomy_str}

JOBS:
{jobs_str}

Return a JSON array — one object per job:
[
  {{
    "job_id": "...",
    "required": ["taxonomy_key_1", "taxonomy_key_2"],
    "preferred": ["taxonomy_key_3"]
  }}
]

Rules:
- Only use taxonomy keys from the list above — exact match, lowercase.
- If a skill is mentioned as required/mandatory/essential → required.
- If a skill is mentioned as preferred/nice-to-have/bonus → preferred.
- If ambiguous → required.
- If a skill is not in the taxonomy, skip it.
- Return valid JSON only, no explanation."""


def parse_groq_response(response_text: str) -> list[dict]:
    """Extract JSON array from Groq response, handling markdown code blocks."""
    text = response_text.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
    # Find first [ and last ] in case there's preamble
    start = text.find("[")
    end = text.rfind("]") + 1
    if start == -1 or end == 0:
        return []
    return json.loads(text[start:end])


def tag_jobs_with_groq(
    jobs: list[dict],  # each: {job_id, title, raw_jd_text}
    alias_map: dict[str, str],
    groq_api_key: str,
    verbose: bool = True,
) -> dict[str, dict]:
    """
    Tags all jobs with required/preferred skills using Groq.
    Returns dict: job_id → {required: [...], preferred: [...]}.
    Skips jobs already in cache. Saves cache after each batch.
    """
    cache = load_cache()
    taxonomy_keys = build_taxonomy_list(alias_map)
    client = Groq(api_key=groq_api_key)

    # Filter to uncached jobs only
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
            print(f"  Batch {batch_num}/{total_batches} ({len(batch)} jobs)...", end=" ")

        prompt = build_batch_prompt(batch, taxonomy_keys)

        try:
            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=1024,
            )
            raw_text = response.choices[0].message.content or ""
            results = parse_groq_response(raw_text)

            for result in results:
                job_id = str(result.get("job_id", ""))
                if job_id:
                    cache[job_id] = {
                        "required": [
                            k for k in result.get("required", []) if k in alias_map.values()
                        ],
                        "preferred": [
                            k for k in result.get("preferred", []) if k in alias_map.values()
                        ],
                    }

            save_cache(cache)

            if verbose:
                tagged = len(results)
                print(f"tagged {tagged} jobs")

        except Exception as e:  # noqa: BLE001
            if verbose:
                print(f"ERROR: {e} — falling back to empty tags for this batch")
            for job in batch:
                cache[str(job["job_id"])] = {"required": [], "preferred": []}

        if batch_num < total_batches:
            time.sleep(BATCH_PAUSE_SECONDS)

    return cache


def get_tags_for_job(
    job_id: str,
    cache: dict[str, dict],
) -> tuple[list[str], list[str]]:
    """Returns (required_taxonomy_keys, preferred_taxonomy_keys) from cache."""
    entry = cache.get(str(job_id), {})
    return entry.get("required", []), entry.get("preferred", [])
