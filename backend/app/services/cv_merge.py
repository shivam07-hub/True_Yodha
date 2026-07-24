"""Merge two CV bullets into one — Myro Mentor.

Trigger: a heavy CV dump (`cv_reservoir`/`cv_intake`) or repeated rewrites leave
near-duplicate bullets in the same role — the same win phrased twice, or a
generic filler line saying nothing the bullet above it didn't already cover.
Today the playground only offers hide/rewrite per bullet; a user has no way to
COMBINE two lines into one, so they either live with the redundancy or delete
one and lose whatever it said that the other didn't.

Reuses the rewrite guardrails verbatim, treating the two source bullets as one
combined source: every number and every named specific across BOTH lines must
survive into the merge, or the merge is rejected — the no-DELETION law applies
to a merge exactly as it does to a rewrite (ADR-0016).

Callers: POST /cv/merge-bullet[/apply] — see routers/cv/merge.py.
"""
from __future__ import annotations

import logging

from app.services import mentor_grounding
from app.services.cv_rewrite import (
    MAX_TOKENS,
    clean_bullet_output,
    gains_foreign_numbers,
    loses_metrics,
    loses_substance,
)
from app.services.llm_provider import LLMProvider, LLMProviderError, get_writer_provider

logger = logging.getLogger(__name__)

_GUARDRAILS = (
    "You are a sharp senior recruiter and CV editor. Merge TWO résumé bullets from "
    "the SAME role into ONE tight, ATS-friendly line. Unbreakable rules:\n"
    "- Output ONE line, roughly 20–40 words; a rich pair may need more — never solve "
    "length by deleting content.\n"
    "- Combine, never delete: every named client, market, product, technology, and "
    "domain, and every number, from BOTH bullets must survive into the merged line.\n"
    "- If both bullets state a number for the SAME metric, keep the larger or more "
    "specific one rather than repeating it; if they are different metrics, keep both.\n"
    "- NEVER invent numbers, employers, titles, dates, or achievements.\n"
    "- Start with a strong past-tense action verb.\n"
    "Output ONLY the merged bullet: no quotes, no preamble, no explanation."
)

_KEPT_ORIGINALS_RATIONALE = "Mentor couldn't combine these without losing real substance — kept both originals."


async def suggest_merge(
    bullet_a: str,
    bullet_b: str,
    role: str | None,
    provider: LLMProvider | None = None,
    user_id: str | None = None,
) -> dict:
    """Blocking merge proposal. `provider` is a TEST-ONLY override — production
    resolves the writer floor internally (same strong-only lane as rewrite).
    Returns one of:
      {"mode": "merge", "merged_text": str, "citations": [...]}
      {"mode": "error", "rationale": str}
    """
    a = (bullet_a or "").strip()
    b = (bullet_b or "").strip()
    if not a or not b:
        return {"mode": "error", "rationale": "Need two bullets to merge."}

    query = " ".join(p for p in [a, b, role or ""] if p).strip()
    grounding = await mentor_grounding.assemble(query, user_id=user_id)
    guidance = grounding.prompt_block() if grounding.has_grounding() else ""
    system = _GUARDRAILS + (f"\n\n{guidance}" if guidance else "")
    parts = [f"Bullet 1:\n{a}", f"Bullet 2:\n{b}"]
    if role:
        parts.append(f"Role context: {role.strip()}")
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n\n".join(parts)},
    ]

    provider = provider or get_writer_provider()
    try:
        raw = await provider.complete(messages, max_tokens=MAX_TOKENS)
    except LLMProviderError:
        logger.info("cv_merge: all providers failed (bullet lens=%d/%d)", len(a), len(b))
        return {"mode": "error", "rationale": "Merge is unavailable right now."}

    text = clean_bullet_output(raw)
    if text is None:
        return {"mode": "error", "rationale": "No merge produced."}

    source = f"{a} {b}"
    if loses_metrics(source, text):
        return {
            "mode": "error",
            "rationale": "The merge dropped a real number from one of your lines — kept both originals.",
        }
    if loses_substance(source, text):
        return {"mode": "error", "rationale": _KEPT_ORIGINALS_RATIONALE}
    if gains_foreign_numbers(source, text, ""):
        return {
            "mode": "error",
            "rationale": "The merge added a number neither line stated — kept both originals.",
        }

    return {"mode": "merge", "merged_text": text, "citations": grounding.citations() if grounding else []}
