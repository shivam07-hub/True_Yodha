"""
llm_ranker.py
Re-ranks the top 10 job matches using GPT-4o mini.
Generates per-job explanations and 7-day action plans for the top 3.

Cost control:
  - Model: gpt-4o-mini only
  - One call per user per batch_week — cached in user_job_matches
  - Cache is invalidated when the user uploads a new CV (external — not handled here)

Called from: POST /jobs/compute
"""

import json
import logging
from datetime import date, datetime, timezone

from openai import OpenAI
from supabase import Client

logger = logging.getLogger(__name__)

_MODEL = "gpt-4o-mini"
_MAX_TOKENS = 4096

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
    "job_id": <int>,
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
    return result


# ── LLM call ─────────────────────────────────────────────────────────────────

def call_llm(user_skill_map: dict[str, int], top_jobs: list[dict]) -> list[dict] | None:
    """Call GPT-4o mini. Returns parsed list or None on failure."""
    client = OpenAI()  # reads OPENAI_API_KEY from env
    prompt = build_prompt(user_skill_map, top_jobs)

    try:
        response = client.chat.completions.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": prompt},
            ],
            response_format={"type": "json_object"},
        )
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
    rank_map: dict[int, dict] = {r["job_id"]: r for r in ranked}
    now = datetime.now(timezone.utc).isoformat()

    rows = []
    for job in top_jobs:
        jid = job["job_id"]
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
