"""
skill_tagger.py
Multi-provider LLM skill extractor for raw job descriptions.

Provider fallback order — all OpenAI-compatible endpoints, single SDK:
  0. LM Studio (local)       unlimited, no rate limits    LM_STUDIO_MODEL (value = model name)
  1. Gemini 2.0 Flash-Lite  500 req/day,  250k tok/min  GEMINI_API_KEY
  2. Cerebras Llama 3.3 70B  14,400 req/day, 60k tok/min  CEREBRAS_API_KEY
  3. Groq Llama 3.1 8B      14,400 req/day,  6k tok/min  GROQ_API_KEY
  4. SambaNova Llama 3.1 8B  1,000 req/day               SAMBANOVA_API_KEY
  5. OpenRouter Llama 3.3 70B  50 req/day (free tier)    OPENROUTER_API_KEY

Provider list sourced from:
  docs/free-llm-api-resources/  (git submodule — cheahjs/free-llm-api-resources)
  See that repo's README for up-to-date rate limits and model availability.

Add any of the above API keys to backend/.env. Providers with missing keys are
skipped. On rate-limit (HTTP 429), automatically switches to the next provider.
Results cached in database/skill_tag_cache.json — re-runs skip already-tagged jobs.

Called by groq_tagger.py — not run directly.
"""

import json
import re
import threading
import time
from pathlib import Path

import httpx
from openai import OpenAI, RateLimitError

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CACHE_FILE = PROJECT_ROOT / "database" / "skill_tag_cache.json"

BATCH_SIZE = 10          # jobs per LLM call
BATCH_PAUSE_SECONDS = 5  # 5s gap → safely under Gemini's 15 req/min limit
VALID_QUALIFICATIONS = {"High School", "Diploma", "Bachelor's", "Master's", "MBA", "PhD", "Any"}

# ── Provider registry ─────────────────────────────────────────────────────────
# Sourced from docs/free-llm-api-resources (cheahjs/free-llm-api-resources).
# All use OpenAI-compatible chat completions endpoints — single client pattern.

PROVIDERS = [
    {
        "name":        "lmstudio",
        "display":     "LM Studio (local — instruction model)",
        "base_url":    "http://localhost:1234/v1",
        "api_key_env": "LM_STUDIO_TAGGER_MODEL",  # env var value IS the model name; any non-empty value enables
        "model":       "",                          # overridden at runtime from LM_STUDIO_TAGGER_MODEL value
        "max_tokens":  2048,
        "rate_limit_wait": 0,
        "timeout_seconds": 120, # wall-clock hard limit — 0.5B at ~150 tok/s should finish in ~15s
    },
    {
        "name":        "gemini",
        "display":     "Gemini 2.0 Flash-Lite",
        "base_url":    "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_key_env": "GEMINI_API_KEY",
        "model":       "gemini-2.0-flash-lite",
        "max_tokens":  2048,
        "rate_limit_wait": 10,  # 15 req/min → wait 10s then retry
    },
    {
        "name":        "cerebras",
        "display":     "Cerebras Llama 3.1 8B",
        "base_url":    "https://api.cerebras.ai/v1",
        "api_key_env": "CEREBRAS_API_KEY",
        "model":       "llama3.1-8b",
        "max_tokens":  2048,
        "rate_limit_wait": 5,   # seconds to wait before retrying on 429
    },

    {
        "name":        "groq",
        "display":     "Groq Llama 3.1 8B",
        "base_url":    "https://api.groq.com/openai/v1",
        "api_key_env": "GROQ_API_KEY",
        "model":       "llama-3.1-8b-instant",
        "max_tokens":  2048,
        "rate_limit_wait": 60,  # tokens/min limit — wait 60s then retry same provider
    },
    {
        "name":        "sambanova",
        "display":     "SambaNova Llama 3.3 70B",
        "base_url":    "https://api.sambanova.ai/v1",
        "api_key_env": "SAMBANOVA_API_KEY",
        "model":       "Meta-Llama-3.3-70B-Instruct",
        "max_tokens":  2048,
    },
    {
        "name":        "openrouter",
        "display":     "OpenRouter Llama 3.3 70B",
        "base_url":    "https://openrouter.ai/api/v1",
        "api_key_env": "OPENROUTER_API_KEY",
        "model":       "meta-llama/llama-3.3-70b-instruct:free",
        "max_tokens":  2048,
    },
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


def build_batch_prompt(jobs: list[dict], taxonomy_keys: list[str]) -> tuple[str, dict[str, str]]:
    """
    Returns (prompt, idx_to_real_id).
    Uses sequential integer IDs (1, 2, 3...) in the prompt to avoid
    special characters in real job IDs confusing smaller LLMs.
    """
    taxonomy_str = "\n".join(f"- {k}" for k in taxonomy_keys)
    idx_to_real: dict[str, str] = {}
    jobs_str_parts = []
    for i, j in enumerate(jobs, 1):
        idx = str(i)
        idx_to_real[idx] = str(j["job_id"])
        jobs_str_parts.append(
            f"JOB_ID: {idx}\nTITLE: {j['title']}\nCOMPANY: {j.get('company', 'Unknown')}\n"
            f"DESCRIPTION:\n{(j.get('raw_jd_text') or '')[:1500]}"
        )
    jobs_str = "\n\n---\n\n".join(jobs_str_parts)
    n = len(jobs)
    prompt = f"""You are an expert job analyst. Read each job description and extract structured skill data.

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

Return a JSON array of exactly {n} objects — one per job:
[{{"job_id":"1","required_skills":[...],"preferred_skills":[...],"unknown_skills":[...],"min_years_experience":3,"min_qualification":"Bachelor's"}},...]

Rules: use the integer job_id exactly as shown. Taxonomy keys only for required/preferred. Return valid JSON only."""
    return prompt, idx_to_real


# ── Provider call ─────────────────────────────────────────────────────────────

def _call_provider(prompt: str, provider: dict, api_keys: dict[str, str]) -> str:
    """Single unified call — all providers use OpenAI-compatible chat completions."""
    # LM Studio: env var value IS the model name; API key is a dummy string
    if provider["name"] == "lmstudio":
        model = api_keys[provider["api_key_env"]]  # LM_STUDIO_TAGGER_MODEL value = model name
        api_key = "lm-studio"
    else:
        model = provider["model"]
        api_key = api_keys[provider["api_key_env"]]
    # Local models stream tokens one-by-one — the SDK's built-in timeout never fires.
    # Solution: share an httpx.Client between caller and thread so we can close() it
    # on timeout, aborting the in-flight connection and letting the thread exit cleanly.
    wall_timeout = provider.get("timeout_seconds")
    http_client = httpx.Client() if wall_timeout else None
    client = OpenAI(
        api_key=api_key,
        base_url=provider["base_url"],
        **({"http_client": http_client} if http_client else {}),
    )

    def _call() -> str:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=provider["max_tokens"],
        )
        return resp.choices[0].message.content or ""

    if wall_timeout and http_client:
        result: list = [None]
        error:  list = [None]

        def _run() -> None:
            try:
                result[0] = _call()
            except Exception as e:
                error[0] = e

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        t.join(timeout=wall_timeout)
        if t.is_alive():
            http_client.close()  # aborts the in-flight HTTP connection → thread exits
            t.join(timeout=5)    # brief wait for thread to notice and clean up
            raise Exception(f"lmstudio timed out after {wall_timeout}s — batch skipped")
        http_client.close()
        if error[0]:
            raise error[0]
        return result[0] or ""

    return _call()


