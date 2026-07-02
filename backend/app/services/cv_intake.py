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
    "tailored to a target job.\n"
    "HONESTY (unbreakable): use ONLY facts the candidate wrote — NEVER invent "
    "numbers, employers, titles, dates, metrics, scope, or achievements.\n"
    "PRESERVE THE SPECIFICS: keep every concrete detail the candidate stated — "
    "named organisations, clients, events, products, teams, technologies, scope "
    "and scale words. These specifics are what make a bullet land; stripping them "
    "is the #1 failure. A vague, generic bullet like 'Handled marketing for X' or "
    "'Helped X grow in India' is UNACCEPTABLE — if the candidate named the fest, "
    "the team, the client, or the scope, that specific MUST appear in the bullet. "
    "Never flatten a rich sentence into a bland label.\n"
    "SHAPE: each bullet is ONE line (aim 18–30 words) starting with a strong "
    "past-tense action verb, then the specific what + the context/scope. Prefer "
    "FEWER, RICHER bullets over many thin ones — merge fragments of the same "
    "accomplishment; only split genuinely distinct achievements. Even the messiest "
    "input (pasted JD fragments, parentheticals, typos) still contains real "
    "specifics — extract and sharpen them, don't summarise them away.\n"
    "SKILLS: for each bullet list which target skills it GENUINELY demonstrates (a "
    "subset — never force a skill that isn't shown).\n"
    "ROLE: pick the best-fit role index from the candidate's roles, or null.\n"
    "METRIC: if a bullet would be much stronger with a number the candidate did "
    "NOT give, set needs_metric true — do NOT invent one.\n"
    "Output ONLY a JSON array of objects: "
    '{"text": str, "skills_covered": [str], "role_index": int|null, '
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


_PLACE_METRIC_GUARD = (
    "You are a CV editor. The candidate has supplied a REAL number for a bullet. "
    "Rewrite the bullet so the number is woven in naturally, as ONE line starting "
    "with a strong past-tense verb. Rules: use ONLY the given bullet and the given "
    "number — invent NOTHING else, no extra metrics, employers, or claims. Keep the "
    "bullet's meaning. Output ONLY the rewritten line — no quotes, no prose, no fences."
)


def _clean_line(raw: str) -> str:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        nl = text.find("\n")
        if nl != -1 and text[:nl].lower().startswith(("json", "text")):
            text = text[nl + 1:]
    text = text.strip().strip('"').strip("'").strip()
    # collapse to a single line — the model occasionally adds a trailing note
    return text.splitlines()[0].strip() if text else ""


async def place_metric(bullet: str, metric: str, provider: LLMProvider | None) -> dict:
    """Weave a user-supplied number into a bullet (4.1). Myro never invents the
    number — the user gives it, Mentor places it. Returns:
      {"mode": "placed",    "text": <rewritten>}   number folded in
      {"mode": "unchanged", "text": <original>}    nothing to do / provider down
    """
    bullet = (bullet or "").strip()
    metric = (metric or "").strip()
    if not bullet or not metric or provider is None:
        return {"mode": "unchanged", "text": bullet}
    messages = [
        {"role": "system", "content": _PLACE_METRIC_GUARD},
        {"role": "user", "content": f"Bullet:\n{bullet}\n\nReal number to include:\n{metric}"},
    ]
    try:
        raw = await provider.complete(messages, max_tokens=160)
    except LLMProviderError:
        return {"mode": "unchanged", "text": bullet}
    line = _clean_line(raw)
    if not line:
        return {"mode": "unchanged", "text": bullet}
    return {"mode": "placed", "text": line[:MAX_BULLET_CHARS]}


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
