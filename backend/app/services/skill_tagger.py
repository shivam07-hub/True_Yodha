"""
skill_tagger.py
Multi-provider LLM skill extractor for raw job descriptions.

Provider fallback order (auto-switches on rate limit / 429):
  1. Groq       — llama-3.1-8b-instant  (~500K tokens/day free)
  2. Gemini     — gemini-1.5-flash       (1,500 req/day free)
  3. OpenRouter — llama-3.1-8b-instruct:free (no daily cap, rate limited per min)

Add api_keys for all three providers to exhaust free tiers before manual fallback.
Results cached in database/skill_tag_cache.json — re-runs skip already-tagged jobs.
Called by groq_tagger.py — not run directly.
"""

import json
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CACHE_FILE = PROJECT_ROOT / "database" / "skill_tag_cache.json"

BATCH_SIZE = 3
BATCH_PAUSE_SECONDS = 3.0
VALID_QUALIFICATIONS = {"High School", "Diploma", "Bachelor's", "Master's", "MBA", "PhD", "Any"}

PROVIDERS = [
    {"name": "groq",        "model": "llama-3.1-8b-instant"},
    {"name": "gemini",      "model": "gemini-1.5-flash"},
    {"name": "openrouter",  "model": "meta-llama/llama-3.1-8b-instruct:free"},
]

_EMPTY_TAGS: dict = {
    "required_skills": [], "preferred_skills": [], "unknown_skills": [],
    "min_years_experience": None, "min_qualification": "Any",
}


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


# ── Prompt ────────────────────────────────────────────────────────────────────

def build_taxonomy_list(alias_map: dict[str, str]) -> list[str]:
    return sorted(set(alias_map.values()))


def build_batch_prompt(jobs: list[dict], taxonomy_keys: list[str]) -> str:
    taxonomy_str = "\n".join(f"- {k}" for k in taxonomy_keys)
    jobs_str = "\n\n---\n\n".join(
        f"JOB_ID: {j['job_id']}\nTITLE: {j['title']}\nCOMPANY: {j.get('company', 'Unknown')}\n"
        f"DESCRIPTION:\n{(j.get('raw_jd_text') or '')[:3000]}"
        for j in jobs
    )
    return f"""You are an expert job analyst. Read each job description and extract structured skill data.

SKILL TAXONOMY (use ONLY these exact keys — lowercase):
{taxonomy_str}

JOBS TO ANALYSE:
{jobs_str}

---

For each job extract:
1. required_skills: essential skills (taxonomy keys only, contextually inferred)
2. preferred_skills: nice-to-have skills (taxonomy keys only)
3. min_years_experience: integer or null
4. min_qualification: one of "High School","Diploma","Bachelor's","Master's","MBA","PhD","Any"
5. unknown_skills: skills clearly needed but NOT in taxonomy (raw lowercase names, max 5)

Return a JSON array — one object per job:
[{{"job_id":"...","required_skills":[...],"preferred_skills":[...],"unknown_skills":[...],"min_years_experience":3,"min_qualification":"Bachelor's"}}]

Rules: taxonomy keys only for required/preferred. Same skill cannot appear in both. Return valid JSON only."""


# ── Provider calls ────────────────────────────────────────────────────────────

def _call_provider(prompt: str, provider: dict, api_keys: dict[str, str]) -> str:
    name, model = provider["name"], provider["model"]

    if name == "groq":
        from groq import Groq
        resp = Groq(api_key=api_keys["groq"]).chat.completions.create(
            model=model, messages=[{"role": "user", "content": prompt}],
            temperature=0.0, max_tokens=2048,
        )
        return resp.choices[0].message.content or ""

    if name == "gemini":
        import google.generativeai as genai
        genai.configure(api_key=api_keys["gemini"])
        return genai.GenerativeModel(model).generate_content(prompt).text or ""

    if name == "openrouter":
        from openai import OpenAI
        resp = OpenAI(
            api_key=api_keys["openrouter"],
            base_url="https://openrouter.ai/api/v1",
        ).chat.completions.create(
            model=model, messages=[{"role": "user", "content": prompt}],
            temperature=0.0, max_tokens=2048,
        )
        return resp.choices[0].message.content or ""

    raise ValueError(f"Unknown provider: {name}")


def _is_rate_limit(error: Exception) -> bool:
    msg = str(error).lower()
    return any(k in msg for k in ("429", "rate_limit", "quota", "exhausted", "resource_exhausted"))


# ── Response parsing ──────────────────────────────────────────────────────────

def parse_llm_response(text: str) -> list[dict]:
    text = text.strip()
    if "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
        if text.startswith("json"):
            text = text[4:].strip()
    start, end = text.find("["), text.rfind("]") + 1
    if start == -1 or end == 0:
        return []
    return json.loads(text[start:end])


