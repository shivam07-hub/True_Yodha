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

MAX_TOKENS = 300


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


def gains_foreign_numbers(source: str, rewrite: str, allowed_text: str = "") -> bool:
    """True when the rewrite INTRODUCES numbers absent from the source (and from the
    user-supplied metric / target keywords). The other half of the no-fabrication
    law: a rewrite may reuse the user's figures, never mint new ones — including
    figures copied out of a prompt example."""
    allowed = _numbers_in(source) | _numbers_in(allowed_text)
    return not _numbers_in(rewrite) <= allowed


# ── substance guard (the Capgemini regression, 2026-07-16) ───────────────────
# The numbers guard let "Delivered €500K+ revenue … for GCC clients … cross-BU pitch
# for Life Sciences, Energy, and Aerospace" collapse to "Generated €500K+ revenue by
# shaping India Cloud B2B GTM strategy" — number kept, substance gone. Prompt
# discipline alone did not hold, so the specifics get a structural floor too: every
# NAMED entity in the source (capitalized words/acronyms — clients, markets, domains,
# products) must survive into the rewrite, or the version is filtered exactly like a
# dropped number. Un-capitalized specifics stay prompt-enforced; entities are the
# hard floor because losing a named client/domain is never "tightening".

_TOKEN_RE = re.compile(r"[A-Za-z0-9][\w&+/-]*")


def _entities_in(text: str) -> set[str]:
    """Named specifics in a bullet: capitalized words (excluding each sentence's
    opening verb — grammar, not a name), acronyms (GCC, MNCs, KPIs) and mixed
    alphanumerics (B2B). Lowercased, plural 's' stripped, so 'MNCs' matches 'MNC'."""
    ents: set[str] = set()
    for sentence in re.split(r"[.!?]+\s+", text or ""):
        for i, tok in enumerate(_TOKEN_RE.findall(sentence)):
            is_acronym = tok.isupper() and len(tok) >= 2
            has_upper_tail = any(c.isupper() for c in tok[1:])
            if i == 0 and not (is_acronym or has_upper_tail):
                continue  # sentence-initial capital ("Delivered", "Reduced") is grammar
            if tok[0].isupper() or is_acronym or has_upper_tail:
                ent = tok.lower()
                if len(ent) > 3:
                    ent = ent.rstrip("s")
                ents.add(ent)
    return ents


def loses_substance(source: str, rewrite: str) -> bool:
    """True when the source names entities the rewrite dropped."""
    hay = (rewrite or "").lower()
    return any(ent not in hay for ent in _entities_in(source))


def dropped_specifics(source: str, rewrite: str) -> list[str]:
    """The receipts for an eyes-open substance-loss card: display-cased named
    entities and raw number tokens present in `source` but missing from `rewrite`,
    in source order, de-duplicated. Mirrors loses_substance / loses_metrics, but
    returns WHAT was lost — so Mentor can name the cost ("I'd drop the Capgemini
    detail") instead of a vague warning the user can't verify."""
    hay = (rewrite or "").lower()
    missing_ents = {ent for ent in _entities_in(source) if ent not in hay}
    out: list[str] = []
    seen: set[str] = set()
    for tok in _TOKEN_RE.findall(source):
        norm = tok.lower()
        if len(norm) > 3:
            norm = norm.rstrip("s")
        if norm in missing_ents and norm not in seen:
            seen.add(norm)
            out.append(tok)
    missing_nums = _numbers_in(source) - _numbers_in(rewrite)
    if missing_nums:
        for m in _NUM_RE.finditer(source):
            raw = m.group(0).strip()
            if raw and _numbers_in(raw) <= missing_nums and raw not in seen:
                seen.add(raw)
                out.append(raw)
    return out


