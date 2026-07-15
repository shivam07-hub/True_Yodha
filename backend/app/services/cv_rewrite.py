"""Per-bullet AI rewrite — Myro Mentor, the CV core loop.

Proposes a stronger, JD-aligned rewrite of a single CV bullet. Two things make a
Myro rewrite better than "paste into ChatGPT", and both live in `mentor_grounding`:
the authored CV playbook (STAR/XYZ/ATS — the *method*, applied silently) and the
user's OWN verified career stories (the truthful raw material). The method is never
shown to the user — they only care whether the line is the best it can be; grounding
is how we get there, not what we sell.

Model floor (owned here, not passed by callers): every writing call resolves
`get_writer_provider()` — the strong-only, paid-first lane. A small model truncates a
rich bullet into a fragment instead of synthesizing it (the exact regression that
broke trust). Rewriting is a judgment-grade generation, so it is floored the same way
ranking is (`feedback_no_cheap_models_judgment`). The `provider` arg is a test-only
override; no caller can lower the floor.

No-fabrication law (ADR-0016, blocking): if the bullet states no measurable result
and the user has not supplied one, we DO NOT invent a number. First we look in the
user's OWN stories for a real one and offer it with provenance (`suggest_metric`); if
there is none, we ask (`question`). No-DELETION mirror: a rewrite that drops a real
number the source stated is rejected — a rewrite must never come out weaker.

Callers: POST /cv/rewrite-bullet[/variants|/stream] — see routers/cv/skill_edit.py.
"""
from __future__ import annotations

import logging
import re

from app.services import mentor_grounding
from app.services.llm_provider import LLMProvider, LLMProviderError, get_writer_provider

logger = logging.getLogger(__name__)

MAX_TOKENS = 220


def has_metric(text: str) -> bool:
    """True if the bullet already states a measurable result (digit, %, currency,
    magnitude word, or a time span)."""
    return bool(_METRIC_RE.search(text or ""))


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


def should_ask_for_metric(bullet: str, metric: str | None) -> bool:
    """No-fabrication guard: seek a number when the bullet lacks one AND the user
    has not already supplied one to fold in."""
    if metric and metric.strip():
        return False
    return not has_metric(bullet)


def metric_question(bullet: str) -> str:  # noqa: ARG001 — bullet kept for future tailoring
    return (
        "This line has no measurable result. What was the real impact — "
        "a %, a ₹/$ amount, time saved, users reached, or team size? "
        "Myro won't invent a number — tell me the real one and I'll work it in."
    )


# ── no-DELETION guard (mirror of no-fabrication) ─────────────────────────────
# A rewrite must never carry FEWER real numbers than the source ("over 50" →
# "numerous" is a regression, not a rewrite). Extract every numeric token from the
# source and require each to survive into the rewrite.

_NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?\s*(k|m|bn|mn|lakh|crore)?", re.IGNORECASE)

_SUFFIX_MULT = {"k": 1_000, "m": 1_000_000, "mn": 1_000_000, "bn": 1_000_000_000,
                "lakh": 100_000, "crore": 10_000_000}


def _numbers_in(text: str) -> set[str]:
    """Canonical numeric tokens in a bullet ('30,000' == '30k' == '30000')."""
    out: set[str] = set()
    for m in _NUM_RE.finditer(text or ""):
        raw = m.group(0).lower().replace(",", "").strip()
        suffix = (m.group(1) or "").lower()
        num_part = raw[: len(raw) - len(suffix)].strip() if suffix else raw
        try:
            value = float(num_part) * _SUFFIX_MULT.get(suffix, 1)
        except ValueError:
            continue
        out.add(f"{value:g}")
    return out


def loses_metrics(source: str, rewrite: str) -> bool:
    """True when the source states numbers the rewrite dropped."""
    src = _numbers_in(source)
    return bool(src) and not src <= _numbers_in(rewrite)


