"""A job CV may only carry roles the person's master already holds.

The pair is company and role, with case, whitespace and punctuation removed.
Dates on that pair may narrow. They may not start earlier, end later, or
become open-ended. ``ARCHITECTURE_CV_TIER_A.md`` fix B.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from fastapi import HTTPException

logger = logging.getLogger(__name__)

_MONTHS = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}
_OPEN = {"present", "current", "now", "ongoing", "today"}
_WORD = re.compile(r"[a-z0-9]+")


class FabricatedRoleError(HTTPException):
    """A job document named an employer, a title, or dates the master does not hold."""

    def __init__(self, company: str, role: str, *, reason: str) -> None:
        self.company = company
        self.role = role
        self.reason = reason
        shown = " · ".join(part for part in (role.strip(), company.strip()) if part) or "A role"
        if reason == "widened":
            detail = f"{shown} dates go outside the role on your CV."
        else:
            detail = f"{shown} is not a role on your CV."
        super().__init__(status_code=422, detail=detail)


def assert_matches_master(master: dict[str, Any], document: dict[str, Any]) -> None:
    """Refuse the first experience row the master cannot support."""
    problem = _first_problem(master, document)
    if problem is not None:
        row, reason = problem
        raise FabricatedRoleError(_text(row, "company"), _text(row, "role"), reason=reason)


def drop_invented(master: dict[str, Any], document: dict[str, Any]) -> dict[str, Any]:
    """Return the document without experience the master cannot support.

    Model writes use this so the person is not shown a 422 for a line they
    did not type. Each drop is ``metric cv.fabricated_role_dropped``.
    """
    experience = document.get("experience")
    if not isinstance(experience, list):
        return document
    kept: list[Any] = []
    changed = False
    for row in experience:
        if not isinstance(row, dict):
            kept.append(row)
            continue
        reason = _row_problem(_spans(master), row)
        if reason is None:
            kept.append(row)
            continue
        changed = True
        logger.warning(
            "metric cv.fabricated_role_dropped company=%s role=%s reason=%s",
            _flat(_text(row, "company")),
            _flat(_text(row, "role")),
            reason,
        )
    if not changed:
        return document
    return {**document, "experience": kept}


def _first_problem(
    master: dict[str, Any], document: dict[str, Any],
) -> tuple[dict[str, Any], str] | None:
    spans = _spans(master)
    for row in _rows(document):
        reason = _row_problem(spans, row)
        if reason is not None:
            return row, reason
    return None


def _row_problem(spans: dict[tuple[str, str], list[tuple[int, int] | None]], row: dict[str, Any]) -> str | None:
    pair = _pair(row)
    if pair is None:
        return None
    held = spans.get(pair)
    if not held:
        return "invented"
    claim = _span(_text(row, "dates"))
    if claim is None:
        return None
    if any(master_span is not None and _inside(claim, master_span) for master_span in held):
        return None
    return "widened"


def _spans(master: dict[str, Any]) -> dict[tuple[str, str], list[tuple[int, int] | None]]:
    found: dict[tuple[str, str], list[tuple[int, int] | None]] = {}
    for row in _rows(master):
        pair = _pair(row)
        if pair is None:
            continue
        found.setdefault(pair, []).append(_span(_text(row, "dates")))
    return found


def _rows(structured: dict[str, Any]) -> list[dict[str, Any]]:
    raw = structured.get("experience") if isinstance(structured, dict) else None
    if not isinstance(raw, list):
        return []
    return [row for row in raw if isinstance(row, dict)]


def _pair(row: dict[str, Any]) -> tuple[str, str] | None:
    company = _norm(_text(row, "company"))
    role = _norm(_text(row, "role"))
    if not company and not role:
        return None
    return company, role


def _text(row: dict[str, Any], key: str) -> str:
    value = row.get(key)
    return value.strip() if isinstance(value, str) else ""


def _norm(value: str) -> str:
    return "".join(_WORD.findall(value.casefold()))


def _flat(value: str) -> str:
    return " ".join(value.split())[:120]


def _inside(claim: tuple[int, int], held: tuple[int, int]) -> bool:
    return claim[0] >= held[0] and claim[1] <= held[1]


def date_span(dates: str) -> tuple[int, int] | None:
    """Public read of a CV date range as ``(start, end)`` YYYYMM codes.

    One parser for every caller that reasons about when a role ran — the seat
    exclusivity gate reads it so a second copy cannot drift from this one.
    """
    return _span(dates)


def _span(dates: str) -> tuple[int, int] | None:
    """``(start, end)`` as YYYYMM. An unknown month fills the whole year.
    An open end is 999912. No year at all is not a dated claim.
    """
    words = _WORD.findall(dates.casefold())
    points: list[tuple[int, int]] = []
    index = 0
    while index < len(words):
        word = words[index]
        if word in _OPEN:
            points.append((9999, 12))
            index += 1
            continue
        month = _MONTHS.get(word)
        if month is not None and index + 1 < len(words) and _year(words[index + 1]) is not None:
            points.append((_year(words[index + 1]) or 0, month))
            index += 2
            continue
        year = _year(word)
        if year is not None:
            if index + 1 < len(words) and _MONTHS.get(words[index + 1]) is not None:
                points.append((year, _MONTHS[words[index + 1]]))
                index += 2
                continue
            points.append((year, 0))
            index += 1
            continue
        index += 1
    years = [point for point in points if point[0] < 9999]
    if not years:
        return None
    start_year, start_month = years[0]
    end_year, end_month = points[-1]
    if end_year >= 9999:
        end_code = 999912
    else:
        end_code = end_year * 100 + (end_month or 12)
    return start_year * 100 + (start_month or 1), end_code


def _year(word: str) -> int | None:
    if len(word) == 4 and word.isdigit():
        year = int(word)
        if 1900 <= year <= 2100:
            return year
    return None
