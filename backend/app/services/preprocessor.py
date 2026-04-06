"""
preprocessor.py
Cleans and normalises raw job data before Groq tagging.

Steps applied in order:
  1. Strip HTML tags and decode entities from raw_jd_text
  2. Quality filter — drop jobs where cleaned JD < 150 chars
  3. Title normalisation — extract seniority_level if missing, strip noise from title
  4. INR salary normalisation — parse Indian salary formats → annual integer rupees
  5. Staleness filter — drop jobs posted >50 days before the most recent post in the dataset

Called by groq_tagger.py — not run directly.
"""

import re
from datetime import date, datetime, timedelta
from typing import Any

# ── 1. HTML stripping ─────────────────────────────────────────────────────────

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_SPACE_RE = re.compile(r"\s{2,}")
_HTML_ENTITIES = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&nbsp;": " ", "&quot;": '"', "&#39;": "'",
}


def strip_html(text: str) -> str:
    text = _HTML_TAG_RE.sub(" ", text)
    for entity, char in _HTML_ENTITIES.items():
        text = text.replace(entity, char)
    return _MULTI_SPACE_RE.sub(" ", text).strip()


# ── 2. Quality filter ─────────────────────────────────────────────────────────

MIN_JD_LENGTH = 150


def passes_quality_filter(job: dict) -> bool:
    return len((job.get("raw_jd_text") or "").strip()) >= MIN_JD_LENGTH


# ── 3. Title normalisation ────────────────────────────────────────────────────

# Order matters — more specific patterns first
_SENIORITY_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(intern|internship|graduate|fresher|trainee)\b", re.I), "entry"),
    (re.compile(r"\b(junior|jr\.?)\b", re.I), "junior"),
    (re.compile(r"\b(associate)\b", re.I), "associate"),
    (re.compile(r"\b(mid[- ]?level|intermediate)\b", re.I), "mid"),
    (re.compile(r"\b(senior|sr\.?)\b", re.I), "senior"),
    (re.compile(r"\b(staff)\b", re.I), "principal"),
    (re.compile(r"\b(principal)\b", re.I), "principal"),
    (re.compile(r"\b(lead|tech lead|team lead)\b", re.I), "lead"),
    (re.compile(r"\b(director)\b", re.I), "director"),
    (re.compile(r"\b(head of|head,)\b", re.I), "head"),
    (re.compile(r"\b(vp|vice president)\b", re.I), "vp"),
    (re.compile(r"\b(architect)\b", re.I), "architect"),
]

# Noise to strip from the end of titles
_TITLE_NOISE_RE = re.compile(
    r"(\s*[\|\-–—]\s*.+$"          # everything after | or dash
    r"|\s*\(.*?\)"                  # parentheticals
    r"|\s*\d+\s*(?:to|-)\s*\d+\s*(?:years?|yrs?).*$"  # "3 to 5 years" suffix
    r"|\s*,\s*.+$)",                # everything after first comma
    re.IGNORECASE,
)


def normalise_title(title: str, existing_seniority: str | None) -> tuple[str, str | None]:
    """Returns (clean_title, seniority_level). Preserves existing_seniority if already set."""
    seniority = existing_seniority
    if not seniority:
        for pattern, level in _SENIORITY_PATTERNS:
            if pattern.search(title):
                seniority = level
                break

    clean = _TITLE_NOISE_RE.sub("", title).strip()
    clean = re.sub(r"\s+", " ", clean)
    return clean or title, seniority


# ── 4. INR salary normalisation ───────────────────────────────────────────────

_LAKH = 100_000
_CRORE = 10_000_000

_MONTHLY_RE = re.compile(r"p\.?m\.?|per\s*month|/\s*month|monthly", re.I)
_LAKH_RE = re.compile(r"([\d.]+)\s*(?:l(?:akhs?)?|lpa)\b", re.I)
_CRORE_RE = re.compile(r"([\d.]+)\s*cr(?:ore)?s?\b", re.I)
_K_RE = re.compile(r"([\d.]+)\s*k\b", re.I)
_NUM_RE = re.compile(r"[\d.]+")