# Invariant guardrails — true regardless of which playbook rules are retrieved.
# Structural + the no-fabrication law + the no-substance-loss law (Q9). Never
# style-overridable.
_GUARDRAILS = (
    "You are a sharp senior recruiter and CV editor. You rewrite ONE résumé bullet "
    "to be stronger and ATS-friendly. Unbreakable rules:\n"
    "- ONE line (max ~30 words); start with a strong past-tense action verb.\n"
    "- NEVER invent numbers, employers, titles, dates, or achievements.\n"
    "- NEVER drop the concrete specifics the original states — named tools, systems, "
    "clients, domains, scope, or scale. Tighten the LANGUAGE, never the substance; a "
    "rewrite that is vaguer than the original is a failure, not an improvement.\n"
    "- Weave in a target keyword ONLY if genuinely implied by the original — never "
    "keyword-stuff.\n"
    "Output ONLY the rewritten bullet: no quotes, no preamble, no explanation."
)

# Fallback style guidance when grounding returns nothing (RAG down / empty corpus).
_STATIC_STYLE = (
    "Apply a proven CV formula: STAR (Situation, Task, Action, Result) or the Google "
    "XYZ form 'Accomplished X, measured by Y, by doing Z'. Lead with the result."
)


def _build_messages(
    bullet: str,
    role: str | None,
    missing_keywords: list[str],
    metric: str | None,
    grounding: mentor_grounding.MentorGrounding | None = None,
) -> list[dict[str, str]]:
    guidance = grounding.prompt_block() if (grounding and grounding.has_grounding()) else _STATIC_STYLE
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


async def prepare_rewrite(
    bullet: str,
    role: str | None,
    missing_keywords: list[str] | None,
    metric: str | None,
    *,
    allow_no_metric: bool = False,
    user_id: str | None = None,
) -> dict:
    """Resolve everything that must happen BEFORE any token streams — whether this
    turn is a question, a reservoir-number suggestion, an error, or a real rewrite.

    Returns one of:
      {"mode": "question", "question": str}
      {"mode": "suggest_metric", "candidate_value": str,
       "candidate_source": str, "question": str}   — a real number from the user's stories
      {"mode": "error", "rationale": str}
      {"mode": "stream", "messages": [...], "grounding": MentorGrounding,
       "missing_keywords": [...]}                   — proceed to stream

    Grounding is assembled up front (one seam, `mentor_grounding.assemble`) so the
    no-fabrication branch can offer the user's OWN number before asking for one.
    """
    bullet = (bullet or "").strip()
    missing_keywords = missing_keywords or []
    if not bullet:
        return {"mode": "error", "rationale": "Nothing to rewrite."}

    # One grounding seam for the whole turn: playbook method + the user's real
    # stories + candidate numbers. Fail-soft — [] on any error, static rule used then.
    query = " ".join(p for p in [bullet, role or "", " ".join(missing_keywords)] if p).strip()
    grounding = await mentor_grounding.assemble(query, user_id=user_id)

    if not allow_no_metric and should_ask_for_metric(bullet, metric):
        # Reservoir-first (Q5): a real number in the user's own stories beats a blank
        # ask — offer it with provenance; the user confirms before it lands.
        if grounding.candidate_metrics:
            cand = grounding.candidate_metrics[0]
            return {
                "mode": "suggest_metric",
                "candidate_value": cand.value,
                "candidate_source": cand.story_title,
                "question": (
                    f"Your story “{cand.story_title}” mentions {cand.value}. "
                    "Want me to work that in — or give me a different number?"
                ),
            }
        return {"mode": "question", "question": metric_question(bullet)}

    messages = _build_messages(bullet, role, missing_keywords, metric, grounding)
    return {
        "mode": "stream",
        "messages": messages,
        "grounding": grounding,
        "missing_keywords": missing_keywords,
    }


# Meta phrases a chain-of-thought leak contains but a real bullet never does.
_REASONING_MARKERS = re.compile(
    r"\b(we need to|let'?s craft|let'?s|must be|perhaps|the bullet|rewrite one|"
    r"we can (?:include|weave)|max ~?\d+ words|xyz formula)\b",
    re.IGNORECASE,
)
_QUOTED_RE = re.compile(r"[\"'“”‘’]([^\"'“”‘’]{12,})[\"'“”‘’]")


