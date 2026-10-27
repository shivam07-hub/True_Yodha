"""Paid internships: corpus intern roles plus listings posted on Myro.

Career-page internships still apply on the company portal. Hosted internships
(`listing_venue=myro`) apply in-app. Unpaid hosted listings are refused.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from app.services.listing_liveness import live_only
from app.services.listing_time import CARD_COLUMNS, HOSTED_COLUMNS, verdict as listing_time

_INTERN_TITLE = re.compile(r"\bintern(?:ship)?\b", re.I)
_INTERN_OR = (
    "employment_kind.eq.internship,"
    "seniority_level.eq.intern,"
    "listing_venue.eq.myro,"
    "job_title.ilike.%intern%"
)
_SELECT = (
    "job_id, job_title, company_name, job_description, industry, apply_url, "
    "location, location_city, location_country, location_mode, locations, "
    "role_family, seniority_level, min_years_experience, max_years_experience, "
    f"main_skills, {HOSTED_COLUMNS}, {CARD_COLUMNS}"
)


class UnpaidInternshipError(ValueError):
    """Hosted internships must pay a stipend."""


def is_intern_job(row: dict[str, Any]) -> bool:
    if (row.get("employment_kind") or "") == "internship":
        return True
    if (row.get("seniority_level") or "").lower() == "intern":
        return True
    if int(row.get("stipend_low_inr") or 0) > 0 or int(row.get("stipend_high_inr") or 0) > 0:
        return True
    return bool(_INTERN_TITLE.search(str(row.get("job_title") or "")))


def require_paid(low: int | None, high: int | None) -> int:
    stipend = int(low or 0)
    if stipend <= 0:
        stipend = int(high or 0)
    if stipend <= 0:
        raise UnpaidInternshipError("Paid internships only")
    return stipend


def hosted_job_id() -> str:
    return f"myro_{uuid.uuid4().hex[:16]}"


def hosted_job_row(user_id: str, body: dict[str, Any], *, now: datetime) -> dict[str, Any]:
    low = require_paid(body.get("stipend_low_inr"), body.get("stipend_high_inr"))
    high = int(body.get("stipend_high_inr") or low)
    if high < low:
        high = low
    months = int(body.get("duration_months") or 0)
    if months < 1:
        raise ValueError("duration_months must be at least 1")
    title = str(body.get("job_title") or "").strip()
    company = str(body.get("company_name") or "").strip()
    description = str(body.get("job_description") or "").strip()
    if len(title) < 3 or len(company) < 2 or len(description) < 20:
        raise ValueError("company, title and description are required")
    mode = str(body.get("location_mode") or "onsite")
    if mode not in {"onsite", "hybrid", "remote"}:
        raise ValueError("location_mode must be onsite, hybrid or remote")
    skills = [str(s).strip() for s in (body.get("skills") or []) if str(s).strip()]
    stamp = now.isoformat()
    marker = int(now.strftime("%Y%m%d"))
    return {
        "job_id": hosted_job_id(),
        "job_title": title,
        "company_name": company,
        "industry": "unknown",
        "location": (str(body.get("location") or "").strip() or None),
        "location_mode": mode,
        "job_description": description,
        "main_skills": skills[:12],
        "first_seen": marker,
        "last_seen": marker,
        "batch_date": marker,
        "ingestion_source": "myro_hosted",
        "quality_status": "user_confirmed",
        "created_by_user_id": user_id,
        "listing_venue": "myro",
        "employment_kind": "internship",
        "seniority_level": "intern",
        "stipend_low_inr": low,
        "stipend_high_inr": high,
        "duration_months": months,
        "ppo": bool(body.get("ppo")),
        "listing_confidence": "active",
        "is_active": True,
        "last_verified_live_at": stamp,
        "last_conclusive_verification_at": stamp,
        "apply_url": None,
        "source_platform": "myro",
    }


def hosted_fields(job: dict[str, Any]) -> dict[str, Any]:
    venue = job.get("listing_venue") or "career_page"
    kind = job.get("employment_kind") or "full_time"
    return {
        "listing_venue": venue if venue in {"career_page", "myro"} else "career_page",
        "employment_kind": kind if kind in {"full_time", "internship"} else "full_time",
        "stipend_low_inr": job.get("stipend_low_inr"),
        "stipend_high_inr": job.get("stipend_high_inr"),
        "duration_months": job.get("duration_months"),
        "ppo": job.get("ppo"),
    }


def intern_card(row: dict[str, Any], *, now: datetime) -> dict[str, Any]:
    when = listing_time(row, now=now)
    skills = [str(s).strip() for s in (row.get("main_skills") or []) if str(s).strip()]
    return {
        "job_id": str(row.get("job_id") or ""),
        "job_title": row.get("job_title") or "Internship",
        "company_name": row.get("company_name"),
        "job_description": row.get("job_description"),
        "location": row.get("location"),
        "location_city": row.get("location_city"),
        "location_country": row.get("location_country"),
        "location_mode": row.get("location_mode"),
        "locations": list(row.get("locations") or []),
        "role_family": row.get("role_family"),
        "seniority_level": row.get("seniority_level") or "intern",
        "min_years_experience": row.get("min_years_experience"),
        "max_years_experience": row.get("max_years_experience"),
        "source_url": row.get("apply_url"),
        **when.card(),
        "is_active": bool(row.get("is_active", True)),
        "skills": skills[:8],
        "matched_skills": [],
        "matched_skill_count": 0,
        "target_role_match": 0,
        **hosted_fields(row),
    }


def dismissed_job_ids(db: Any, user_id: str) -> set[str]:
    rows = (
        db.table("user_dismissed_job_cards")
        .select("job_id")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    return {str(row["job_id"]) for row in rows if row.get("job_id")}


def without_dismissed(
    cards: list[dict[str, Any]],
    dismissed: set[str],
) -> list[dict[str, Any]]:
    if not dismissed:
        return cards
    return [card for card in cards if str(card.get("job_id") or "") not in dismissed]


def list_internships(db: Any, *, venue: str | None = None, limit: int = 60) -> list[dict[str, Any]]:
    query = live_only(db.table("jobs").select(_SELECT)).limit(limit)
    if venue == "myro":
        query = query.eq("listing_venue", "myro")
    else:
        query = query.or_(_INTERN_OR)
    rows = query.order("first_seen", desc=True).execute().data or []
    now = datetime.now(timezone.utc)
    return [intern_card(row, now=now) for row in rows if is_intern_job(row) or (row.get("listing_venue") == "myro")]


def get_internship(db: Any, job_id: str) -> dict[str, Any] | None:
    rows = (
        live_only(db.table("jobs").select(_SELECT).eq("job_id", job_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    card = intern_card(rows[0], now=datetime.now(timezone.utc))
    if card["listing_venue"] != "myro" and not is_intern_job(rows[0]):
        return None
    return card


def insert_hosted(db: Any, user_id: str, body: dict[str, Any]) -> dict[str, Any]:
    row = hosted_job_row(user_id, body, now=datetime.now(timezone.utc))
    inserted = db.table("jobs").insert(row).execute().data or []
    saved = inserted[0] if inserted else row
    return intern_card(saved, now=datetime.now(timezone.utc))