# Invariant guardrails — true regardless of which playbook rules are retrieved.
# Structural + the no-fabrication law + the no-substance-loss law (Q9). Never
# style-overridable. NO hard word cap: a cap the original already exceeds makes the
# model obey the number by deleting clauses — the exact truncation this exists to
# prevent. Length guidance is relative to the original instead.
_GUARDRAILS = (
    "You are a sharp senior recruiter and CV editor. You rewrite ONE résumé bullet "
    "to be stronger and ATS-friendly. Unbreakable rules:\n"
    "- ONE line, tight and readable. Aim for 20–35 words; a rich original may take "
    "~40. NEVER solve length by deleting content — compress connectors, articles and "
    "filler, never facts. The rewrite must carry EVERYTHING the original states.\n"
    "- Start with a strong past-tense action verb.\n"
    "- NEVER invent numbers, employers, titles, dates, or achievements — and never "
    "copy any figure or fact from the example below into your rewrite.\n"
    "- EVERY concrete specific in the original MUST survive: named clients and "
    "markets, products, technologies, domains, org units, team/scope words, and time "
    "context. A rewrite that is vaguer or thinner than the original is a FAILURE, "
    "not an improvement.\n"
    "- Example of the standard. Original: 'Delivered €500K+ revenue last year by "
    "shaping India Cloud B2B GTM strategy for GCC clients, aligning India insights "
    "with global MNCs through targeted personal meetings, and delivering a cross-BU "
    "pitch for Life Sciences, Energy, and Aerospace clients.' GOOD rewrite: "
    "'Delivered €500K+ revenue in a year by shaping India Cloud B2B GTM strategy for "
    "GCC clients — aligning India insights with global MNCs and pitching cross-BU "
    "wins across Life Sciences, Energy, and Aerospace.' BAD rewrite (substance "
    "loss — forbidden): 'Generated €500K+ revenue by shaping India Cloud B2B GTM "
    "strategy.'\n"
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

# A variant tag the model may emit with or without brackets ("[SCOPE]" / "SCOPE").
# Stripped at EVERY exit — a tag or a "|| why" tail must never reach the CV artifact
# (live leak 2026-07-16: "SCOPE Led platform transformation … || Highlights system
# scope" rendered as the suggested line).
_TAG_PREFIX_RE = re.compile(r"^\s*\[?\s*(?:METRIC|IMPACT|SCOPE)\s*\]?\s*[:\-–]?\s+", re.IGNORECASE)
_UNRESOLVED_TEMPLATE_TOKEN_RE = re.compile(r"<\s*(?:rewrite|reason)\s*>", re.IGNORECASE)


def _strip_variant_markup(text: str) -> str:
    """Remove a leading angle tag and a trailing '|| reason' from a line."""
    text = _TAG_PREFIX_RE.sub("", (text or "").strip())
    return text.split("||")[0].strip().strip('"').strip("'").strip()


def _extract_bullet(raw: str) -> str:
    """Pull the finished bullet out of a completion. Normally the model returns just
    the line; a weak model can leak reasoning — take the last quoted candidate. Any
    variant markup (tags, '|| why') is stripped so it can never ship."""
    text = (raw or "").strip()
    if _REASONING_MARKERS.search(text) or "\n" in text:
        quoted = _QUOTED_RE.findall(text)
        if quoted:
            return _strip_variant_markup(quoted[-1])
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        if lines:
            text = lines[-1]
    return _strip_variant_markup(text)


def clean_bullet_output(raw: str) -> str | None:
    """Extract + validate a single bullet from raw model output. Shared by
    finalize_rewrite and any other single-bullet completion (e.g. cv_merge) so
    the leaked-reasoning salvage and unresolved-template-token guard live once.
    Returns None when the output is empty or still carries a template token."""
    text = _extract_bullet(raw)
    if not text or _UNRESOLVED_TEMPLATE_TOKEN_RE.search(text):
        return None
    return text


def finalize_rewrite(
    text: str,
    grounding: mentor_grounding.MentorGrounding | None,
    missing_keywords: list[str],
    source_bullet: str = "",
    metric: str | None = None,
) -> dict:
    """Turn the fully-streamed (or completed) rewrite text into the terminal payload:
    the cleaned line, a user-outcome rationale, and the internal citation record. Pure
    — no I/O. Returns ``{"mode": "error", ...}`` if the model produced nothing, or a
    not-worse guard fired: dropped a real number, dropped a named specific (substance
    guard), or minted a number the user never stated."""
    cleaned = clean_bullet_output(text)
    if cleaned is None:
        return {"mode": "error", "rationale": "No rewrite produced."}
    text = cleaned
    allowed = " ".join([metric or "", *missing_keywords])
    if source_bullet and loses_metrics(source_bullet, text):
        return {
            "mode": "error",
            "rationale": "The rewrite dropped real numbers from your line — kept your original.",
        }
    if source_bullet and loses_substance(source_bullet, text):
        return {
            "mode": "error",
            "rationale": "The rewrite lost real substance from your line — kept your original.",
        }
    if source_bullet and gains_foreign_numbers(source_bullet, text, allowed):
        return {
            "mode": "error",
            "rationale": "The rewrite added a number you never stated — kept your original.",
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

    return finalize_rewrite(raw, plan["grounding"], plan["missing_keywords"], source_bullet=bullet, metric=metric)


# ─── recommended + alternates (was: 3 equal tabs) ────────────────────────────
#
# The Mentor has an opinion: it returns the framings of the SAME real facts ORDERED
# strongest-first for this bullet, each with a one-line plain-language reason it wins
# (user-outcome terms — "leads with the 40% result", never "uses the XYZ formula").
# The frontend leads with variants[0] (the recommendation) and tucks the rest behind
# "other angles". Same unbreakable guardrails; one LLM round-trip returns all three.

VARIANTS_MAX_TOKENS = 640

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
# Tolerant: models emit the tag with or without brackets ("[SCOPE] …" / "SCOPE …"),
# line-anchored so a mid-sentence word can't false-match.
_TAG_LINE_RE = re.compile(r"^\s*\[?\s*(METRIC|IMPACT|SCOPE)\s*\]?\s*[:\-–]?\s+(.+)", re.IGNORECASE)


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
        "Output EXACTLY three lines, strongest first. Start each line with its angle "
        "tag, then the completed résumé bullet, then ||, then the completed reason. "
        "Never output template tokens or placeholder text."
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
        if (
            not text
            or _UNRESOLVED_TEMPLATE_TOKEN_RE.search(text)
            or _UNRESOLVED_TEMPLATE_TOKEN_RE.search(why)
        ):
            continue
        seen.add(angle)
        out.append({"angle": angle, "label": _LABELS.get(angle, "Alternate"), "text": text, "why": why})
    return out


# Surface-skill fixes are a WEAVE, not a reframe: the job is to name the missing
# term for ATS scanning with the SMALLEST possible edit. Forcing a rich bullet
# through a 3-angle one-line reframe invites the not-worse guards (a 2-sentence
# bullet can't compress to one line without losing something) — the live Azure
# dead-end. The fix KIND drives the instruction.
# The fix kinds the rail can promise. "weave" (keyword insertion) predates these
# and keeps its own instruction; the three below were added on 2026-08-25, when a
# `Cut "leverage"` row was observed returning the same sentence with "leverage"
# still in it — the request had carried no idea what the user had been promised.
_FIX_INTENTS = frozenset({"cut", "verb", "dedupe"})


def _quoted(phrases: list[str], fallback: str) -> str:
    named = ", ".join(f"\u201c{p}\u201d" for p in phrases[:3] if p and p.strip())
    return named or fallback


def _fix_instruction(intent: str, phrases: list[str]) -> str:
    """One instruction per promised fix. Each keeps the same shape as the weave
    instruction: name the change, forbid collateral damage, output only the line."""
    keep = (
        "Keep every fact, number, tool and proper noun exactly as they are. "
        "Do not add anything that is not already in the line.\n"
        "Output ONLY the edited bullet: no tags, no explanation."
    )
    if intent == "cut":
        target = _quoted(phrases, "the cliché")
        return (
            f"Remove {target} from this bullet and say what actually happened "
            f"instead. The phrase MUST NOT appear in your output in any form.\n{keep}"
        )
    if intent == "verb":
        target = _quoted(phrases, "the duty phrase")
        return (
            f"This bullet opens with {target}, which describes the assignment "
            "rather than the work. Rewrite it to START with a strong past-tense "
            "action verb naming what was done. The opening phrase MUST NOT "
            f"survive at the front of your output.\n{keep}"
        )
    target = _quoted(phrases, "the repeated phrase")
    return (
        f"{target} is used in more than one bullet on this CV. Reword THIS "
        "bullet so the phrase does not appear in it, keeping the same meaning. "
        f"The phrase MUST NOT appear in your output.\n{keep}"
    )


def _weave_instruction(keywords: list[str]) -> str:
    kws = ", ".join(f"“{k}”" for k in keywords[:3] if k.strip()) or "the target keyword"
    return (
        f"Weave {kws} into this bullet so an ATS scanner sees the exact term. Make "
        "the SMALLEST possible edit: keep the structure, sentence count, every fact "
        "and every number exactly as they are — only add or adjust the few words "
        "needed to name the term naturally where the work already implies it.\n"
        "Output ONLY the edited bullet: no tags, no explanation."
    )


def _passes_guards(bullet: str, text: str, allowed_text: str) -> bool:
    return not (
        loses_metrics(bullet, text)
        or loses_substance(bullet, text)
        or gains_foreign_numbers(bullet, text, allowed_text)
    )


_KEPT_ORIGINAL_RATIONALE = (
    "Mentor couldn't beat this line without losing real substance — kept your original."
)


async def suggest_rewrite_variants(
    bullet: str,
    role: str | None,
    missing_keywords: list[str] | None,
    metric: str | None,
    provider: LLMProvider | None = None,
    allow_no_metric: bool = False,
    user_id: str | None = None,
    intent: str | None = None,
    target_phrases: list[str] | None = None,
) -> dict:
    """Blocking recommended+alternates rewrite. `provider` is a TEST-ONLY override.
    ``intent="weave"`` (Surface-skill fixes) = one minimal keyword-insertion edit
    instead of the 3-angle reframe; the metric question never fires for it (adding
    a term needs no number). ``intent`` in {"cut","verb","dedupe"} = the fix kind
    the rail promised, with ``target_phrases`` naming the exact words to remove;
    the 3-angle shape is kept, the instruction just says what the change IS.
    Returns one of:
      {"mode": "question", ...} / {"mode": "suggest_metric", ...}
      {"mode": "variants", "variants": [{angle,label,text,why}], "citations": [...]}
          — variants[0] is the Mentor's recommendation (strongest-first).
      {"mode": "error", "rationale": str}
    """
    weave = intent == "weave"
    phrases = [p for p in (target_phrases or []) if p and p.strip()]
    plan = await prepare_rewrite(
        bullet, role, missing_keywords, metric,
        allow_no_metric=allow_no_metric or weave, user_id=user_id,
    )
    if plan["mode"] != "stream":
        return plan

    provider = provider or get_writer_provider()
    keywords = plan["missing_keywords"]
    allowed_text = " ".join([metric or "", *keywords])
    if weave:
        instruction = _weave_instruction(keywords)
    elif intent in _FIX_INTENTS:
        instruction = _variants_instruction() + "\n\n" + _fix_instruction(intent, phrases)
    else:
        instruction = _variants_instruction()
    messages = list(plan["messages"])
    messages[-1] = {**messages[-1], "content": messages[-1]["content"] + "\n\n" + instruction}

    try:
        raw = await provider.complete(messages, max_tokens=VARIANTS_MAX_TOKENS)
    except LLMProviderError:
        logger.info("cv_rewrite: variants providers failed (bullet len=%d)", len((bullet or "").strip()))
        return {"mode": "error", "rationale": "Rewrite is unavailable right now."}

    grounding = plan["grounding"]
    citations = grounding.citations() if grounding else []

    if weave:
        single = finalize_rewrite(raw, grounding, keywords, source_bullet=bullet, metric=metric)
        if single["mode"] != "rewrite":
            return {"mode": "error", "rationale": single.get("rationale") or _KEPT_ORIGINAL_RATIONALE}
        named = ", ".join(k for k in keywords[:3] if k.strip())
        return {
            "mode": "variants",
            "variants": [{"angle": "weave", "label": "Suggested",
                          "text": single["rewritten_text"],
                          "why": f"Names {named} — scanners can now see it" if named else single["rationale"]}],
            "citations": citations,
        }

    variants = _parse_variants(raw)
    if not variants:
        # Model ignored the tag format — fall back to a single rewrite so the user
        # still gets a recommendation rather than an error.
        single = finalize_rewrite(raw, grounding, keywords, source_bullet=bullet, metric=metric)
        if single["mode"] == "rewrite":
            return {
                "mode": "variants",
                "variants": [{"angle": "metric", "label": "Suggested",
                              "text": single["rewritten_text"], "why": single["rationale"]}],
                "citations": citations,
            }
        return {"mode": "error", "rationale": single.get("rationale") or "No rewrite produced."}

    # Not-worse guards: a version that dropped a real number, dropped a named
    # specific, or minted a foreign number is not a framing of the same facts —
    # filter it, never show it.
    variants = [v for v in variants if _passes_guards(bullet, v["text"], allowed_text)]
    if not variants:
        return {"mode": "error", "rationale": _KEPT_ORIGINAL_RATIONALE}

    return {"mode": "variants", "variants": variants, "citations": citations}