def _extract_bullet(raw: str) -> str:
    """Pull the finished bullet out of a completion. Normally the model returns just
    the line; a weak model can leak reasoning — take the last quoted candidate."""
    text = (raw or "").strip()
    if _REASONING_MARKERS.search(text) or "\n" in text:
        quoted = _QUOTED_RE.findall(text)
        if quoted:
            return quoted[-1].strip()
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        if lines:
            text = lines[-1]
    return text.strip().strip('"').strip("'").strip()


def finalize_rewrite(
    text: str,
    grounding: mentor_grounding.MentorGrounding | None,
    missing_keywords: list[str],
    source_bullet: str = "",
) -> dict:
    """Turn the fully-streamed (or completed) rewrite text into the terminal payload:
    the cleaned line, a user-outcome rationale, and the internal citation record. Pure
    — no I/O. Returns ``{"mode": "error", ...}`` if the model produced nothing or (no-
    DELETION guard) dropped real numbers the source stated."""
    text = _extract_bullet(text)
    if not text:
        return {"mode": "error", "rationale": "No rewrite produced."}
    if source_bullet and loses_metrics(source_bullet, text):
        return {
            "mode": "error",
            "rationale": "The rewrite dropped real numbers from your line — kept your original.",
        }
    used = [k for k in missing_keywords if k.strip() and k.lower() in text.lower()]
    # User-outcome wording (not "tightened with XYZ" — method is invisible to the user).
    rationale = ("Now names " + ", ".join(used)) if used else "Leads with the result recruiters scan for."
    citations = grounding.citations() if grounding else []
    return {
        "mode": "rewrite",
        "rewritten_text": text,
        "rationale": rationale,
        "citations": citations,
    }


async def suggest_rewrite(
    bullet: str,
    role: str | None,
    missing_keywords: list[str] | None,
    metric: str | None,
    provider: LLMProvider | None = None,
    allow_no_metric: bool = False,
    user_id: str | None = None,
) -> dict:
    """Blocking single rewrite. `provider` is a TEST-ONLY override — production
    resolves the writer floor internally. Returns question / suggest_metric / rewrite
    / error (see ``prepare_rewrite`` + ``finalize_rewrite``)."""
    plan = await prepare_rewrite(
        bullet, role, missing_keywords, metric,
        allow_no_metric=allow_no_metric, user_id=user_id,
    )
    if plan["mode"] != "stream":
        return plan

    provider = provider or get_writer_provider()
    try:
        raw = await provider.complete(plan["messages"], max_tokens=MAX_TOKENS)
    except LLMProviderError:
        logger.info("cv_rewrite: all providers failed (bullet len=%d)", len((bullet or "").strip()))
        return {"mode": "error", "rationale": "Rewrite is unavailable right now."}

    return finalize_rewrite(raw, plan["grounding"], plan["missing_keywords"], source_bullet=bullet)


# ─── recommended + alternates (was: 3 equal tabs) ────────────────────────────
#
# The Mentor has an opinion: it returns the framings of the SAME real facts ORDERED
# strongest-first for this bullet, each with a one-line plain-language reason it wins
# (user-outcome terms — "leads with the 40% result", never "uses the XYZ formula").
# The frontend leads with variants[0] (the recommendation) and tucks the rest behind
# "other angles". Same unbreakable guardrails; one LLM round-trip returns all three.

VARIANTS_MAX_TOKENS = 420

# (angle, label, emphasis). label = the small chip shown on an alternate.
_ANGLES: list[tuple[str, str, str]] = [
    ("metric", "Metric-led",
     "Lead with the measurable result — a number, %, ₹/$ amount, time saved, or scale. "
     "Use ONLY figures already present or supplied; never invent one."),
    ("impact", "Impact-led",
     "Lead with the business impact — what changed for the team, product, or customer."),
    ("scope", "Scope-led",
     "Lead with the scope and scale — the systems, breadth, stakeholders, or complexity owned."),
]

_TAGS = {"metric": "[METRIC]", "impact": "[IMPACT]", "scope": "[SCOPE]"}
_LABELS = {a: label for a, label, _ in _ANGLES}
_TAG_LINE_RE = re.compile(r"\[(METRIC|IMPACT|SCOPE)\]\s*(.+)", re.IGNORECASE)


