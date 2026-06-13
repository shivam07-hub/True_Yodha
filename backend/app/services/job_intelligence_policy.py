from __future__ import annotations

from datetime import date, datetime, timezone

PERSONAL_FEEDBACK_REASONS = frozenset(
    {
        "not_my_role",
        "location",
        "seniority",
        "compensation",
        "company",
        "skills_gap",
        "already_applied",
    }
)
QUALITY_FEEDBACK_REASONS = frozenset(
    {
        "looks_old",
        "apply_link_closed",
        "duplicate",
        "details_wrong",
        "posting_inactive",
    }
)
FEEDBACK_SURFACES = frozenset({"dashboard", "market", "job_detail", "other"})
PRIVACY_COHORT_MIN = 5
STALE_AFTER_DAYS = 21
LIKELY_CLOSED_AFTER_DAYS = 45


def validate_feedback(
    *,
    feedback_kind: str,
    reason_code: str,
    surface: str,
) -> bool:
    reasons = (
        PERSONAL_FEEDBACK_REASONS
        if feedback_kind == "personal"
        else QUALITY_FEEDBACK_REASONS
        if feedback_kind == "quality"
        else frozenset()
    )
    return reason_code in reasons and surface in FEEDBACK_SURFACES


def parse_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif value:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    else:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def marker_to_iso_date(value: object) -> str | None:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "").strip()
    if len(text) == 8 and text.isdigit():
        try:
            return datetime.strptime(text, "%Y%m%d").date().isoformat()
        except ValueError:
            return None
    try:
        return date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        return None


def days_since_marker(value: object, *, now: datetime) -> int | None:
    iso_date = marker_to_iso_date(value)
    if iso_date is None:
        return None
    observed = date.fromisoformat(iso_date)
    return max(0, (now.date() - observed).days)


def listing_confidence(
    row: dict,
    *,
    now: datetime,
) -> tuple[str, bool]:
    age_days = days_since_marker(row.get("last_seen"), now=now)
    is_stale = age_days is not None and age_days > STALE_AFTER_DAYS
    closure_reports = _count(row, "apply_link_closed_count") + _count(
        row, "posting_inactive_count"
    )
    looks_old = _count(row, "looks_old_count")

    if not bool(row.get("is_active", True)):
        return "closed", is_stale
    if closure_reports >= 2:
        return "likely_closed", is_stale
    if (
        age_days is not None
        and age_days > LIKELY_CLOSED_AFTER_DAYS
        and looks_old >= 2
    ):
        return "likely_closed", is_stale
    if age_days is None or is_stale or closure_reports >= 1 or looks_old >= 2:
        return "uncertain", is_stale
    return "active", is_stale


def visible_count(value: object, *, cohort: object) -> int | None:
    if _as_int(cohort) < PRIVACY_COHORT_MIN:
        return None
    return _as_int(value)


def response_signal(
    *,
    applied_count: object,
    responded_count: object,
) -> str | None:
    applied = _as_int(applied_count)
    if applied < PRIVACY_COHORT_MIN:
        return None
    rate = _as_int(responded_count) / applied
    if rate >= 0.5:
        return "high"
    if rate >= 0.2:
        return "mixed"
    return "low"


def _count(row: dict, key: str) -> int:
    return _as_int(row.get(key))


def _as_int(value: object) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0
