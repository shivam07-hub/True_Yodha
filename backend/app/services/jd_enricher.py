"""
jd_enricher.py
LLM-based structured field extraction from raw_jd_text.

Scrapers reliably capture job_id, title, company, raw_jd_text and job_url.
Everything else (seniority, work mode, industry, experience, degree) is either
missing or filled by rough regex inference in scraper_utils.  This module
re-extracts those fields from the raw JD text using a local LM Studio model,
producing higher-quality structured data.

Fields extracted:
  jd_seniority_level    — junior | mid | senior | lead
  jd_work_mode          — onsite | hybrid | remote
  jd_employment_type    — full-time | part-time | contract | internship
  jd_degree_required    — bachelor | master | phd  (or null)
  jd_degree_field       — e.g. "Computer Science", "Engineering"
  jd_industry           — e.g. "Technology", "Pharmaceuticals", "Finance"
  jd_min_years_exp      — integer or null
  jd_max_years_exp      — integer or null
  jd_location_city      — primary city or null

Results cached in database/jd_enrichment_cache.json.
Only null/empty scraper fields are overridden — scraper data takes priority.

Model config (backend/.env):
  LM_STUDIO_EXTRACTOR_MODEL  — model name for field extraction
                                defaults to LM_STUDIO_TAGGER_MODEL if not set
  LM_STUDIO_BASE_URL         — defaults to http://localhost:1234/v1

Called by groq_tagger.py — not run directly.
"""

from __future__ import annotations

import json
import re
import threading
import time
from pathlib import Path

import httpx
from openai import OpenAI

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CACHE_FILE   = PROJECT_ROOT / "database" / "jd_enrichment_cache.json"

LM_STUDIO_BASE_URL = "http://localhost:1234/v1"
TIMEOUT_SECONDS    = 60   # single-job call is lighter than 10-job skill batch
SAVE_EVERY         = 50   # flush cache to disk every N jobs

VALID_SENIORITY    = {"junior", "mid", "senior", "lead"}
VALID_WORK_MODE    = {"onsite", "hybrid", "remote"}
VALID_EMP_TYPE     = {"full-time", "part-time", "contract", "internship"}
VALID_DEGREE       = {"bachelor", "master", "phd"}

# ── Prompt ────────────────────────────────────────────────────────────────────

_SYSTEM = (
    "You are a precise job-posting parser. "
    "You extract structured metadata from job descriptions and return ONLY valid JSON."
)

_USER_TMPL = """\
Extract the following fields from this job posting.
Return ONLY a JSON object — no explanation, no markdown, no extra text.

Fields (use null if not clearly stated):
- "seniority":        "junior" | "mid" | "senior" | "lead" | null
- "work_mode":        "onsite" | "hybrid" | "remote" | null
- "employment_type":  "full-time" | "part-time" | "contract" | "internship" | null
- "degree":           "bachelor" | "master" | "phd" | null
- "degree_field":     short string e.g. "Computer Science" | null
- "industry":         sector string e.g. "Technology" | "Pharmaceuticals" | null
- "min_exp":          integer (min years of experience required) | null
- "max_exp":          integer (max years mentioned) | null
- "city":             primary job location city name | null

Job Title: {title}
Company: {company}
Job Description (first 1200 chars):
{jd}

JSON:"""


def _build_prompt(job: dict) -> str:
    jd = str(job.get("raw_jd_text") or "")[:1200]
    return _USER_TMPL.format(
        title=job.get("title", ""),
        company=job.get("company_name", ""),
        jd=jd,
    )


# ── LM Studio call ────────────────────────────────────────────────────────────

def _call_lm_studio(prompt: str, model: str, base_url: str) -> str:
    """Call LM Studio with a hard wall-clock timeout. Returns raw response text."""
    http_client = httpx.Client()
    client = OpenAI(api_key="lm-studio", base_url=base_url, http_client=http_client)

    result: list[str | None] = [None]
    error:  list[Exception | None] = [None]

    def _run() -> None:
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.0,
                max_tokens=256,
            )
            result[0] = resp.choices[0].message.content or ""
        except Exception as exc:
            error[0] = exc

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout=TIMEOUT_SECONDS)

    http_client.close()

    if t.is_alive():
        raise TimeoutError(f"LM Studio timed out after {TIMEOUT_SECONDS}s")
    if error[0]:
        raise error[0]
    return result[0] or ""