def _parse_inr_value(raw: Any) -> int | None:
    if isinstance(raw, (int, float)) and raw > 0:
        return int(raw)
    if not isinstance(raw, str) or not raw.strip():
        return None

    s = raw.strip().lower().replace(",", "").replace("₹", "").replace("inr", "").strip()
    is_monthly = bool(_MONTHLY_RE.search(s))
    # Strip per-annum markers before matching
    s = re.sub(r"\bper\s*annum\b|\bp\.?a\.?\b|\bannum\b", "", s).strip()

    if m := _LAKH_RE.search(s):
        return int(float(m.group(1)) * _LAKH)  # already annual

    if m := _CRORE_RE.search(s):
        val = float(m.group(1)) * _CRORE
        return int(val * 12) if is_monthly else int(val)

    if m := _K_RE.search(s):
        val = float(m.group(1)) * 1_000
        return int(val * 12) if is_monthly else int(val)

    if m := _NUM_RE.search(s):
        val = float(m.group())
        # Values < 1000 in isolation are almost certainly LPA in Indian JDs
        if val < 1_000:
            return int(val * _LAKH)
        return int(val * 12) if is_monthly else int(val)

    return None


def normalise_salary(
    salary_min: Any,
    salary_max: Any,
    currency: Any,
) -> tuple[int | None, int | None, str]:
    """Returns (min_inr, max_inr, currency_code)."""
    currency_str = str(currency or "").strip().upper() or "INR"
    return _parse_inr_value(salary_min), _parse_inr_value(salary_max), currency_str


# ── 5. Staleness filter ───────────────────────────────────────────────────────

STALENESS_DAYS = 50


def _parse_date(val: Any) -> date | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def apply_staleness_filter(jobs: list[dict]) -> tuple[list[dict], int]:
    """Drop jobs posted more than STALENESS_DAYS before the most recent post.
    Returns (kept_jobs, dropped_count)."""
    parsed = [_parse_date(j.get("date_posted")) for j in jobs]
    valid_dates = [d for d in parsed if d is not None]

    if not valid_dates:
        return jobs, 0  # no date info — keep all

    cutoff = max(valid_dates) - timedelta(days=STALENESS_DAYS)
    kept, dropped = [], 0
    for job, d in zip(jobs, parsed):
        if d is None or d >= cutoff:
            kept.append(job)
        else:
            dropped += 1
    return kept, dropped


# ── Main entry point ──────────────────────────────────────────────────────────

def preprocess(jobs: list[dict]) -> tuple[list[dict], dict[str, int]]:
    """
    Run all preprocessing steps on a list of raw job dicts.
    Mutates dicts in place for updated fields (raw_jd_text, title, seniority_level, salary).
    Returns (cleaned_jobs, stats).
    """
    stats: dict[str, int] = {
        "input": len(jobs),
        "dropped_quality": 0,
        "dropped_staleness": 0,
        "output": 0,
    }

    # Steps 1 + 2: HTML strip → quality filter
    quality_passed: list[dict] = []
    for job in jobs:
        job["raw_jd_text"] = strip_html(job.get("raw_jd_text") or "")
        if passes_quality_filter(job):
            quality_passed.append(job)
        else:
            stats["dropped_quality"] += 1

    # Step 3: Title normalisation
    for job in quality_passed:
        clean_title, seniority = normalise_title(
            job.get("title", ""),
            job.get("seniority_level"),
        )
        job["title"] = clean_title
        if seniority:
            job["seniority_level"] = seniority

    # Step 4: Salary normalisation
    for job in quality_passed:
        s_min, s_max, currency = normalise_salary(
            job.get("salary_min"),
            job.get("salary_max"),
            job.get("salary_currency"),
        )
        job["salary_min"] = s_min
        job["salary_max"] = s_max
        job["salary_currency"] = currency

    # Step 5: Staleness filter
    kept, stats["dropped_staleness"] = apply_staleness_filter(quality_passed)
    stats["output"] = len(kept)
    return kept, stats
