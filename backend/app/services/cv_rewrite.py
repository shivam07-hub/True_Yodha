"""Per-bullet AI rewrite — Myro Mentor wedge v1 (DESIGN_cv_playground_redesign §6).

Proposes a stronger, JD-aligned rewrite of a single CV bullet, grounded in the
authored Myro CV Playbook. Backlog #32: the style guidance is now retrieved live
from the playbook shelf (Mentor retriever, ADR-0013/0014) instead of a hard-coded
XYZ block — so a rewrite cites the specific rule it applied, and new playbook
content improves rewrites the day it's published. FAIL-SOFT: if retrieval returns
nothing (empty corpus, missing key, error) we fall back to the static style rule,
so a rewrite never depends on RAG being up.

Hard no-fabrication rule (ADR-0016, blocking): if the bullet states no
measurable result and the user has not supplied one, we DO NOT ask the model to
invent a number — we return a targeted *question* for the real metric. This is
the Socratic pedagogy and produces honest, stronger bullets.

Callers: POST /cv/rewrite-bullet (suggest) — see routers/cv/skill_edit.py.
"""
from __future__ import annotations

import logging
import re

from app.services import mentor_retriever
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

_MAX_TOKENS = 220

# Top-k authored playbook passages to ground a single bullet rewrite.
_RETRIEVE_K = 3

# A "metric" = any signal of a measurable outcome: a digit, percentage, currency,
# magnitude word, or a time span. Drives the no-fabrication guard.
_METRIC_RE = re.compile(
    r"""(
          \d                                                   # any digit
        | %                                                    # percent
        | [₹$€£]                                                # currency symbol
        | \b(?:k|m|bn|mn)\b                                     # 5k, 3m, 2bn
        | \b(?:thousand|million|billion|lakh|lakhs|crore|crores)\b
        | \b(?:hours?|days?|weeks?|months?|quarters?|years?)\b  # time spans
    )""",
    re.IGNORECASE | re.VERBOSE,
)


def has_metric(text: str) -> bool:
    """True if the bullet already states a measurable result."""
    return bool(_METRIC_RE.search(text or ""))


def should_ask_for_metric(bullet: str, metric: str | None) -> bool:
    """No-fabrication guard: ask for a number when the bullet lacks one AND the
    user has not already supplied a metric to fold in."""
    if metric and metric.strip():
        return False
    return not has_metric(bullet)


def metric_question(bullet: str) -> str:  # noqa: ARG001 — bullet kept for future tailoring
    return (
        "This bullet has no measurable result. What was the real impact — "
        "a %, a ₹/$ amount, time saved, users reached, or team size? "
        "Myro won't invent a number — tell me the real one and I'll work it in."
    )


# Invariant guardrails — true regardless of which playbook rules are retrieved.
# Structural + the no-fabrication law; never style-overridable.
_GUARDRAILS = (
    "You are a sharp senior recruiter and CV editor. You rewrite ONE résumé bullet "
    "to be stronger and ATS-friendly. Unbreakable rules: keep it to ONE line "
    "(max ~30 words); start with a strong past-tense action verb; NEVER invent "
    "numbers, employers, titles, dates, or achievements; weave in a target keyword "
    "ONLY if it is genuinely implied by the original — never keyword-stuff. Output "
    "ONLY the rewritten bullet: no quotes, no preamble, no explanation."
)

# Fallback style guidance when retrieval returns nothing (RAG down / empty corpus).
_STATIC_STYLE = (
    "Apply the Google XYZ formula: 'Accomplished X, measured by Y, by doing Z'."
)


def _grounding_block(passages: list) -> str:
    """Turn retrieved playbook passages into a cited guidance block for the prompt."""
    lines = [f"- {p.chunk_text}  (source: {p.source_title})" for p in passages]
    return "Ground your rewrite in these authored CV-playbook rules:\n" + "\n".join(lines)


def _build_messages(
    bullet: str,
    role: str | None,
    missing_keywords: list[str],
    metric: str | None,
    passages: list | None = None,
) -> list[dict[str, str]]:
    guidance = _grounding_block(passages) if passages else _STATIC_STYLE
    system = f"{_GUARDRAILS}\n\n{guidance}"
    parts = [f"Original bullet:\n{bullet.strip()}"]
    if role:
        parts.append(f"Role context: {role.strip()}")
    if metric and metric.strip():
        parts.append(f"Real measurable result to incorporate truthfully: {metric.strip()}")
    if missing_keywords:
        kept = ", ".join(k for k in missing_keywords[:6] if k.strip())
        if kept:
            parts.append(f"Target keywords to weave in ONLY if truthful: {kept}")
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n\n".join(parts)},
    ]


async def suggest_rewrite(
    bullet: str,
    role: str | None,
    missing_keywords: list[str] | None,
    metric: str | None,
    provider: LLMProvider | None,
    allow_no_metric: bool = False,
) -> dict:
    """Return one of:
      {"mode": "question", "question": str}                      — no-fab guard fired
      {"mode": "rewrite", "rewritten_text": str, "rationale": str}
      {"mode": "error", "rationale": str}                        — provider unavailable

    ``allow_no_metric`` = the user explicitly chose to rewrite without a number;
    we then reframe qualitatively (ADR-0016) instead of asking again.
    """
    bullet = (bullet or "").strip()
    missing_keywords = missing_keywords or []
    if not bullet:
        return {"mode": "error", "rationale": "Nothing to rewrite."}

    if not allow_no_metric and should_ask_for_metric(bullet, metric):
        return {"mode": "question", "question": metric_question(bullet)}

    if provider is None:
        return {"mode": "error", "rationale": "Rewrite is unavailable right now."}

    # #32: ground in the authored CV playbook. retrieve() is fail-soft → [] on any
    # error, in which case _build_messages uses the static style rule.
    query = " ".join(p for p in [bullet, role or "", " ".join(missing_keywords)] if p).strip()
    passages = await mentor_retriever.retrieve(query, shelf="cv", k=_RETRIEVE_K)

    messages = _build_messages(bullet, role, missing_keywords, metric, passages)
    try:
        raw = await provider.complete(messages, max_tokens=_MAX_TOKENS)
    except LLMProviderError:
        logger.info("cv_rewrite: all providers failed (bullet len=%d)", len(bullet))
        return {"mode": "error", "rationale": "Rewrite is unavailable right now."}

    text = (raw or "").strip().strip('"').strip()
    if not text:
        return {"mode": "error", "rationale": "No rewrite produced."}

    # De-duped source titles, preserving retrieval order, for the UI citation chip.
    citations: list[str] = list(dict.fromkeys(p.source_title for p in passages))
    used = [k for k in missing_keywords if k.strip() and k.lower() in text.lower()]
    rationale = ("Worked in: " + ", ".join(used)) if used else "Tightened with the XYZ formula."
    return {
        "mode": "rewrite",
        "rewritten_text": text,
        "rationale": rationale,
        "citations": citations,
    }
