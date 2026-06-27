"""Natural-language job-query parser for the public job-gen search.

Turns a free-text desire ("product roles in Bangalore, under 3 yrs") into the
structured filters the real jobs feed already understands — role text + location.
This is the ONLY new step in the job-gen pipeline (backlog #33, Q2): parse here,
then the repo runs the filters over real openings. Nothing is fabricated — the
parser only decides HOW to search the live feed, never WHAT comes back.

Fail-soft by contract: any LLM/parse failure degrades to a raw-term search
(role = the whole query), so the feature never hard-fails on a flaky provider.
"""

import json
import logging
from typing import Any

from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger("app.job_query_parser")

_MAX_TOKENS = 220

_SYSTEM = (
    "You convert a job seeker's free-text request into structured search filters. "
    "Return ONLY a compact JSON object, no prose, with these keys:\n"
    '  "role": short role/title text to search for (e.g. "product manager"), required\n'
    '  "location_city": a single city name, or null\n'
    '  "location_country": a country name, or null\n'
    '  "location_mode": one of "remote" | "hybrid" | "onsite", or null\n'
    '  "skills": up to 5 named skills/tools mentioned, or []\n'
    "Rules: never invent a city/country not implied by the text. If the user only "
    "names a field (e.g. 'remote data roles'), fill only what's stated; leave the "
    "rest null. Keep 'role' to the core title words, dropping seniority/exp/filler."
)


def _coerce(parsed: dict[str, Any], fallback_role: str) -> dict[str, Any]:
    """Normalise the model's JSON into the strict filter shape, defensively."""

    def _str_or_none(v: Any) -> str | None:
        if not isinstance(v, str):
            return None
        s = v.strip()
        return s or None

    role = _str_or_none(parsed.get("role")) or fallback_role
    mode = _str_or_none(parsed.get("location_mode"))
    if mode and mode.lower() not in {"remote", "hybrid", "onsite"}:
        mode = None
    skills_raw = parsed.get("skills")
    skills = [s.strip() for s in skills_raw if isinstance(s, str) and s.strip()][:5] if isinstance(skills_raw, list) else []
    return {
        "role": role,
        "location_city": _str_or_none(parsed.get("location_city")),
        "location_country": _str_or_none(parsed.get("location_country")),
        "location_mode": mode.lower() if mode else None,
        "skills": skills,
    }


async def parse_job_query(query: str, provider: LLMProvider | None) -> dict[str, Any]:
    """Parse an NL job request into {role, location_city, location_country,
    location_mode, skills}. Always returns a usable filter set — on any failure,
    role falls back to the raw query so the real-feed search still runs."""
    fallback_role = " ".join((query or "").split())[:120]
    fallback = {
        "role": fallback_role,
        "location_city": None,
        "location_country": None,
        "location_mode": None,
        "skills": [],
    }
    if not fallback_role or provider is None:
        return fallback

    messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": fallback_role},
    ]
    try:
        raw = await provider.complete(messages, max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.info("job_query_parser: provider failed; using raw-term fallback")
        return fallback

    text = (raw or "").strip()
    # Models sometimes fence the JSON — strip a leading ```json / trailing ```.
    if text.startswith("```"):
        text = text.split("```", 2)[1] if "```" in text[3:] else text.strip("`")
        text = text[4:].strip() if text.lower().startswith("json") else text.strip()
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        logger.info("job_query_parser: non-JSON model output; using raw-term fallback")
        return fallback
    if not isinstance(parsed, dict):
        return fallback
    return _coerce(parsed, fallback_role)
