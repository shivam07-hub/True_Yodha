"""Whole-CV "Restructure with Mentor" — DESIGN_cv_playground_redesign §6.2.

The higher-order sibling of per-bullet Rewrite (``cv_rewrite``). Where Rewrite
sharpens ONE bullet, Restructure proposes a reordered / merged / trimmed version
of the WHOLE CV, targeted at one page + this job's JD. The proposal is always
reviewable — accept writes a new ``polished`` version, reject discards. Nothing
is ever auto-overwritten (CVJT1 / §6.2).

Hard guards (CVJT1 "One-page and preview behavior" + no-fabrication ADR-0016):
  * NEVER invent numbers, employers, titles, dates, or achievements.
  * NEVER remove employers, roles, dates, education, contact details, skills,
    certifications, or whole sections — only reorder, merge, or cut individual
    experience / project bullets.

v1 ships on the existing ``llm_provider`` ladder; it swaps to Mentor RAG later
with no API/UI change — only ``_build_messages`` gains retrieved playbook chunks
(same seam as ``cv_rewrite``).

Callers: POST /cv/versions/{id}/restructure (propose) — see routers/cv/versions.py.
"""
from __future__ import annotations

import json
import logging

from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

_MAX_TOKENS = 1500
_MAX_CHANGES = 8


def _build_messages(
    cv_text: str,
    role: str | None,
    company: str | None,
    missing_keywords: list[str],
) -> list[dict[str, str]]:
    system = (
        "You are a sharp senior recruiter restructuring ONE candidate's résumé to "
        "fit a single page and match a target job, WITHOUT inventing anything.\n"
        "You MAY: reorder sections and bullets so the most relevant proof comes "
        "first; merge two weak bullets into one stronger line; cut the "
        "lowest-impact experience or project bullets; tighten wording with the "
        "Google XYZ formula.\n"
        "You MUST NOT: invent numbers, employers, job titles, dates, or "
        "achievements; remove any employer, role, date, education entry, contact "
        "detail, skills line, certification, or whole section — only individual "
        "experience/project bullets may be cut or merged.\n"
        "Return ONLY a JSON object, no prose, no code fence, with keys:\n"
        '  "cv": the full restructured résumé as plain text,\n'
        '  "changes": array of up to 8 short past-tense strings describing each '
        "structural change (e.g. \"Moved the Stripe role above the internship\", "
        '"Merged two deployment bullets into one"),\n'
        '  "why": one or two sentences on why this ordering reads stronger for '
        "this job,\n"
        '  "playbook": the CV principle applied (e.g. "Most-relevant-first; XYZ '
        'impact bullets"),\n'
        '  "uncertainty": one honest caveat, including any line the candidate '
        'should verify or only keep "if true"; empty string if none.'
    )
    parts = [f"Current résumé:\n{cv_text.strip()}"]
    if role:
        parts.append(f"Target role: {role.strip()}")
    if company:
        parts.append(f"Target company: {company.strip()}")
    if missing_keywords:
        kept = ", ".join(k for k in missing_keywords[:12] if k.strip())
        if kept:
            parts.append(
                "Skills this job wants that are weak/absent — surface existing "
                f"evidence for these first, never fabricate: {kept}"
            )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n\n".join(parts)},
    ]


def _parse_proposal(raw: str) -> dict | None:
    """Parse the model's JSON proposal defensively. Returns None on any shape
    we can't trust (so the caller errors out and never charges/writes)."""
    text = (raw or "").strip()
    if text.startswith("```"):
        # strip a ```json … ``` fence if the model added one despite instructions
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text.strip("`")
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    try:
        obj = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(obj, dict):
        return None
    cv = (obj.get("cv") or "").strip() if isinstance(obj.get("cv"), str) else ""
    if not cv:
        return None
    raw_changes = obj.get("changes")
    changes = [
        c.strip()
        for c in (raw_changes if isinstance(raw_changes, list) else [])
        if isinstance(c, str) and c.strip()
    ][:_MAX_CHANGES]
    return {
        "cv": cv,
        "changes": changes,
        "why": (obj.get("why") or "").strip() if isinstance(obj.get("why"), str) else "",
        "playbook": (obj.get("playbook") or "").strip() if isinstance(obj.get("playbook"), str) else "",
        "uncertainty": (obj.get("uncertainty") or "").strip() if isinstance(obj.get("uncertainty"), str) else "",
    }


async def suggest_restructure(
    cv_text: str,
    role: str | None,
    company: str | None,
    missing_keywords: list[str] | None,
    provider: LLMProvider | None,
) -> dict:
    """Return one of:
      {"mode": "proposal", "proposed_text": str, "changes": list[str],
       "rationale": str, "playbook": str, "uncertainty": str}
      {"mode": "error", "rationale": str}                  — provider/parse failed

    Stateless and free — applies and charges nothing. The keep-charge lives in
    the apply endpoint so failed/rejected/discarded proposals cost nothing.
    """
    cv_text = (cv_text or "").strip()
    missing_keywords = missing_keywords or []
    if not cv_text:
        return {"mode": "error", "rationale": "Nothing to restructure."}
    if provider is None:
        return {"mode": "error", "rationale": "Restructure is unavailable right now."}

    messages = _build_messages(cv_text, role, company, missing_keywords)
    try:
        raw = await provider.complete(messages, max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.info("cv_restructure: all providers failed (cv len=%d)", len(cv_text))
        return {"mode": "error", "rationale": "Restructure is unavailable right now."}

    parsed = _parse_proposal(raw or "")
    if parsed is None:
        logger.info("cv_restructure: unparseable proposal (raw len=%d)", len(raw or ""))
        return {"mode": "error", "rationale": "No usable restructure produced. Try again."}

    return {
        "mode": "proposal",
        "proposed_text": parsed["cv"],
        "changes": parsed["changes"] or ["Reordered and tightened for this job."],
        "rationale": parsed["why"],
        "playbook": parsed["playbook"],
        "uncertainty": parsed["uncertainty"],
    }
