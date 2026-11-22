"""The first draft of a LinkedIn check, written from the user's own CV (ENG3).

Drafted when the reviewer claims the check, never on the payment path (the
same rule as the engagement's review draft). The reviewer edits and signs it;
the user only ever sees the signed blocks.

ADR-0016 holds by construction where it can and by flag where it cannot:

- Employers, titles, dates and schools are copied from the CV, never written by
  the model. The model writes words for roles the CV already has.
- Pinned skills must already be on the CV's skills line.
- A number in the model's words that appears nowhere in the CV or the user's
  stories is listed in `flags` for the reviewer to cut or confirm.

The delete list starts empty: Myro cannot see the LinkedIn profile, so which
rows are duplicates there is the reviewer's to write after reading it.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.database import get_supabase_admin
from app.repositories.cv import CVRepository
from app.services import human_check, mentor_grounding
from app.services.cv_structured_shape import has_content
from app.services.llm_provider import LLMProviderError, get_writer_provider

logger = logging.getLogger(__name__)

DRAFT_MAX_TOKENS = 2500

_SYSTEM = (
    "You rewrite a person's LinkedIn profile from their own CV. Write in first person, plain and "
    "specific, for the recruiter who hires for the role they want. Use ONLY facts in the CV and the "
    "stories given. Never add an employer, title, date, number, metric, client or tool that is not "
    "there. If a role has little in it, write less. Return JSON only, with keys: "
    '"headline" (at most 220 characters, names the buyer of their work, not only the employer), '
    '"about" (at most 2600 characters, the numbers they already have, 3-5 short paragraphs), '
    '"experience" (a list of {"index": <the role index given>, "text": <at most 2000 characters>}), '
    '"skills" (up to 5, copied from the skills line), '
    '"featured" (one line).'
)

_NUMBER = re.compile(r"\d[\d,.]*\s*(?:%|k|K|L|Cr|cr|M|\+)?")


def _cv_text(structured: dict[str, Any]) -> str:
    return json.dumps(structured, ensure_ascii=False)


def _prompt(structured: dict[str, Any], grounding: str) -> str:
    roles = [
        {
            "index": i,
            "company": r.get("company"),
            "title": r.get("role"),
            "dates": r.get("dates"),
            "bullets": r.get("bullets") or [],
        }
        for i, r in enumerate(structured.get("experience") or [])
    ]
    cv = {
        "summary": structured.get("summary"),
        "experience": roles,
        "projects": structured.get("projects") or [],
        "education": structured.get("education") or [],
        "skills_line": structured.get("skills_line"),
        "certs": structured.get("certs") or [],
    }
    parts = [f"CV:\n{json.dumps(cv, ensure_ascii=False)}"]
    if grounding:
        parts.append(grounding)
    parts.append("Write the LinkedIn profile now.")
    return "\n\n".join(parts)


def _parse(raw: str) -> dict[str, Any] | None:
    text = (raw or "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = json.loads(text[start : end + 1])
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _clip(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _skills(picked: Any, skills_line: str | None) -> list[str]:
    on_cv = [s.strip() for s in re.split(r"[,;|•·]", skills_line or "") if s.strip()]
    lowered = {s.lower(): s for s in on_cv}
    chosen = [lowered[p.strip().lower()] for p in (picked or []) if isinstance(p, str) and p.strip().lower() in lowered]
    for skill in on_cv:
        if len(chosen) >= human_check.SKILLS_MAX:
            break
        if skill not in chosen:
            chosen.append(skill)
    return chosen[: human_check.SKILLS_MAX]


def _education(structured: dict[str, Any]) -> list[str]:
    lines = []
    for e in structured.get("education") or []:
        line = " · ".join(p for p in (e.get("degree"), e.get("institution"), e.get("dates")) if p)
        if line:
            lines.append(line)
    return lines


def unsupported_numbers(written: str, source: str) -> list[str]:
    """Numbers in `written` that `source` never states (ADR-0016)."""
    flagged = []
    for match in _NUMBER.finditer(written):
        token = match.group(0).strip().rstrip(".,")
        digits = re.sub(r"[^\d]", "", token)
        if digits and digits not in re.sub(r"[^\d]", " ", source).split() and token not in flagged:
            flagged.append(token)
    return flagged


def build_blocks(structured: dict[str, Any], model: dict[str, Any], source: str) -> dict[str, Any]:
    texts = {
        int(e["index"]): _clip(e.get("text"), human_check.EXPERIENCE_TEXT_MAX)
        for e in (model.get("experience") or [])
        if isinstance(e, dict) and isinstance(e.get("index"), int)
    }
    experience = []
    for i, role in enumerate(structured.get("experience") or []):
        text = texts.get(i) or "\n".join(f"• {b}" for b in role.get("bullets") or [])
        experience.append(
            {
                "company": role.get("company") or "",
                "title": role.get("role") or "",
                "dates": role.get("dates") or "",
                "text": text[: human_check.EXPERIENCE_TEXT_MAX],
            }
        )
    blocks = {
        "headline": _clip(model.get("headline"), human_check.HEADLINE_MAX),
        "about": _clip(model.get("about"), human_check.ABOUT_MAX),
        "experience": experience,
        "education": _education(structured),
        "skills": _skills(model.get("skills"), structured.get("skills_line")),
        "featured": _clip(model.get("featured"), 300),
        "delete": [],
    }
    written = " ".join([blocks["headline"], blocks["about"], blocks["featured"], *(e["text"] for e in experience)])
    blocks["flags"] = [f"Number not in the CV: {n}" for n in unsupported_numbers(written, source)]
    return blocks


async def draft(user_id: str) -> dict[str, Any] | None:
    """The reviewer's starting point, or None when there is no CV to write from
    or the model did not answer (the reviewer then writes from the profile)."""
    master = CVRepository(get_supabase_admin()).latest_baseline(user_id)
    structured = (master or {}).get("cv_structured") or {}
    if not has_content(structured):
        logger.warning("metric linkedin_draft.no_cv")
        return None
    grounding = await mentor_grounding.assemble(
        "LinkedIn headline, About and experience", user_id=user_id, shelf="cv"
    )
    try:
        raw = await get_writer_provider().complete(
            [
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _prompt(structured, grounding.prompt_block())},
            ],
            max_tokens=DRAFT_MAX_TOKENS,
        )
    except LLMProviderError:
        logger.warning("metric linkedin_draft.llm_failed")
        return None
    model = _parse(raw)
    if model is None:
        logger.warning("metric linkedin_draft.unparsed")
        return None
    source = _cv_text(structured) + " " + " ".join(f"{s.title} {s.pointer} {s.result}" for s in grounding.stories)
    return build_blocks(structured, model, source)
