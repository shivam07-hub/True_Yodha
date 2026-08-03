"""Evidence-preserving CV experience parsing for onboarding seniority."""

from __future__ import annotations

import math
import re
from calendar import monthrange
from datetime import date
from typing import Iterable

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7,
    "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
_DATE_TOKEN = re.compile(
    r"\b(?:present|current)\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s']*\d{2,4}\b|\b\d{1,2}/\d{4}\b|\b\d{4}\b",
    re.IGNORECASE,
)
_SENIORITY_RANK = {
    "intern": 0,
    "entry": 1,
    "mid": 2,
    "senior": 3,
    "lead": 4,
    "executive": 5,
}
_CANDIDATE_TITLE_PATTERNS = (
    ("executive", re.compile(r"\b(?:chief|vice[\s-]+president|vp|director)\b", re.IGNORECASE)),
    ("lead", re.compile(r"\b(?:head|principal|lead)\b", re.IGNORECASE)),
    ("senior", re.compile(r"\b(?:senior|sr)\b\.?", re.IGNORECASE)),
    ("mid", re.compile(r"\bmid(?:[\s-]+level)?\b", re.IGNORECASE)),
    ("entry", re.compile(r"\b(?:junior|jr|graduate|entry[\s-]+level)\b\.?", re.IGNORECASE)),
    ("intern", re.compile(r"\b(?:intern|internship|apprentice|trainee)\b", re.IGNORECASE)),
)


def _parse_token(value: str, *, end: bool, today: date) -> date | None:
    text = value.strip().casefold().replace("’", "'")
    if text in {"present", "current"}:
        return today
    if re.fullmatch(r"\d{1,2}/\d{4}", text):
        month_text, year_text = text.split("/")
        month, year = int(month_text), int(year_text)
        if not 1 <= month <= 12:
            return None
        return date(year, month, monthrange(year, month)[1] if end else 1)
    if re.fullmatch(r"\d{4}", text):
        year = int(text)
        return date(year, 12 if end else 1, 31 if end else 1)
    match = re.fullmatch(r"([a-z]+)[\s']*(\d{2,4})", text)
    if not match:
        return None
    month = _MONTHS.get(match.group(1))
    if month is None:
        return None
    raw_year = int(match.group(2))
    year = raw_year if raw_year >= 100 else 2000 + raw_year
    return date(year, month, monthrange(year, month)[1] if end else 1)


def parse_experience_range(value: str, *, today: date | None = None) -> tuple[date, date] | None:
    """Parse one CV date range; unknown or malformed evidence stays unknown."""
    today = today or date.today()
    tokens = _DATE_TOKEN.findall(value or "")
    if not tokens:
        return None
    start = _parse_token(tokens[0], end=False, today=today)
    if start is None:
        return None
    if len(tokens) == 1:
        if re.fullmatch(r"\d{4}", tokens[0].strip()):
            end = date(min(start.year, today.year), 12, 31)
            return (start, min(end, today)) if start <= today else None
        return None
    end = _parse_token(tokens[-1], end=True, today=today)
    if end is None or end < start:
        return None
    return start, end


def total_experience_years(date_ranges: Iterable[str], *, today: date | None = None) -> float | None:
    """Merge overlapping CV roles and return their total duration, or ``None``."""
    today = today or date.today()
    parsed = [parsed_range for value in date_ranges if (parsed_range := parse_experience_range(value, today=today))]
    if not parsed:
        return None
    parsed.sort(key=lambda item: item[0])
    merged: list[tuple[date, date]] = []
    for start, end in parsed:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    days = sum((end - start).days + 1 for start, end in merged)
    return days / 365.2425


def seniority_for_experience_years(years: float) -> str:
    """Use the same durable band boundaries as job eligibility."""
    whole_years = math.floor(years)
    if whole_years <= 1:
        return "entry"
    if whole_years <= 4:
        return "mid"
    if whole_years <= 7:
        return "senior"
    if whole_years <= 10:
        return "lead"
    return "executive"


def seniority_for_candidate_title(title: str) -> str:
    """Infer only from words that explicitly describe candidate seniority.

    Role nouns such as ``analyst``, ``consultant``, and ``manager`` are useful
    job-listing heuristics but do not prove the level of the person holding the
    title. Unknown evidence deliberately stays unknown so onboarding can ask.
    """
    known = [
        level
        for level, pattern in _CANDIDATE_TITLE_PATTERNS
        if pattern.search(title or "")
    ]
    return max(known, key=_SENIORITY_RANK.__getitem__) if known else ""


def seniority_from_cv(baseline: dict | None) -> dict:
    """The seniority band this CV implies, with the evidence for it.

    ``{"value": band|None, "source": "experience_years"|"title"|"unknown",
       "needs_choice": bool, ...evidence}``

    One reader, two consumers, deliberately: the confirm-skills step scores the
    CV against this band, and the direction step shows it as the pre-filled
    answer. If they read it separately they would eventually disagree, and the
    disagreement would surface as a Myro Score that changes for no visible
    reason the moment the user accepts the level Myro suggested.

    Never guesses. Unknown stays unknown (``needs_choice``) so the direction step
    asks instead of inventing a band the CV does not support.
    """
    structured = (baseline or {}).get("cv_structured") or {}
    contact = structured.get("contact") or {}
    experience = [row for row in (structured.get("experience") or []) if isinstance(row, dict)]

    years = total_experience_years([str(row.get("dates") or "") for row in experience])
    if years is not None:
        return {
            "value": seniority_for_experience_years(years),
            "years": round(years),
            "source": "experience_years",
            "needs_choice": False,
        }

    titles = [(contact.get("title") or "").strip()]
    if experience:
        titles.append(str(experience[0].get("role") or "").strip())
    for title in titles:
        level = seniority_for_candidate_title(title)
        if level:
            return {"value": level, "title": title, "source": "title", "needs_choice": False}

    return {"value": None, "source": "unknown", "needs_choice": True}
