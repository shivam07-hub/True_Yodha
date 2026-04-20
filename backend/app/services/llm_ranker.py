"""
llm_ranker.py
Re-ranks the top 10 job matches using an LLM.
Generates per-job explanations and 7-day action plans for the top 3.

Provider priority:
  1. LM Studio (local)  — if LM_STUDIO_MODEL is set in .env (no cost, no rate limits)
  2. GPT-4o mini        — fallback if LM Studio is not running

Cost control:
  - One call per user per batch_week — cached in user_job_matches
  - Cache is invalidated when the user uploads a new CV (external — not handled here)

Called from: POST /jobs/compute
"""

import json
import logging
import re
from datetime import date, datetime, timezone

from openai import OpenAI
from supabase import Client

from app.config import settings

logger = logging.getLogger(__name__)

_MAX_TOKENS = 4096


def _get_client_and_model() -> tuple[OpenAI | None, str | None, bool]:
    """
    Returns (client, model_name, supports_json_mode).
    Priority: LM Studio → OpenRouter → GPT-4o mini.
    json_object response_format disabled for non-OpenAI providers.
    """
    if settings.lm_studio_ranker_model:
        return (
            OpenAI(api_key="lm-studio", base_url=settings.lm_studio_base_url),
            settings.lm_studio_ranker_model,
            False,
        )
    if settings.openrouter_api_key:
        return (
            OpenAI(api_key=settings.openrouter_api_key, base_url="https://openrouter.ai/api/v1"),
            "meta-llama/llama-3.3-70b-instruct:free",
            False,
        )
    if settings.openai_api_key:
        return OpenAI(), "gpt-4o-mini", True
    return None, None, False

SYSTEM_PROMPT = (
    "You are a senior career strategist. Given a candidate's skill profile and a list of job postings, "
    "rank the jobs by true fit — not just keyword overlap — and explain each briefly. "
    "For the top 3 jobs also provide a 7-day action plan to close the skill gap."
)


# ── Cache check ───────────────────────────────────────────────────────────────

def is_cache_valid(db: Client, user_id: str, batch_week: date) -> bool:
    """Returns True if LLM-ranked matches already exist for this user + batch_week."""
    result = (
        db.table("user_job_matches")
        .select("id")
        .eq("user_id", user_id)
        .eq("batch_week", str(batch_week))
        .eq("is_recommended", True)
        .limit(1)
        .execute()
    )
    return bool(result.data)


# ── Prompt building ───────────────────────────────────────────────────────────

def build_prompt(user_skill_map: dict[str, int], top_jobs: list[dict]) -> str:
    skill_summary = {k: v for k, v in sorted(user_skill_map.items(), key=lambda x: -x[1])}
    jobs_payload = [
        {
            "job_id": j["job_id"],
            "title": j["title"],
            "company": j.get("company"),
            "description_snippet": j.get("description", "")[:800],
            "overlap_score": j["overlap_score"],
            "matched_skills": j.get("matched_skills", []),
        }
        for j in top_jobs
    ]
    return f"""Candidate skill profile (taxonomy_key: matched_level, scale 0–5):
{json.dumps(skill_summary, indent=2)}

Top {len(top_jobs)} jobs by skill overlap (ranked by overlap_score):
{json.dumps(jobs_payload, indent=2)}

Return a JSON array of {len(top_jobs)} objects, best fit first:
[
  {{
    "job_id": "<string>",
    "rank": <1–{len(top_jobs)}>,
    "explanation": "<2 sentences: why this job fits this candidate>",
    "action_plan": <7-day plan array OR null>
  }}
]

Rules:
- explanation: 2 sentences max, specific to this candidate's skill gaps
- action_plan: include only for rank 1, 2, and 3; set null for all others
- action_plan format: [{{"day": 1, "focus": "<skill name>", "tasks": ["task 1", "task 2"]}}, ...]
  - 7 items (one per day), each with 1–2 concrete tasks
- Return valid JSON only — no text outside the array"""


