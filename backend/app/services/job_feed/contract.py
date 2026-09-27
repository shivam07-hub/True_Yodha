from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Mapping

from app.services.listing_time import day
from app.services.location_normalizer import normalize_location


class JobFeedContractError(ValueError):
    """Raised when a crawler row cannot satisfy the public.jobs contract."""


_INDUSTRY_KEYS = ("industry", "Industry", "Industry_name", "industry_name")
_LOCATION_KEYS = ("location", "Location")


def _first_value(raw: Mapping[str, Any], keys: tuple[str, ...], default: Any = None) -> Any:
    for key in keys:
        value = raw.get(key)
        if value is not None:
            return value
    return default


def _clean_text(value: Any, *, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()


def _required_text(raw: Mapping[str, Any], key: str) -> str:
    value = _clean_text(raw.get(key))
    if not value:
        raise JobFeedContractError(f"Missing required jobs.{key}")
    return value


def _parse_skills(value: Any) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        items: list[Any] = value.split(",")
    elif isinstance(value, (list, tuple, set)):
        items = list(value)
    else:
        raise JobFeedContractError("Skill fields must be a list or comma-separated string")

    cleaned: list[str] = []
    seen: set[str] = set()
    for item in items:
        skill = _clean_text(item)
        dedupe_key = skill.lower()
        if skill and dedupe_key not in seen:
            cleaned.append(skill)
            seen.add(dedupe_key)
    return tuple(cleaned)


def _batch_day(value: Any, *, default: date | None) -> date:
    """The dump day on a crawler row.

    Empty uses the caller's default. A present value that is not a day is a
    contract error. Nothing here reads the clock.
    """
    if value is None or value == "":
        if default is None:
            raise JobFeedContractError("batch_date is required")
        return default
    parsed = day(value)
    if parsed is None:
        raise JobFeedContractError("batch_date must be YYYYMMDD or an ISO date")
    return parsed


@dataclass(frozen=True)
class JobFeedRow:
    job_id: str
    job_title: str
    job_description: str
    company_name: str
    industry: str
    location: str | None
    location_raw: str | None
    location_city: str | None
    location_country: str | None
    location_mode: str
    location_quality: str
    apply_url: str | None
    main_skills: tuple[str, ...]
    side_skills: tuple[str, ...]
    batch_date: date

    @classmethod
    def from_mapping(
        cls,
        raw: Mapping[str, Any],
        *,
        default_batch_date: date | None = None,
    ) -> JobFeedRow:
        normalized_location = normalize_location(_first_value(raw, _LOCATION_KEYS))
        return cls(
            job_id=_required_text(raw, "job_id"),
            job_title=_required_text(raw, "job_title"),
            job_description=_clean_text(raw.get("job_description")),
            company_name=_clean_text(raw.get("company_name")),
            industry=_clean_text(_first_value(raw, _INDUSTRY_KEYS)),
            location=normalized_location.location,
            location_raw=normalized_location.location_raw,
            location_city=normalized_location.location_city,
            location_country=normalized_location.location_country,
            location_mode=normalized_location.location_mode,
            location_quality=normalized_location.location_quality,
            apply_url=_clean_text(raw.get("apply_url")) or None,
            main_skills=_parse_skills(raw.get("main_skills")),
            side_skills=_parse_skills(raw.get("side_skills")),
            batch_date=_batch_day(raw.get("batch_date"), default=default_batch_date),
        )

    def to_supabase_row(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "job_title": self.job_title,
            "job_description": self.job_description,
            "company_name": self.company_name,
            "industry": self.industry,
            "location": self.location,
            "location_raw": self.location_raw,
            "location_city": self.location_city,
            "location_country": self.location_country,
            "location_mode": self.location_mode,
            "location_quality": self.location_quality,
            "apply_url": self.apply_url,
            "main_skills": list(self.main_skills),
            "side_skills": list(self.side_skills),
            "batch_date": self.batch_date.isoformat(),
        }


def normalize_job_feed_row(
    raw: Mapping[str, Any],
    *,
    default_batch_date: date | None = None,
) -> dict[str, Any]:
    """Normalize one crawler row into the exact public.jobs row contract."""
    return JobFeedRow.from_mapping(raw, default_batch_date=default_batch_date).to_supabase_row()
