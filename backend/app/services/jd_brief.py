"""jd_brief — the JD, understood once, with the boilerplate removed.

A job post is mostly not about the job. Benefits, EEO statements, culture
blurbs, "what you'll learn", "apply now" — a hiring manager screens on none of
it, and neither should the weave. Truncating the prose to fit a prompt budget
cuts by POSITION, which is why a 7,404-character JD lost its entire
"Good-to-have" block — the named target geographies, the years of SaaS, the CRM
— while three paragraphs of aspiration survived at the top.

So we read it once with a judgment-lane model and keep only what decides a hire:

  locations       — where the work is, and which markets it names
  seniority       — the band and the years asked for
  must_haves      — non-negotiables that are NOT responsibilities
  nice_to_haves   — the differentiators a candidate can speak to

Responsibilities are NOT duplicated here: `jd_coverage` already parses those as
requirements, and the weave receives both. This brief is the half that parse
drops — it caps at 14 requirements and orders responsibilities first, so a
must-have at the bottom of the post never survives.

No-cheap-models law ([[feedback_no_cheap_models_judgment]]): reading a JD is a
judgment call. Cached per job in `job_deepenings` under `CACHE_PROMPT_KEY`, so
one job is understood exactly once.

FAIL-SOFT: any provider or parse failure returns None and the weave runs on the
raw JD alone — exactly as it did before this module existed.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from app.services.deepening_keys import DeepeningKey
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger("myro.jd_brief")

CACHE_PROMPT_KEY = DeepeningKey.JD_BRIEF
MAX_JD_CHARS = 16_000
MAX_ITEMS = 10
_MAX_TOKENS = 900

_SYSTEM = (
    "You are a senior recruiter reading a job description. Pull out ONLY the "
    "facts a hiring manager screens a candidate on, and throw the rest away.\n"
    "THROW AWAY: benefits, perks, salary blurbs, EEO and diversity statements, "
    "culture and mission prose, 'what you'll learn', 'why join us', application "
    "instructions, company boilerplate.\n"
    "KEEP:\n"
    "- locations: where the work is based, PLUS every market or geography the "
    "role names as a target (e.g. 'MENA', 'Southeast Asia', 'North America').\n"
    "- seniority: the band and the years of experience asked for, as stated.\n"
    "- must_haves: non-negotiable requirements that are NOT day-to-day "
    "responsibilities — years in a domain, a qualification, a tool, a market.\n"
    "- nice_to_haves: the stated preferences and differentiators.\n"
    "Write each item as one short plain phrase, in the JOB's own words. Do not "
    "invent anything the post does not say; an absent field is an empty list or "
    "an empty string.\n"
    f"Return ONLY compact JSON: {{\"locations\": [str], \"seniority\": str, "
    f"\"must_haves\": [str], \"nice_to_haves\": [str]}} with at most {MAX_ITEMS} "
    "items per list. No prose outside the JSON."
)


@dataclass
class JobBrief:
    locations: list[str] = field(default_factory=list)
    seniority: str = ""
    must_haves: list[str] = field(default_factory=list)
    nice_to_haves: list[str] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not (self.locations or self.seniority or self.must_haves or self.nice_to_haves)


def _json_object(raw: str) -> dict | None:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        nl = text.find("\n")
        if nl != -1 and text[:nl].lower().startswith("json"):
            text = text[nl + 1:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(text[start:end + 1])
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _clean_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        text = " ".join(item.split()).strip()
        key = text.lower()
        if text and key not in seen:
            out.append(text)
            seen.add(key)
        if len(out) >= MAX_ITEMS:
            break
    return out


def parse_brief_response(raw: str) -> JobBrief | None:
    """Pure: a defensively-validated brief, or None on malformed output."""
    obj = _json_object(raw)
    if obj is None:
        return None
    seniority = obj.get("seniority")
    brief = JobBrief(
        locations=_clean_list(obj.get("locations")),
        seniority=" ".join(str(seniority).split()).strip() if isinstance(seniority, str) else "",
        must_haves=_clean_list(obj.get("must_haves")),
        nice_to_haves=_clean_list(obj.get("nice_to_haves")),
    )
    return None if brief.is_empty() else brief


def to_payload(brief: JobBrief) -> str:
    return json.dumps({
        "locations": brief.locations,
        "seniority": brief.seniority,
        "must_haves": brief.must_haves,
        "nice_to_haves": brief.nice_to_haves,
    })


def from_payload(raw: str | None) -> JobBrief | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    seniority = data.get("seniority")
    brief = JobBrief(
        locations=_clean_list(data.get("locations")),
        seniority=seniority if isinstance(seniority, str) else "",
        must_haves=_clean_list(data.get("must_haves")),
        nice_to_haves=_clean_list(data.get("nice_to_haves")),
    )
    return None if brief.is_empty() else brief


def digest(brief: JobBrief | None) -> str:
    """The brief as prompt lines. Empty string when there is nothing to say —
    the caller then sends no section at all rather than an empty heading."""
    if brief is None or brief.is_empty():
        return ""
    lines: list[str] = []
    if brief.locations:
        lines.append("Based in / markets named: " + ", ".join(brief.locations))
    if brief.seniority:
        lines.append("Seniority asked for: " + brief.seniority)
    for label, items in (("Must have", brief.must_haves), ("Nice to have", brief.nice_to_haves)):
        for item in items:
            lines.append(f"- [{label}] {item}")
    return "\n".join(lines)


async def assess(jd_text: str, provider: LLMProvider) -> JobBrief | None:
    """Read the JD once. None on any failure — the weave falls back to raw prose."""
    text = (jd_text or "").strip()
    if not text:
        return None
    messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": f"Job description:\n\n{text[:MAX_JD_CHARS]}"},
    ]
    try:
        raw = await provider.complete(messages, max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.info("metric jd_brief.provider_failed")
        return None
    brief = parse_brief_response(raw or "")
    if brief is None:
        logger.info("metric jd_brief.unparseable")
    return brief
