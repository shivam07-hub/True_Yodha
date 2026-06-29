"""cv_intake — turn the candidate's own words into JD-aligned résumé bullets.

The "Add from your experience" flow: the user reads the JD, writes (in their own
words) what they've done that fits, and Mentor shapes it into strong bullets,
mapping each to the target skills it genuinely shows and the best-fit existing
role. Fuses user intake with the gaps that need surfacing so the tailored CV is
both comprehensive and aligned with what the user wants to submit.

Stateless + free: writes nothing. Accepted bullets are inserted into the living
master via the existing PUT /cv/master. Same no-fabrication law as cv_rewrite
(ADR-0016): only the candidate's stated facts — never an invented number.
"""
from __future__ import annotations

import json
import logging

from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger("myro.cv_intake")

MAX_TOKENS = 700
MAX_BULLETS = 6
MAX_BULLET_CHARS = 320

_GUARDRAILS = (
    "You are a sharp senior recruiter and CV editor. Turn the candidate's own "
    "description of their experience into strong, ATS-friendly résumé bullets "
    "tailored to a target job. Unbreakable rules: use ONLY facts the candidate "
    "wrote — NEVER invent numbers, employers, titles, dates, metrics, or "
    "achievements. Each bullet is ONE line (max ~30 words) starting with a strong "
    "past-tense action verb. Split distinct accomplishments into separate bullets; "
    "merge fragments of the same one. For each bullet, list which of the target "
    "skills it GENUINELY demonstrates (a subset — never force a skill that isn't "
    "shown). Pick the best-fit role index from the candidate's roles, or null if it "
    "fits none. If a bullet would be much stronger with a number the candidate did "
    "NOT give, set needs_metric true — do not invent one. Output ONLY a JSON array "
    'of objects: {"text": str, "skills_covered": [str], "role_index": int|null, '
    '"needs_metric": bool}. No prose, no code fences.'
)


def _build_messages(
    raw_text: str,
    jd_text: str | None,
    gap_skills: list[str],
    roles: list[str],
) -> list[dict[str, str]]:
    parts = [f"Candidate's description of what they did:\n{raw_text.strip()}"]
    if jd_text and jd_text.strip():
        parts.append(f"Target job description (for alignment only):\n{jd_text.strip()[:2400]}")
    if gap_skills:
        parts.append("Target skills to map bullets to (only if genuinely shown): " + ", ".join(gap_skills[:20]))
    if roles:
        listed = "\n".join(f"{i}: {r}" for i, r in enumerate(roles))
        parts.append(f"Candidate's roles (pick role_index from these):\n{listed}")
    return [
        {"role": "system", "content": _GUARDRAILS},
        {"role": "user", "content": "\n\n".join(parts)},
    ]


def _coerce_bullets(raw: str, gap_skills: list[str], role_count: int) -> list[dict]:
    """Parse the model's JSON array into validated bullets — defensive against
    code fences, stray prose, and out-of-range indices. Returns [] on junk."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        nl = text.find("\n")
        if nl != -1:
            text = text[nl + 1:]
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []
    try:
        parsed = json.loads(text[start:end + 1])
    except (json.JSONDecodeError, ValueError):
        return []
    if not isinstance(parsed, list):
        return []

    allowed = {s.lower(): s for s in gap_skills}
    out: list[dict] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        btext = str(item.get("text") or "").strip().strip('"').strip()
        if not btext:
            continue
        covered = [
            allowed[str(s).lower()]
            for s in (item.get("skills_covered") or [])
            if isinstance(s, (str,)) and str(s).lower() in allowed
        ]
        ri = item.get("role_index")
        role_index = ri if isinstance(ri, int) and 0 <= ri < role_count else None
        out.append({
            "text": btext[:MAX_BULLET_CHARS],
            "skills_covered": list(dict.fromkeys(covered)),
            "role_index": role_index,
            "needs_metric": bool(item.get("needs_metric")),
        })
        if len(out) >= MAX_BULLETS:
            break
    return out


async def draft_from_intake(
    raw_text: str,
    jd_text: str | None,
    gap_skills: list[str],
    roles: list[str],
    provider: LLMProvider | None,
) -> dict:
    """Shape the candidate's raw experience into JD-aligned bullets. Returns one of:
      {"mode": "draft", "bullets": [...]}
      {"mode": "error", "rationale": str}
    """
    raw_text = (raw_text or "").strip()
    if not raw_text:
        return {"mode": "error", "rationale": "Tell me what you did and I'll shape it into a bullet."}
    if provider is None:
        return {"mode": "error", "rationale": "Drafting is unavailable right now. Try again."}

    messages = _build_messages(raw_text, jd_text, gap_skills or [], roles or [])
    try:
        raw = await provider.complete(messages, max_tokens=MAX_TOKENS)
    except LLMProviderError:
        logger.info("cv_intake: all providers failed (intake len=%d)", len(raw_text))
        return {"mode": "error", "rationale": "Drafting is unavailable right now. Try again."}

    bullets = _coerce_bullets(raw, gap_skills or [], len(roles or []))
    if not bullets:
        return {"mode": "error", "rationale": "Couldn't shape that into a bullet — add a bit more detail and retry."}
    return {"mode": "draft", "bullets": bullets}