# ── Response parsing ──────────────────────────────────────────────────────────

def _parse_response(text: str) -> dict:
    """Extract JSON object from LLM response, stripping <think> tags and markdown."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    if "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    if start == -1:
        return {}
    try:
        obj, _ = json.JSONDecoder().raw_decode(text, start)
        return obj if isinstance(obj, dict) else {}
    except json.JSONDecodeError:
        return {}


def _validate(raw: dict) -> dict:
    """Normalize and constrain LLM output to valid controlled vocab."""
    def _str(key: str) -> str | None:
        v = str(raw.get(key) or "").strip().lower()
        return v if v and v not in ("null", "none") else None

    def _int(key: str) -> int | None:
        v = raw.get(key)
        try:
            n = int(float(v))
            return n if 0 < n < 50 else None
        except (TypeError, ValueError):
            return None

    def _free(key: str) -> str | None:
        v = str(raw.get(key) or "").strip()
        return v if v and v.lower() not in ("null", "none") else None

    seniority = _str("seniority")
    work_mode = _str("work_mode")
    emp_type  = _str("employment_type")
    degree    = _str("degree")

    return {
        "jd_seniority_level":   seniority  if seniority in VALID_SENIORITY else None,
        "jd_work_mode":         work_mode  if work_mode in VALID_WORK_MODE  else None,
        "jd_employment_type":   emp_type   if emp_type  in VALID_EMP_TYPE   else None,
        "jd_degree_required":   degree     if degree    in VALID_DEGREE      else None,
        "jd_degree_field":      _free("degree_field"),
        "jd_industry":          _free("industry"),
        "jd_min_years_exp":     _int("min_exp"),
        "jd_max_years_exp":     _int("max_exp"),
        "jd_location_city":     _free("city"),
    }


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _load_cache() -> dict[str, dict]:
    if CACHE_FILE.exists():
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_cache(cache: dict[str, dict]) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)


# ── Main enrichment function ──────────────────────────────────────────────────

def enrich_jobs(
    jobs: list[dict],
    model: str,
    base_url: str = LM_STUDIO_BASE_URL,
    verbose: bool = True,
) -> dict[str, dict]:
    """
    Enrich structured metadata fields from raw_jd_text via LM Studio.

    Args:
        jobs:     list of job dicts (must have job_id and raw_jd_text)
        model:    LM Studio model name (value of LM_STUDIO_EXTRACTOR_MODEL or TAGGER_MODEL)
        base_url: LM Studio base URL
        verbose:  print progress

    Returns:
        enrichment_cache: {job_id: {jd_seniority_level, jd_work_mode, ...}}
        Already-cached jobs are returned from disk without LM calls.
    """
    cache = _load_cache()
    uncached = [j for j in jobs if str(j["job_id"]) not in cache]

    if not uncached:
        if verbose:
            print(f"  All {len(jobs)} jobs already enriched — loaded from cache")
        return cache

    if verbose:
        print(f"  Enriching {len(uncached)} jobs (cached: {len(jobs) - len(uncached)})...")

    errors = 0
    for i, job in enumerate(uncached, 1):
        job_id = str(job["job_id"])

        if not str(job.get("raw_jd_text") or "").strip():
            cache[job_id] = {k: None for k in [
                "jd_seniority_level", "jd_work_mode", "jd_employment_type",
                "jd_degree_required", "jd_degree_field", "jd_industry",
                "jd_min_years_exp", "jd_max_years_exp", "jd_location_city",
            ]}
            continue

        try:
            prompt   = _build_prompt(job)
            raw_text = _call_lm_studio(prompt, model, base_url)
            raw_dict = _parse_response(raw_text)
            cache[job_id] = _validate(raw_dict)
        except Exception as exc:
            if verbose and errors < 5:
                print(f"    [WARN] job {job_id} enrichment failed: {exc}")
            cache[job_id] = {}
            errors += 1

        if i % SAVE_EVERY == 0:
            _save_cache(cache)
            if verbose:
                print(f"  {i}/{len(uncached)} enriched...", end="\r")

    _save_cache(cache)
    if verbose:
        ok = len(uncached) - errors
        print(f"  Enrichment done: {ok} OK, {errors} failed/skipped      ")

    return cache