def _is_rate_limit(exc: Exception) -> bool:
    if isinstance(exc, RateLimitError):
        return True
    msg = str(exc).lower()
    return any(k in msg for k in ("429", "rate_limit", "quota", "exhausted", "resource_exhausted"))


def _should_skip_provider(exc: Exception) -> bool:
    """True for errors that mean this provider should be skipped entirely (not retried)."""
    if _is_rate_limit(exc):
        return True
    msg = str(exc).lower()
    return any(k in msg for k in ("404", "model_not_found", "does not exist", "no access"))


# ── Response parsing + validation ─────────────────────────────────────────────

def parse_llm_response(text: str) -> list[dict]:
    # Strip <think>...</think> blocks emitted by reasoning-distilled models (safe no-op if absent)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    if "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("[")
    if start == -1:
        return []
    try:
        result, _ = json.JSONDecoder().raw_decode(text, start)
    except json.JSONDecodeError:
        return []
    return result if isinstance(result, list) else []


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
    Tags all jobs using multi-provider fallback.

    api_keys: {env_var_name: value} — e.g. {"GEMINI_API_KEY": "...", "GROQ_API_KEY": "..."}
    Missing keys skip that provider. On rate-limit, auto-switches to next provider.
    Saves cache after each successful batch.

    Returns (cache, candidate_unknown_skill_counts).
    """
    cache = load_cache()
    taxonomy_keys = build_taxonomy_list(alias_map)
    valid_keys = set(taxonomy_keys)
    uncached = [j for j in jobs if str(j["job_id"]) not in cache]

    if not uncached:
        if verbose:
            print(f"  All {len(jobs)} jobs already cached — skipping LLM calls")
    else:
        active = [p for p in PROVIDERS if api_keys.get(p["api_key_env"])]
        if not active:
            print("  ERROR: No API keys configured. Add at least one of:")
            for p in PROVIDERS:
                print(f"    {p['api_key_env']} ({p['display']})")
            return cache, {}

        if verbose:
            print(f"  {len(uncached)} jobs need tagging ({len(jobs) - len(uncached)} cached)")
            print(f"  Providers: {[p['name'] for p in active]}")

        provider_idx = 0
        total_batches = (len(uncached) + BATCH_SIZE - 1) // BATCH_SIZE

        for batch_num, batch_start in enumerate(range(0, len(uncached), BATCH_SIZE), 1):
            batch = uncached[batch_start: batch_start + BATCH_SIZE]
            prompt, idx_to_real = build_batch_prompt(batch, taxonomy_keys)

            if verbose:
                print(f"  Batch {batch_num}/{total_batches} [{active[provider_idx]['name']}]...", end=" ", flush=True)

            # Try each provider in order, retrying on per-minute rate limits
            attempt = provider_idx
            rate_limit_retries: dict[int, int] = {}  # attempt_idx → retry count
            while attempt < len(active):
                try:
                    raw_text = _call_provider(prompt, active[attempt], api_keys)
                    results = parse_llm_response(raw_text)
                    tagged_ids: set[str] = set()
                    for r in results:
                        if not isinstance(r, dict):
                            continue
                        # Map sequential idx back to real job_id
                        idx = str(r.get("job_id", ""))
                        jid = idx_to_real.get(idx, idx)
                        if jid:
                            cache[jid] = validate_result(r, valid_keys)
                            tagged_ids.add(jid)

                    # 0/N tagged — local provider: retry once then skip batch (don't fall to cloud)
                    if not tagged_ids and active[attempt]["name"] == "lmstudio":
                        retries = rate_limit_retries.get(attempt, 0)
                        if retries < 1:
                            if verbose:
                                print("0 tagged, retrying...", end=" ", flush=True)
                            rate_limit_retries[attempt] = retries + 1
                            continue
                        # Still 0 after retry — skip batch, stay on lmstudio
                        for job in batch:
                            cache[str(job["job_id"])] = _EMPTY_TAGS.copy()
                        save_cache(cache)
                        if verbose:
                            print("skipped (0 tagged after retry)")
                        break

                    # 0/N tagged = model replied but IDs didn't match — try next provider
                    if not tagged_ids and attempt < len(active) - 1:
                        if verbose:
                            print(f"0 tagged → {active[attempt + 1]['name']}...", end=" ", flush=True)
                        attempt += 1
                        continue

                    # Success
                    provider_idx = attempt
                    for job in batch:
                        if str(job["job_id"]) not in tagged_ids:
                            cache[str(job["job_id"])] = _EMPTY_TAGS.copy()
                    save_cache(cache)
                    if verbose:
                        print(f"done ({len(tagged_ids)}/{len(batch)} tagged)")
                    break

                except Exception as exc:
                    # lmstudio wall-clock timeout — skip batch, stay on lmstudio (don't fall to cloud)
                    if active[attempt]["name"] == "lmstudio" and "timed out" in str(exc).lower():
                        for job in batch:
                            cache[str(job["job_id"])] = _EMPTY_TAGS.copy()
                        save_cache(cache)
                        if verbose:
                            print("timeout — batch skipped")
                        break

                    wait_secs = active[attempt].get("rate_limit_wait", 0)
                    if _is_rate_limit(exc) and wait_secs:
                        retries = rate_limit_retries.get(attempt, 0)
                        if retries < 2:
                            # Per-minute limit — wait and retry same provider + batch
                            if verbose:
                                print(f"rate limit, waiting {wait_secs}s...", end=" ", flush=True)
                            time.sleep(wait_secs)
                            rate_limit_retries[attempt] = retries + 1
                            continue
                        # Max retries hit — move to next provider
                        if attempt < len(active) - 1:
                            if verbose:
                                print(f"max retries → {active[attempt + 1]['name']}...", end=" ", flush=True)
                            provider_idx = attempt + 1
                            attempt += 1
                            continue

                    elif _should_skip_provider(exc) and attempt < len(active) - 1:
                        if verbose:
                            reason = "rate limit" if _is_rate_limit(exc) else "provider error"
                            print(f"{reason} → {active[attempt + 1]['name']}...", end=" ", flush=True)
                        provider_idx = attempt + 1
                        attempt += 1

                    else:
                        if verbose:
                            print(f"ERROR [{active[attempt]['name']}]: {exc.__class__.__name__}")
                        if attempt >= len(active) - 1:
                            remaining = len(uncached) - batch_start
                            if verbose:
                                print(f"\n  All providers exhausted. {remaining} jobs still untagged.")
                                print("  Add more API keys to backend/.env, or use tagger_ui.py (Streamlit).")
                            save_cache(cache)
                            return cache, {}
                        attempt += 1

            if batch_num < total_batches:
                time.sleep(BATCH_PAUSE_SECONDS)

    candidate_counts: dict[str, int] = {}
    for entry in cache.values():
        for skill in entry.get("unknown_skills", []):
            candidate_counts[skill] = candidate_counts.get(skill, 0) + 1

    return cache, candidate_counts