def validate_result(result: dict, valid_keys: set[str]) -> dict:
    required = [k for k in result.get("required_skills", []) if k in valid_keys]
    preferred = [k for k in result.get("preferred_skills", []) if k in valid_keys and k not in required]
    raw_years = result.get("min_years_experience")
    min_years: int | None = int(raw_years) if isinstance(raw_years, (int, float)) and raw_years > 0 else None
    raw_qual = result.get("min_qualification", "Any")
    unknown = [
        s.strip().lower() for s in result.get("unknown_skills", [])
        if isinstance(s, str) and s.strip() and s.strip().lower() not in valid_keys
    ]
    return {
        "required_skills": required,
        "preferred_skills": preferred,
        "min_years_experience": min_years,
        "min_qualification": raw_qual if raw_qual in VALID_QUALIFICATIONS else "Any",
        "unknown_skills": list(dict.fromkeys(unknown))[:5],
    }


# ── Main tagging function ─────────────────────────────────────────────────────

def tag_jobs_with_llm(
    jobs: list[dict],
    alias_map: dict[str, str],
    api_keys: dict[str, str],
    verbose: bool = True,
) -> tuple[dict[str, dict], dict[str, int]]:
    """
    Tags all jobs with multi-provider fallback.
    api_keys: {"groq": "...", "gemini": "...", "openrouter": "..."}
    Missing keys skip that provider. Saves cache after each successful batch.
    Returns (cache, candidate_counts).
    """
    cache = load_cache()
    taxonomy_keys = build_taxonomy_list(alias_map)
    valid_keys = set(taxonomy_keys)
    uncached = [j for j in jobs if str(j["job_id"]) not in cache]

    if not uncached:
        if verbose:
            print(f"  All {len(jobs)} jobs already cached — skipping LLM calls")
    else:
        active = [p for p in PROVIDERS if api_keys.get(p["name"])]
        if not active:
            print("  ERROR: No API keys configured for any provider.")
            return cache, {}

        if verbose:
            print(f"  {len(uncached)} jobs need tagging ({len(jobs) - len(uncached)} cached)")
            print(f"  Providers available: {[p['name'] for p in active]}")

        provider_idx = 0
        total_batches = (len(uncached) + BATCH_SIZE - 1) // BATCH_SIZE

        for batch_num, batch_start in enumerate(range(0, len(uncached), BATCH_SIZE), 1):
            batch = uncached[batch_start: batch_start + BATCH_SIZE]
            prompt = build_batch_prompt(batch, taxonomy_keys)
            tagged_ids: set[str] = set()
            success = False

            if verbose:
                print(f"  Batch {batch_num}/{total_batches} [{active[provider_idx]['name']}]...", end=" ", flush=True)

            for attempt in range(provider_idx, len(active)):
                try:
                    raw_text = _call_provider(prompt, active[attempt], api_keys)
                    results = parse_llm_response(raw_text)
                    for r in results:
                        jid = str(r.get("job_id", ""))
                        if jid:
                            cache[jid] = validate_result(r, valid_keys)
                            tagged_ids.add(jid)
                    provider_idx = attempt
                    success = True
                    break
                except Exception as e:
                    if _is_rate_limit(e) and attempt < len(active) - 1:
                        next_name = active[attempt + 1]["name"]
                        if verbose:
                            print(f"rate limit → switching to {next_name}...", end=" ", flush=True)
                        provider_idx = attempt + 1
                    else:
                        if verbose:
                            print(f"ERROR: {e}")
                        break

            if success:
                for job in batch:
                    if str(job["job_id"]) not in tagged_ids:
                        cache[str(job["job_id"])] = _EMPTY_TAGS.copy()
                save_cache(cache)
                if verbose:
                    print(f"done ({len(tagged_ids)} tagged)")

            if batch_num < total_batches:
                time.sleep(BATCH_PAUSE_SECONDS)

    candidate_counts: dict[str, int] = {}
    for entry in cache.values():
        for skill in entry.get("unknown_skills", []):
            candidate_counts[skill] = candidate_counts.get(skill, 0) + 1

    return cache, candidate_counts


def tag_jobs_with_groq(
    jobs: list[dict],
    alias_map: dict[str, str],
    groq_api_key: str,
    verbose: bool = True,
) -> tuple[dict[str, dict], dict[str, int]]:
    """Backward-compatible wrapper — passes only Groq key."""
    return tag_jobs_with_llm(jobs, alias_map, {"groq": groq_api_key}, verbose)


def get_tags_for_job(job_id: str, cache: dict[str, dict]) -> tuple[list[str], list[str], int | None, str]:
    entry = cache.get(str(job_id), {})
    return (
        entry.get("required_skills", []),
        entry.get("preferred_skills", []),
        entry.get("min_years_experience"),
        entry.get("min_qualification", "Any"),
    )
