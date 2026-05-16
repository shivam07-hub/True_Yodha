"""
llm_ranker.py
Re-ranks the top 10 job matches using an LLM.
Generates per-job explanations and 7-day action plans for the top 3.

Cost control:
  - One call per user per batch_week — cached in user_job_matches
  - Cache is invalidated when the user uploads a new CV (external — not handled here)

Provider chain is managed by LLMProvider (services/llm_provider.py).
Called from: POST /jobs/compute
"""

import json
import logging
import re
from datetime import date, datetime, timezone

from supabase import Client

from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

_MAX_TOKENS = 4096

SYSTEM_PROMPT = (
    "You are a senior HR career strategist. Given a candidate's extracted skill profile and a list of job postings, "
    "rank the jobs by true fit — not just keyword overlap — and explain why it is a good fit briefly for each."
)


# ── Cache check ───────────────────────────────────────────────────────────────

def has_matches_this_week(db: Client, user_id: str, batch_week: date) -> bool:
    """Returns True if any matches exist for this user/week."""
    result = (
        db.table("user_job_matches")
        .select("job_id")
        .eq("user_id", user_id)
        .eq("batch_week", str(batch_week))
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
    "rank": <1–5>,
    "explanation": "<2 sentences: why this job fits this candidate>",
    "action_plan": null
  }}
]

Rules:
- explanation: 2 sentences max, specific to this candidate's actual skill profile
- action_plan: always null
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

async def call_llm(
    user_skill_map: dict[str, int],
    top_jobs: list[dict],
    provider: LLMProvider,
) -> list[dict] | None:
    """Call LLMProvider with ranking prompt. Returns parsed list or None on failure."""
    prompt = build_prompt(user_skill_map, top_jobs)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": prompt},
    ]
    try:
        content = await provider.complete(messages, max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.error("All job ranking providers failed")
        return None

    result = parse_llm_response(content)
    if result:
        return result
    logger.warning("LLM ranker: unparseable response from provider")
    return None


# ── Persist ───────────────────────────────────────────────────────────────────

def persist_matches(
    db: Client,
    user_id: str,
    batch_week: date,
    top_jobs: list[dict],
    ranked: list[dict],
) -> int:
    """Upsert to user_job_matches. All jobs get LLM rank + explanation. Returns count written."""
    rank_map: dict[str, dict] = {str(r["job_id"]): r for r in ranked}
    now = datetime.now(timezone.utc).isoformat()

    rows = []
    for job in top_jobs:
        jid = str(job["job_id"])
        llm_data = rank_map.get(jid, {})
        rows.append({
            "user_id": user_id,
            "job_id": jid,
            "batch_week": str(batch_week),
            "overlap_score": job["overlap_score"],
            "llm_rank": llm_data.get("rank"),
            "llm_explanation": llm_data.get("explanation"),
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

async def rank_and_persist(
    db: Client,
    user_id: str,
    batch_week: date,
    user_skill_map: dict[str, int],
    top_jobs: list[dict],
    provider: LLMProvider,
) -> int:
    """Full ranking pipeline: LLM call → persist. Returns count of rows written."""
    if not top_jobs:
        return 0

    ranked = await call_llm(user_skill_map, top_jobs, provider)

    if ranked is None:
        logger.warning("LLM ranking failed for user %s — storing overlap scores only", user_id)
        ranked = [
            {"job_id": j["job_id"], "rank": i + 1, "explanation": None, "action_plan": None}
            for i, j in enumerate(top_jobs)
        ]

    return persist_matches(db, user_id, batch_week, top_jobs, ranked)
