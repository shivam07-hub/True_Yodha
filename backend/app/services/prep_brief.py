"""Prep Brief — the paid (30-coin) day-of interview brief for one application.

Preparations lock Q3/Q5 (2026-07-15): the discrete premium artifact of the prep
room. One grounded LLM compose over what Myro actually holds for this job —
the JD, the coverage panel (requirements + the user's matched stories), nothing
else. Charged on success only; a purchased brief replays free (job_deepenings).

No-fabrication (ADR-0016): the brief may ONLY restate the JD and the user's own
stories. It never invents company culture, interviewers, process stages, or
facts about the company — hiring signal in, hiring signal out.
"""
from __future__ import annotations

import json
import logging

from app.services import myro_voice
from app.services.jd_coverage import CoverageItem
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

_MAX_TOKENS = 1100
_MAX_JD_CHARS = 8_000

_TASK = (
    "THIS SURFACE: a short day-of interview brief. You are given the job "
    "description and their own career stories matched against the job's "
    "requirements. Strict rules:\n"
    "- Use ONLY the job description and the provided stories. Never invent "
    "facts about the company either — culture, interviewers, process, news.\n"
    "- Where a requirement has a matched story, build on THAT story.\n"
    "- Name the uncovered requirements honestly — they should walk in knowing "
    "their weak spots, not surprised by them.\n"
    "- Plain, calm, specific. No hype.\n"
    "Return ONLY minified JSON with keys: snapshot (string, 2-3 sentences on "
    "what this role is really about, from the JD), leads (array of at most 3 "
    "objects {story: string, why: string} — their strongest stories "
    "to lead with and why they land for THIS role), likely_questions (array of "
    "4-6 interview questions a hiring manager would ask, derived from the "
    "stated requirements), watch_out (string, one honest line on the biggest "
    "uncovered requirement and how to handle it — empty if none), plan (array "
    "of exactly 3 short strings: before / during / after guidance). No prose "
    "outside the JSON."
)

_SYSTEM_PROMPT = myro_voice.speaking_to_reader(_TASK)


def _coverage_digest(rows: list[CoverageItem]) -> str:
    """Compact, grounded context: every requirement with its matched story."""
    lines: list[str] = []
    for row in rows:
        if row.status == "gap" or not row.story_title:
            lines.append(f"- [NOT COVERED] {row.requirement}")
        else:
            tag = "COVERED" if row.status == "covered" else "WEAK"
            story = row.story_title
            if row.story_pointer:
                story += f" — {row.story_pointer}"
            lines.append(f"- [{tag}] {row.requirement} → their story: {story}")
    return "\n".join(lines)


def _build_messages(role: str, company: str, jd_text: str, rows: list[CoverageItem]) -> list[dict]:
    user = (
        f"Job: {role or 'the role'} at {company or 'the company'}\n\n"
        f"Job description:\n{(jd_text or '').strip()[:_MAX_JD_CHARS]}\n\n"
        f"Requirements vs the candidate's own stories:\n{_coverage_digest(rows)}\n\n"
        "Write the brief."
    )
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


def parse_brief(raw: str) -> dict | None:
    """Defensive parse → the brief dict, or None on malformed output."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if "\n" in text:
            text = text.split("\n", 1)[1]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        obj = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None
    snapshot = str(obj.get("snapshot") or "").strip()
    questions = [str(q).strip() for q in obj.get("likely_questions") or [] if str(q).strip()]
    if not snapshot or not questions:
        return None
    leads: list[dict] = []
    for item in obj.get("leads") or []:
        if not isinstance(item, dict):
            continue
        story = str(item.get("story") or "").strip()
        if story:
            leads.append({"story": story, "why": str(item.get("why") or "").strip()})
    plan = [str(p).strip() for p in obj.get("plan") or [] if str(p).strip()]
    return {
        "snapshot": snapshot,
        "leads": leads[:3],
        "likely_questions": questions[:6],
        "watch_out": str(obj.get("watch_out") or "").strip(),
        "plan": plan[:3],
    }


async def build_prep_brief(
    *,
    role: str,
    company: str,
    jd_text: str,
    coverage_rows: list[CoverageItem],
    provider: LLMProvider | None,
) -> dict | None:
    """Return the parsed brief dict, or None on provider/parse failure (caller
    then charges nothing — charge-on-success, same as the reach pack)."""
    if provider is None:
        return None
    if not (jd_text or "").strip() and not coverage_rows:
        return None
    messages = _build_messages(role, company, jd_text, coverage_rows)
    try:
        raw = await provider.complete(messages, max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.info("prep_brief: all providers failed")
        return None
    return parse_brief(raw or "")
