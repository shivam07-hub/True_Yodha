"""Reach Pack — the paid (50-coin) automated outreach plan for one job.

ADR-0018 Path 2: when the user knows who to search for (the free tier gave them
that), this drafts the actual outreach in *their own voice from their own CV* +
a referral-ask + timing guidance, and folds in any warm intros they have at the
company (from their own uploaded connections, slice 5 — optional).

No-fabrication (ADR-0016): the draft uses ONLY facts present in the candidate's
CV and the job posting. It never invents employers, metrics, or a specific
stranger's name — the message is addressed to a role placeholder the user fills
after finding the person via the free search. That is the whole point of the
wall: we draft what the user sends; we never claim to know a stranger.
"""
from __future__ import annotations

import json
import logging

from app.services import myro_voice
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

_MAX_TOKENS = 900

_TASK = (
    "THIS SURFACE: referral outreach for a specific role. These are the messages "
    "they will send AFTER they find the right person themselves.\n"
    "- Use only facts present in their CV and the job posting.\n"
    "- NEVER invent a specific person's name. Address messages to a placeholder "
    "like \"Hi {first name}\" — they fill it in.\n"
    "- India-appropriate professional tone (this is an Indian job market).\n"
    "Return ONLY minified JSON with keys: outreach_message (string, a LinkedIn "
    "connection-request note under 300 chars), referral_ask (string, a short "
    "follow-up asking for a referral once connected), timing (string, one line "
    "on when/how to send), warm_intro (string, empty unless a warm connection is "
    "provided — then one line on how to use that relationship). No prose outside "
    "the JSON."
)

_SYSTEM_PROMPT = myro_voice.drafting_for_reader(_TASK)


def _cv_digest(cv_structured: dict, body_text: str) -> str:
    """A compact, grounded CV context — structured first, raw text as fallback."""
    cv = cv_structured or {}
    lines: list[str] = []
    contact = cv.get("contact") or {}
    if contact.get("name"):
        lines.append(f"Name: {contact['name']}")
    if cv.get("summary"):
        lines.append(f"Summary: {cv['summary']}")
    for exp in (cv.get("experience") or [])[:3]:
        head = " · ".join(p for p in [exp.get("role"), exp.get("company"), exp.get("dates")] if p)
        if head:
            lines.append(f"Experience: {head}")
        for bullet in (exp.get("bullets") or [])[:3]:
            lines.append(f"  - {bullet}")
    if cv.get("skills_line"):
        lines.append(f"Skills: {cv['skills_line']}")
    digest = "\n".join(lines).strip()
    if digest:
        return digest
    return (body_text or "").strip()[:1500]


def _build_messages(
    cv_digest: str,
    role: str,
    company: str,
    target_titles: list[str],
    warm_connection: str | None,
) -> list[dict]:
    warm = (
        f"The candidate already knows this person at {company}: {warm_connection}. "
        "Use this warm relationship in warm_intro."
        if warm_connection
        else "The candidate has no known connection at the company; leave warm_intro empty."
    )
    titles = ", ".join(target_titles[:4]) or "hiring manager / team lead"
    user = (
        f"Candidate CV:\n{cv_digest or '(no CV on file)'}\n\n"
        f"Target job: {role or 'the role'} at {company or 'the company'}\n"
        f"People they will reach out to (by role): {titles}\n"
        f"{warm}\n\n"
        "Draft the outreach plan."
    )
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


def _parse_pack(raw: str) -> dict | None:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if "\n" in text:
            text = text.split("\n", 1)[1]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        obj = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None
    outreach = str(obj.get("outreach_message") or "").strip()
    if not outreach:
        return None
    return {
        "outreach_message": outreach,
        "referral_ask": str(obj.get("referral_ask") or "").strip(),
        "timing": str(obj.get("timing") or "").strip(),
        "warm_intro": str(obj.get("warm_intro") or "").strip(),
    }


async def build_reach_pack(
    *,
    cv_structured: dict,
    body_text: str,
    role: str,
    company: str,
    target_titles: list[str],
    warm_connection: str | None,
    provider: LLMProvider | None,
) -> dict | None:
    """Return the parsed pack dict, or None on provider/parse failure (caller
    then charges nothing — charge-on-success)."""
    if provider is None:
        return None
    digest = _cv_digest(cv_structured, body_text)
    messages = _build_messages(digest, role, company, target_titles, warm_connection)
    try:
        raw = await provider.complete(messages, max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.info("reach_pack: all providers failed")
        return None
    return _parse_pack(raw or "")
