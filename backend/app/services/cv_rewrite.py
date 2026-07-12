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

from app.services import memory_recall, mentor_retriever
from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

MAX_TOKENS = 220

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


# ── no-DELETION guard (mirror of no-fabrication) ─────────────────────────────
# A rewrite must never carry FEWER real numbers than the source ("over 50" →
# "numerous" is a regression, not a rewrite). We extract every numeric token
# from the source and require each to survive into the rewrite.

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


async def prepare_rewrite(
    bullet: str,
    role: str | None,
    missing_keywords: list[str] | None,
    metric: str | None,
    *,
    allow_no_metric: bool = False,
    user_id: str | None = None,
) -> dict:
    """Resolve everything that must happen BEFORE any token streams, so a caller
    knows whether this turn is a question, an error, or a real rewrite — and (if
    a rewrite) hands back the prompt + retrieved passages to stream against.

    Returns one of:
      {"mode": "question", "question": str}              — no-fab guard fired (no LLM)
      {"mode": "error", "rationale": str}                — nothing to rewrite
      {"mode": "stream", "messages": [...],
       "passages": [...], "missing_keywords": [...]}     — proceed to stream

    Split out of ``suggest_rewrite`` (which still composes prepare→complete→
    finalize) so the streaming endpoint can emit the question immediately and
    only open a token stream when there is prose to type. The question branch is
    fully deterministic (``should_ask_for_metric``) — never an LLM round-trip.
    """
    bullet = (bullet or "").strip()
    missing_keywords = missing_keywords or []
    if not bullet:
        return {"mode": "error", "rationale": "Nothing to rewrite."}

    if not allow_no_metric and should_ask_for_metric(bullet, metric):
        return {"mode": "question", "question": metric_question(bullet)}

    # #32: ground in the authored CV playbook. retrieve() is fail-soft → [] on any
    # error, in which case _build_messages uses the static style rule.
    query = " ".join(p for p in [bullet, role or "", " ".join(missing_keywords)] if p).strip()
    passages = await mentor_retriever.retrieve(query, shelf="cv", k=_RETRIEVE_K)

    # Career Memory: ground the rewrite in the user's OWN verified stories, so
    # specifics come from their real history, not model imagination. Fail-soft.
    story_block = ""
    if user_id:
        story_hits = await memory_recall.recall_stories(user_id, query, k=3)
        story_block = memory_recall.story_grounding_block(story_hits)

    messages = _build_messages(bullet, role, missing_keywords, metric, passages)
    if story_block:
        messages[-1] = {**messages[-1], "content": messages[-1]["content"] + "\n\n" + story_block}

    return {
        "mode": "stream",
        "messages": messages,
        "passages": passages,
        "missing_keywords": missing_keywords,
    }


# Meta phrases a chain-of-thought leak contains but a real bullet never does.
_REASONING_MARKERS = re.compile(
    r"\b(we need to|let'?s craft|let'?s|must be|perhaps|the bullet|rewrite one|"
    r"we can (?:include|weave)|max ~?\d+ words|xyz formula)\b",
    re.IGNORECASE,
)
# A quoted candidate inside a longer blob — the model's actual final answer.
_QUOTED_RE = re.compile(r"[\"'“”‘’]([^\"'“”‘’]{12,})[\"'“”‘’]")


def _extract_bullet(raw: str) -> str:
    """Pull the finished bullet out of a completion. Normally the model returns
    just the line; but a weak model can leak reasoning ("We need to rewrite …
    Let's craft: 'Generated €500K+ …'"). When the raw reads like reasoning, take
    the last quoted candidate (the model's actual answer) instead of the ramble."""
    text = (raw or "").strip()
    if _REASONING_MARKERS.search(text) or "\n" in text:
        quoted = _QUOTED_RE.findall(text)
        if quoted:
            return quoted[-1].strip()
        # No quote to rescue — fall back to the last non-empty line.
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        if lines:
            text = lines[-1]
    return text.strip().strip('"').strip("'").strip()


def finalize_rewrite(text: str, passages: list, missing_keywords: list[str], source_bullet: str = "") -> dict:
    """Turn the fully-streamed (or fully-completed) rewrite text into the terminal
    payload: the cleaned text, a rationale, and the de-duped citation titles.
    Pure — no I/O — so it runs identically after a blocking complete() or a token
    stream. Returns ``{"mode": "error", ...}`` if the model produced nothing or
    (no-DELETION guard) dropped real numbers the source stated."""
    text = _extract_bullet(text)
    if not text:
        return {"mode": "error", "rationale": "No rewrite produced."}
    if source_bullet and loses_metrics(source_bullet, text):
        return {
            "mode": "error",
            "rationale": "The rewrite dropped real numbers from your bullet — kept your original.",
        }

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


async def suggest_rewrite(
    bullet: str,
    role: str | None,
    missing_keywords: list[str] | None,
    metric: str | None,
    provider: LLMProvider | None,
    allow_no_metric: bool = False,
    user_id: str | None = None,
) -> dict:
    """Blocking rewrite (one shot, no streaming). Returns one of:
      {"mode": "question", "question": str}                      — no-fab guard fired
      {"mode": "rewrite", "rewritten_text": str, "rationale": str}
      {"mode": "error", "rationale": str}                        — provider unavailable

    ``allow_no_metric`` = the user explicitly chose to rewrite without a number;
    we then reframe qualitatively (ADR-0016) instead of asking again. Composed
    from ``prepare_rewrite`` + ``finalize_rewrite`` — the streaming endpoint
    shares the exact same two halves, only with a token stream in between.
    """
    plan = await prepare_rewrite(
        bullet, role, missing_keywords, metric,
        allow_no_metric=allow_no_metric, user_id=user_id,
    )
    if plan["mode"] != "stream":
        return plan

    if provider is None:
        return {"mode": "error", "rationale": "Rewrite is unavailable right now."}

    try:
        raw = await provider.complete(plan["messages"], max_tokens=MAX_TOKENS)
    except LLMProviderError:
        logger.info("cv_rewrite: all providers failed (bullet len=%d)", len((bullet or "").strip()))
        return {"mode": "error", "rationale": "Rewrite is unavailable right now."}

    return finalize_rewrite(raw, plan["passages"], plan["missing_keywords"], source_bullet=bullet)