# ── Response parser ───────────────────────────────────────────────────────────

def parse_llm_response(text: str) -> list[dict] | None:
    """Extract and validate the JSON array from the LLM response."""
    # Strip <think>...</think> blocks emitted by reasoning-distilled models (safe no-op if absent)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
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
    return result


# ── LLM call ─────────────────────────────────────────────────────────────────

def call_llm(user_skill_map: dict[str, int], top_jobs: list[dict]) -> list[dict] | None:
    """Call LLM (LM Studio → OpenRouter → GPT-4o mini). Returns parsed list or None on failure."""
    client, model, supports_json_mode = _get_client_and_model()
    if client is None:
        logger.error("No LLM configured for job ranking — set OPENROUTER_API_KEY or OPENAI_API_KEY")
        return None
    prompt = build_prompt(user_skill_map, top_jobs)
    logger.info("LLM ranker using model: %s", model)

    kwargs: dict = dict(
        model=model,
        max_tokens=_MAX_TOKENS,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
    )
    if supports_json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    try:
        response = client.chat.completions.create(**kwargs)
        content = response.choices[0].message.content or ""
    except Exception as exc:
        logger.error("LLM ranking call failed: %s", exc)
        return None

    # json_object mode wraps array — unwrap if needed
    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            return parsed
        # GPT wraps array in {"rankings": [...]} or similar
        for v in parsed.values():
            if isinstance(v, list):
                return v
    except json.JSONDecodeError:
        pass

    return parse_llm_response(content)


# ── Persist ───────────────────────────────────────────────────────────────────

def persist_matches(
    db: Client,
    user_id: str,
    batch_week: date,
    top_jobs: list[dict],
    ranked: list[dict],
) -> int:
    """
    Upsert to user_job_matches.
    Top 3 by LLM rank → is_recommended=True.
    Returns count of rows written.
    """
    rank_map: dict[str, dict] = {str(r["job_id"]): r for r in ranked}
    now = datetime.now(timezone.utc).isoformat()

    rows = []
    for job in top_jobs:
        jid = str(job["job_id"])
        llm_data = rank_map.get(jid, {})
        llm_rank: int | None = llm_data.get("rank")
        rows.append({
            "user_id": user_id,
            "job_id": jid,
            "batch_week": str(batch_week),
            "overlap_score": job["overlap_score"],
            "llm_rank": llm_rank,
            "llm_explanation": llm_data.get("explanation"),
            "is_recommended": isinstance(llm_rank, int) and llm_rank <= 3,
            "action_plan": llm_data.get("action_plan") or [],
            "matched_skills": job.get("matched_skills") or [],
            "computed_at": now,
        })

    if rows:
        db.table("user_job_matches").upsert(
            rows, on_conflict="user_id,job_id,batch_week"
        ).execute()

    return len(rows)


# ── Main entry point ──────────────────────────────────────────────────────────

def rank_and_persist(
    db: Client,
    user_id: str,
    batch_week: date,
    user_skill_map: dict[str, int],
    top_jobs: list[dict],
) -> int:
    """
    Full ranking pipeline: LLM call → persist.
    Returns count of rows written (0 if no jobs to rank).
    Skips LLM call and returns 0 if cache is valid.
    """
    if not top_jobs:
        return 0

    if is_cache_valid(db, user_id, batch_week):
        logger.info("Job match cache valid for user %s week %s — skipping LLM", user_id, batch_week)
        return 0

    ranked = call_llm(user_skill_map, top_jobs)

    if ranked is None:
        # LLM failed — persist overlap-only results without LLM ranking
        logger.warning("LLM ranking failed for user %s — storing overlap scores only", user_id)
        ranked = [
            {"job_id": j["job_id"], "rank": i + 1, "explanation": None, "action_plan": None}
            for i, j in enumerate(top_jobs)
        ]

    return persist_matches(db, user_id, batch_week, top_jobs, ranked)
