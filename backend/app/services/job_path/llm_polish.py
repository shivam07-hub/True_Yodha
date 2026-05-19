"""LLM polish helper for per-job CV Versions."""
from __future__ import annotations

import json
import logging
from typing import Any

from app.services.job_path._content import _load_text
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

_POLISH_MAX_TOKENS = 4096


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


async def _call_ai_polish(
    baseline_text: str,
    job: dict[str, Any],
    targets: list[dict[str, Any]],
    completed: list[dict[str, Any]],
    provider: LLMProvider | None,
) -> str | None:
    if provider is None:
        return None
    messages = _build_polish_messages(baseline_text, job, targets, completed)
    try:
        return await provider.complete(messages, max_tokens=_POLISH_MAX_TOKENS)
    except LLMProviderError:
        logger.info("CV polish: all providers failed.")
        return None