# ─── 3-angle variants (pick-a-version) ───────────────────────────────────────
#
# Instead of one rewrite, offer three framings of the SAME real facts so the user
# picks the story that fits: metric-led, impact-led, scope-led. Same unbreakable
# guardrails (one line, strong verb, NEVER invent numbers) — only the emphasis
# differs. One LLM round-trip returns all three (tagged), so it's no slower than a
# single rewrite. The no-fabrication question branch is shared verbatim via
# prepare_rewrite, so a metric-less bullet still asks for the real number first.

VARIANTS_MAX_TOKENS = 380

# (angle, label, emphasis) — the label is what the UI tab shows.
_ANGLES: list[tuple[str, str, str]] = [
    ("metric", "Metric-led",
     "Lead with the measurable result — a number, %, ₹/$ amount, time saved, or scale. "
     "Use ONLY figures already present in the bullet or supplied by the user; never invent one."),
    ("impact", "Impact-led",
     "Lead with the business impact — what changed for the team, product, or customer as a result."),
    ("scope", "Scope-led",
     "Lead with the scope and scale — the systems, breadth, stakeholders, or complexity owned."),
]

_TAGS = {"metric": "[METRIC]", "impact": "[IMPACT]", "scope": "[SCOPE]"}


def _variants_instruction() -> str:
    angle_lines = "\n".join(f"{_TAGS[a]} {desc}" for a, _, desc in _ANGLES)
    return (
        "Produce THREE alternative rewrites of the SAME bullet, one per angle below. "
        "All three describe the SAME real facts — only the emphasis differs, and every "
        "rule above still applies to each line (one line, strong verb, no invented "
        "numbers). Angles:\n"
        f"{angle_lines}\n\n"
        "Output EXACTLY three lines, each starting with its tag and nothing else:\n"
        "[METRIC] <rewrite>\n[IMPACT] <rewrite>\n[SCOPE] <rewrite>"
    )


def _parse_variants(raw: str) -> list[dict[str, str]]:
    """Pull the tagged lines back out. Tolerant of extra prose / blank lines."""
    out: list[dict[str, str]] = []
    for angle, label, _ in _ANGLES:
        m = re.search(rf"{re.escape(_TAGS[angle])}\s*(.+)", raw or "")
        if not m:
            continue
        text = m.group(1).strip().strip('"').strip()
        if text:
            out.append({"angle": angle, "label": label, "text": text})
    return out


async def suggest_rewrite_variants(
    bullet: str,
    role: str | None,
    missing_keywords: list[str] | None,
    metric: str | None,
    provider: LLMProvider | None,
    allow_no_metric: bool = False,
    user_id: str | None = None,
) -> dict:
    """Blocking 3-angle rewrite. Returns one of:
      {"mode": "question", "question": str}                 — no-fab guard fired
      {"mode": "variants", "variants": [{angle,label,text}], "citations": [...]}
      {"mode": "error", "rationale": str}                   — provider/parse failure

    Shares the no-fabrication question branch with ``suggest_rewrite`` (via
    ``prepare_rewrite``), so a metric-less bullet is still asked for the real
    number before any variants are produced.
    """
    plan = await prepare_rewrite(
        bullet, role, missing_keywords, metric,
        allow_no_metric=allow_no_metric, user_id=user_id,
    )
    if plan["mode"] != "stream":
        return plan

    if provider is None:
        return {"mode": "error", "rationale": "Rewrite is unavailable right now."}

    messages = list(plan["messages"])
    # Append the 3-angle instruction to the user turn (guardrails stay in system).
    messages[-1] = {**messages[-1], "content": messages[-1]["content"] + "\n\n" + _variants_instruction()}

    try:
        raw = await provider.complete(messages, max_tokens=VARIANTS_MAX_TOKENS)
    except LLMProviderError:
        logger.info("cv_rewrite: variants providers failed (bullet len=%d)", len((bullet or "").strip()))
        return {"mode": "error", "rationale": "Rewrite is unavailable right now."}

    variants = _parse_variants(raw)
    if not variants:
        # Model ignored the tag format — fall back to a single rewrite so the user
        # still gets a suggestion rather than an error.
        single = finalize_rewrite(raw, plan["passages"], plan["missing_keywords"], source_bullet=bullet)
        if single["mode"] == "rewrite":
            return {
                "mode": "variants",
                "variants": [{"angle": "metric", "label": "Suggested", "text": single["rewritten_text"]}],
                "citations": single["citations"],
            }
        return {"mode": "error", "rationale": single.get("rationale") or "No rewrite produced."}

    # No-DELETION guard: a version that dropped the source's real numbers is not
    # a valid framing of the same facts — filter it, never show it.
    variants = [v for v in variants if not loses_metrics(bullet, v["text"])]
    if not variants:
        return {
            "mode": "error",
            "rationale": "Every rewrite dropped real numbers from your bullet — kept your original.",
        }

    citations: list[str] = list(dict.fromkeys(p.source_title for p in plan["passages"]))
    return {"mode": "variants", "variants": variants, "citations": citations}
