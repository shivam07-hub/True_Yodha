"""Honest receipts for CV-extracted skills.

Employer headers and standalone metrics are not skills. Signal type is read
from the evidence line, not from a model's guess — otherwise every skill lands
at `project` and shows the same 0.50 confidence.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

from app.services.experience_years import parse_experience_range

_BULLET = re.compile(r"^\s*(?:[-*•–—]|\d+[.)])\s+")
_WORD = re.compile(r"[a-z0-9+#]+")
_METRIC = re.compile(r"(?:\d+(?:[.,]\d+)?%|\$\s*\d+|\b\d+\s*(?:x|times)\b)")
_STOP = {
    "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for", "with",
    "by", "from", "as", "language", "software", "system", "systems",
}
_LEADERSHIP = {
    "led", "mentored", "managed", "architected", "headed", "oversaw", "supervised",
}
_ACTION = {
    "achieved", "analysed", "analyzed", "automated", "built", "completed",
    "conducted", "created", "delivered", "designed", "developed", "drove",
    "edited", "engineered", "executed", "implemented", "improved", "increased",
    "launched", "led", "migrated", "optimised", "optimized", "owned", "produced",
    "reduced", "scaled", "shipped", "wrote",
}

_MAX_HEADER_WORDS = 12


def _words(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def _lines(cv_text: str) -> list[tuple[int, int, str]]:
    lines: list[tuple[int, int, str]] = []
    pos = 0
    for line in cv_text.splitlines(keepends=True):
        lines.append((pos, pos + len(line), line))
        pos += len(line)
    return lines


def _is_bullet(line: str) -> bool:
    return _BULLET.match(line) is not None


def _is_short_header(stripped: str) -> bool:
    if not stripped or _is_bullet(stripped):
        return False
    return len(stripped.split()) <= _MAX_HEADER_WORDS


def header_spans(cv_text: str) -> list[tuple[int, int]]:
    """Company / title / date lines. Bullets and skills lists stay matchable."""
    rows = _lines(cv_text)
    date_at = [
        i for i, (_s, _e, line) in enumerate(rows)
        if line.strip() and parse_experience_range(line.strip())
    ]
    skip: set[int] = set(date_at)

    def _claim_neighbours(start: int, step: int) -> None:
        claimed = 0
        idx = start
        while 0 <= idx < len(rows) and claimed < 2:
            _s, _e, line = rows[idx]
            stripped = line.strip()
            if not stripped:
                idx += step
                continue
            if _is_bullet(stripped) or not _is_short_header(stripped):
                break
            skip.add(idx)
            claimed += 1
            idx += step

    for i in date_at:
        _claim_neighbours(i - 1, -1)
        _claim_neighbours(i + 1, 1)

    return [(rows[i][0], rows[i][1]) for i in sorted(skip)]


def span_in_headers(start: int, end: int, spans: Iterable[tuple[int, int]]) -> bool:
    return any(hs <= start and end <= he for hs, he in spans)


def evidence_only_in_headers(cv_text: str, evidence: str, spans: list[tuple[int, int]]) -> bool:
    needle = evidence.strip()
    if not needle or not spans:
        return False
    start = 0
    found = False
    while True:
        idx = cv_text.find(needle, start)
        if idx < 0:
            return found
        found = True
        if not span_in_headers(idx, idx + len(needle), spans):
            return False
        start = idx + 1


def _skill_names(skill_name: str) -> tuple[list[str], list[str]]:
    body = skill_name
    extra: list[str] = []
    if "(" in skill_name and skill_name.endswith(")"):
        body, raw = skill_name.rsplit("(", 1)
        extra = [w for w in _words(raw[:-1]) if w not in _STOP]
    base = [w for w in _words(body) if w not in _STOP]
    return base, extra


def evidence_names_skill(evidence: str, skill_name: str) -> bool:
    """The receipt has to name the skill. One overlapping token is not enough
    for a multi-word Lightcast key — that is how 'BillDesk Spring' became
    Spring Framework."""
    ev = set(_words(evidence))
    if not ev:
        return False
    base, extra = _skill_names(skill_name)
    if extra and any(token in ev for token in extra):
        return True
    if not base:
        return False
    if len(base) == 1:
        return base[0] in ev
    return sum(1 for token in base if token in ev) >= 2


def signal_from_evidence(evidence: str, skill_name: str) -> str:
    words = _words(evidence)
    if any(word in _LEADERSHIP for word in words):
        return "leadership"
    if _METRIC.search(evidence) and evidence_names_skill(evidence, skill_name):
        return "impact"
    if any(word in _ACTION for word in words):
        return "project"
    return "mention"


def apply_cv_evidence_rules(
    skills: list[dict[str, Any]],
    cv_text: str,
    signal_xp: dict[str, int],
) -> list[dict[str, Any]]:
    """Drop stray receipts and set signal_type from the line that remains."""
    spans = header_spans(cv_text)
    kept: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in skills:
        key = str(raw.get("taxonomy_key") or "").strip()
        evidence = str(raw.get("evidence") or "").strip()
        if not key or key in seen:
            continue
        if evidence and evidence not in cv_text:
            continue
        if not evidence_names_skill(evidence, key):
            continue
        if evidence_only_in_headers(cv_text, evidence, spans):
            continue
        signal = signal_from_evidence(evidence, key)
        item = dict(raw)
        item["taxonomy_key"] = key
        item["evidence"] = evidence[:300]
        item["signal_type"] = signal
        item["xp_awarded"] = signal_xp[signal]
        seen.add(key)
        kept.append(item)
    return kept


def stray_skill_ids(receipts: list[dict[str, Any]], cv_text: str) -> list[int]:
    """CV-sourced skills whose stored evidence would not survive a fresh extract.

    Returns [] when every skill would go — a user is not left with an empty
    profile by a heal. Overrides are someone else's decision and are left alone.
    """
    xp = {"mention": 1, "project": 1, "impact": 1, "leadership": 1}
    cv_rows = [
        row for row in receipts
        if str(row.get("source") or "cv") == "cv" and row.get("skill_id") is not None
    ]
    if not cv_rows or not cv_text.strip():
        return []
    shaped = [
        {
            "taxonomy_key": str(row.get("taxonomy_key") or "").strip(),
            "evidence": str(row.get("evidence_text") or row.get("evidence") or "").strip(),
        }
        for row in cv_rows
    ]
    kept = {item["taxonomy_key"] for item in apply_cv_evidence_rules(shaped, cv_text, xp)}
    dropped = [
        int(row["skill_id"])
        for row in cv_rows
        if str(row.get("taxonomy_key") or "").strip() not in kept
    ]
    if not dropped or len(dropped) >= len(cv_rows):
        return []
    return dropped
