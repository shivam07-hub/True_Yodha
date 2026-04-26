from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from openai import OpenAI
from supabase import Client

from app.config import settings
from app.services.job_path._content import _load_text
from app.services.job_path._helpers import _single_or_none

logger = logging.getLogger(__name__)

AI_POLISH_LIMIT = 3
_OR_HEADERS = {"HTTP-Referer": "https://truemirror.vercel.app", "X-Title": "Truth Mirror"}
_OR_BASE = "https://openrouter.ai/api/v1"
_GROQ_BASE = "https://api.groq.com/openai/v1"
_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/"
_POLISH_MAX_TOKENS = 4096


def _polish_providers() -> list[tuple[OpenAI, str]]:
    providers: list[tuple[OpenAI, str]] = []
    if settings.openrouter_api_key:
        providers.append((OpenAI(api_key=settings.openrouter_api_key, base_url=_OR_BASE, default_headers=_OR_HEADERS), "openai/gpt-4o-mini"))
    if settings.groq_api_key:
        providers.append((OpenAI(api_key=settings.groq_api_key, base_url=_GROQ_BASE), "llama-3.3-70b-versatile"))
    if settings.google_api_key:
        providers.append((OpenAI(api_key=settings.google_api_key, base_url=_GEMINI_BASE), "gemini-2.0-flash-lite"))
    if settings.openrouter_api_key:
        providers.append((OpenAI(api_key=settings.openrouter_api_key, base_url=_OR_BASE, default_headers=_OR_HEADERS), "meta-llama/llama-3.3-70b-instruct:free"))
    return providers


def _prompt_section(prompt_doc: str, start_heading: str, end_heading: str | None = None) -> str:
    start = prompt_doc.find(start_heading)
    if start == -1:
        return prompt_doc
    start += len(start_heading)
    end = prompt_doc.find(end_heading, start) if end_heading else -1
    return prompt_doc[start:end if end != -1 else None].strip()


def _build_polish_messages(
    baseline_text: str,
    job: dict[str, Any],
    targets: list[dict[str, Any]],
    completed: list[dict[str, Any]],
) -> list[dict[str, str]]:
    prompt_doc = _load_text("ai_polish_prompt.md")
    system_prompt = _prompt_section(prompt_doc, "## System Prompt", "## User Prompt Template")
    proof_payload = [
        {
            "skill": row.get("skill"),
            "proof": row.get("proof"),
            "impact": row.get("impact"),
            "confidence": row.get("confidence"),
            "completed_at": row.get("completed_at"),
        }
        for row in completed
    ]
    user_prompt = f"""BASELINE CV:
<<<
{baseline_text}
>>>

JOB DESCRIPTION:
<<<
{job.get("job_description") or ""}
>>>

SELECTED TARGET SKILLS:
{json.dumps([row.get("skill") for row in targets], ensure_ascii=False)}

COMPLETED MILESTONE PROOF (for this job only):
{json.dumps(proof_payload, ensure_ascii=False)}

Return the polished CV text now. No preamble. No commentary."""
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _call_ai_polish(
    baseline_text: str,
    job: dict[str, Any],
    targets: list[dict[str, Any]],
    completed: list[dict[str, Any]],
) -> str | None:
    providers = _polish_providers()
    if not providers:
        logger.info("No LLM configured for CV polish.")
        return None
    messages = _build_polish_messages(baseline_text, job, targets, completed)
    for client, model in providers:
        try:
            response = client.chat.completions.create(
                model=model,
                max_tokens=_POLISH_MAX_TOKENS,
                messages=messages,
            )
            content = response.choices[0].message.content or ""
        except Exception as exc:
            logger.warning("CV polish failed with %s: %s", model, exc)
            continue
        cleaned = content.strip()
        if cleaned:
            return cleaned
    return None


def _ai_polish_count(db: Client, user_id: str) -> int:
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    result = (
        db.table("job_cv_variants")
        .select("id")
        .eq("user_id", user_id)
        .eq("ai_polished", True)
        .gte("ai_polish_used_at", since)
        .execute()
    )
    return len(result.data or [])


def _latest_polished_cv(db: Client, user_id: str, job_id: str) -> dict[str, Any] | None:
    return _single_or_none(
        db.table("job_cv_variants")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .eq("ai_polished", True)
        .order("created_at", desc=True)
        .limit(1)
    )

