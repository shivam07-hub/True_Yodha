"""Evidence-preserving work-duration parsing for onboarding seniority."""

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
