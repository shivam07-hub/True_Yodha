"""story_dedup — same-achievement detection + fold-as-variant merging.

Policy (Shivam, 2026-07-13): an alternate phrasing of an achievement the
reservoir already holds is VALUE, not noise — old CVs phrase the same win from
different angles, and every angle is reusable for a future CV or interview.
So a duplicate story FOLDS into its canonical story (pointer attaches as a
selectable variant; metrics/skills union in) instead of being skipped.

Detection is two-stage:
  cosine ≥ AUTO_FOLD_COSINE          → same achievement, fold silently
  JUDGE_BAND_COSINE ≤ cosine < auto  → ambiguous → ONE batched LLM judge call
                                       decides same-vs-different per pair
  below the band                     → distinct story

The judge is a judgment path → strong paid provider only (standing rule:
no cheap models on judgment paths). It fails soft to "different" — a judge
outage creates a curatable near-dupe, never loses a story.

Pure helpers are LLM-free and unit-tested; `judge_pairs` takes an injected
provider.
"""
from __future__ import annotations

import json
import logging
import math
from typing import Any

from app.services.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger("myro.story_dedup")

AUTO_FOLD_COSINE = 0.90   # ≥ this = same achievement, no judge needed
JUDGE_BAND_COSINE = 0.80  # [band, auto) = ambiguous → LLM judge decides
_MAX_JUDGE_TOKENS = 1000

_JUDGE_SYSTEM = (
    "You compare pairs of career achievements extracted from CVs. For each pair "
    "decide whether NEW and EXISTING describe the SAME underlying achievement "
    "(same work, possibly rephrased, reordered, or emphasising a different "
    "aspect) or genuinely DIFFERENT work.\n"
    "Same achievement signals: identical metrics or scope, inverted phrasing of "
    "one event, the same project described from another angle.\n"
    "Different signals: different time periods, different deliverables, "
    "different metrics that cannot be the same event.\n"
    'Return ONLY a compact JSON array, one item per pair in order: '
    '[{"index": int, "same": true|false}]. When unsure, answer false.'
)


# ── pure: matching ───────────────────────────────────────────────────────────

def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


def best_match(
    candidate: list[float], existing: list[tuple[str, list[float]]],
) -> tuple[str | None, float]:
    """Highest-cosine existing story for a candidate vector. (None, 0.0) when
    nothing clears the judge band."""
    best_id: str | None = None
    best_score = 0.0
    for story_id, vec in existing:
        score = cosine(candidate, vec)
        if score > best_score:
            best_id, best_score = story_id, score
    if best_score < JUDGE_BAND_COSINE:
        return None, 0.0
    return best_id, best_score


def classify(score: float) -> str:
    """'fold' | 'judge' | 'new' for a best-match score."""
    if score >= AUTO_FOLD_COSINE:
        return "fold"
    if score >= JUDGE_BAND_COSINE:
        return "judge"
    return "new"


def find_title_twin(title: str, rows_by_id: dict[str, dict[str, Any]]) -> str | None:
    """An existing story with the SAME normalized title — a deterministic dupe
    signal that embeddings can miss when the phrasings diverge. A twin is never
    auto-folded, only sent to the judge."""
    norm = _norm(title)
    if not norm:
        return None
    for sid, row in rows_by_id.items():
        if _norm(str(row.get("title") or "")) == norm:
            return sid
    return None


# ── pure: fold merging ───────────────────────────────────────────────────────

def _norm(text: str) -> str:
    return " ".join((text or "").lower().split())


def pointer_is_new(text: str, existing_texts: list[str]) -> bool:
    norm = _norm(text)
    return bool(norm) and all(_norm(t) != norm for t in existing_texts)


def merged_skills(existing: list[str], incoming: list[str], cap: int = 8) -> list[str]:
    seen = {_norm(s) for s in existing}
    out = list(existing)
    for s in incoming:
        if _norm(s) not in seen:
            seen.add(_norm(s))
            out.append(s)
    return out[:cap]


def merged_metrics(
    existing: list[dict[str, Any]], incoming: list[dict[str, Any]], cap: int = 8,
) -> list[dict[str, Any]]:
    def key(m: dict[str, Any]) -> str:
        return f"{_norm(str(m.get('value') or ''))}|{_norm(str(m.get('what') or ''))}"

    seen = {key(m) for m in existing}
    out = list(existing)
    for m in incoming:
        if key(m) not in seen:
            seen.add(key(m))
            out.append(m)
    return out[:cap]


# ── judge (batched, fail-soft) ───────────────────────────────────────────────

def _pair_text(story: dict[str, Any]) -> str:
    narrative = story.get("narrative") or {}
    return " | ".join(
        p for p in (
            story.get("title") or "",
            story.get("pointer") or "",
            narrative.get("result") or "",
        ) if p
    )


def build_judge_messages(pairs: list[dict[str, Any]]) -> list[dict[str, str]]:
    lines = []
    for i, pair in enumerate(pairs):
        lines.append(f"PAIR {i}:")
        lines.append(f"  NEW: {_pair_text(pair['new'])}")
        lines.append(f"  EXISTING: {_pair_text(pair['existing'])}")
    return [
        {"role": "system", "content": _JUDGE_SYSTEM},
        {"role": "user", "content": "\n".join(lines)},
    ]


def parse_judge(raw: str, n: int) -> list[bool]:
    """Judge response → same-flags aligned to pair order. Junk → all False
    (conservative: an unjudged pair becomes a new story, nothing is lost)."""
    text = (raw or "").strip()
    start = text.find("[")
    if start == -1:
        return [False] * n
    end = text.rfind("]")
    try:
        arr = json.loads(text[start:end + 1] if end > start else text[start:])
    except (json.JSONDecodeError, ValueError):
        return [False] * n
    flags = [False] * n
    if not isinstance(arr, list):
        return flags
    for item in arr:
        if not isinstance(item, dict):
            continue
        idx = item.get("index")
        if isinstance(idx, int) and 0 <= idx < n:
            flags[idx] = bool(item.get("same"))
    return flags


async def judge_pairs(pairs: list[dict[str, Any]], provider: LLMProvider) -> list[bool]:
    """One batched call: is each (new, existing) pair the same achievement?
    Provider failure → all False (fold nothing, keep everything)."""
    if not pairs:
        return []
    try:
        raw = await provider.complete(build_judge_messages(pairs), max_tokens=_MAX_JUDGE_TOKENS)
    except LLMProviderError:
        logger.info("story_dedup: judge unavailable — treating %d pairs as distinct", len(pairs))
        return [False] * len(pairs)
    return parse_judge(raw, len(pairs))