def _variants_instruction() -> str:
    angle_lines = "\n".join(f"{_TAGS[a]} {desc}" for a, _, desc in _ANGLES)
    return (
        "Produce THREE alternative rewrites of the SAME bullet, one per angle below. "
        "All three describe the SAME real facts — only the emphasis differs, and every "
        "rule above still applies to each line.\n"
        "ORDER them STRONGEST-FIRST for this specific bullet (put the angle that makes "
        "the best résumé line at the top — that is your recommendation).\n"
        "For each, add a SHORT reason (max 9 words) in plain candidate-facing terms — "
        "what it does for THEM (e.g. 'leads with the 40% result recruiters scan for'). "
        "Never mention formulas, STAR, XYZ, or ATS in the reason.\n"
        "Angles:\n"
        f"{angle_lines}\n\n"
        "Output EXACTLY three lines, strongest first, each: TAG <rewrite> || <reason>\n"
        "[METRIC|IMPACT|SCOPE] <rewrite> || <reason>"
    )


def _parse_variants(raw: str) -> list[dict[str, str]]:
    """Pull tagged lines back out IN EMITTED ORDER (strongest-first), each with its
    plain-language reason. Tolerant of extra prose, missing reasons, blank lines."""
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for line in (raw or "").splitlines():
        m = _TAG_LINE_RE.search(line)
        if not m:
            continue
        angle = m.group(1).lower()
        if angle in seen:
            continue
        body = m.group(2).strip()
        text, _, why = body.partition("||")
        text = text.strip().strip('"').strip()
        why = why.strip().strip('"').strip()
        if not text:
            continue
        seen.add(angle)
        out.append({"angle": angle, "label": _LABELS.get(angle, "Alternate"), "text": text, "why": why})
    return out


async def suggest_rewrite_variants(
    bullet: str,
    role: str | None,
    missing_keywords: list[str] | None,
    metric: str | None,
    provider: LLMProvider | None = None,
    allow_no_metric: bool = False,
    user_id: str | None = None,
) -> dict:
    """Blocking recommended+alternates rewrite. `provider` is a TEST-ONLY override.
    Returns one of:
      {"mode": "question", ...} / {"mode": "suggest_metric", ...}
      {"mode": "variants", "variants": [{angle,label,text,why}], "citations": [...]}
          — variants[0] is the Mentor's recommendation (strongest-first).
      {"mode": "error", "rationale": str}
    """
    plan = await prepare_rewrite(
        bullet, role, missing_keywords, metric,
        allow_no_metric=allow_no_metric, user_id=user_id,
    )
    if plan["mode"] != "stream":
        return plan

    provider = provider or get_writer_provider()
    messages = list(plan["messages"])
    messages[-1] = {**messages[-1], "content": messages[-1]["content"] + "\n\n" + _variants_instruction()}

    try:
        raw = await provider.complete(messages, max_tokens=VARIANTS_MAX_TOKENS)
    except LLMProviderError:
        logger.info("cv_rewrite: variants providers failed (bullet len=%d)", len((bullet or "").strip()))
        return {"mode": "error", "rationale": "Rewrite is unavailable right now."}

    grounding = plan["grounding"]
    citations = grounding.citations() if grounding else []
    variants = _parse_variants(raw)
    if not variants:
        # Model ignored the tag format — fall back to a single rewrite so the user
        # still gets a recommendation rather than an error.
        single = finalize_rewrite(raw, grounding, plan["missing_keywords"], source_bullet=bullet)
        if single["mode"] == "rewrite":
            return {
                "mode": "variants",
                "variants": [{"angle": "metric", "label": "Suggested",
                              "text": single["rewritten_text"], "why": single["rationale"]}],
                "citations": citations,
            }
        return {"mode": "error", "rationale": single.get("rationale") or "No rewrite produced."}

    # No-DELETION guard: a version that dropped the source's real numbers is not a
    # valid framing of the same facts — filter it, never show it.
    variants = [v for v in variants if not loses_metrics(bullet, v["text"])]
    if not variants:
        return {
            "mode": "error",
            "rationale": "Every rewrite dropped real numbers from your line — kept your original.",
        }

    return {"mode": "variants", "variants": variants, "citations": citations}
