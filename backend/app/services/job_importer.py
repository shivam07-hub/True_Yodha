from __future__ import annotations

import hashlib
from datetime import date
from typing import Any

from supabase import Client

from app.schemas.jobs import APPLICATION_STATUSES
from app.services import skill_floor
from app.services.job_extract_backstop import is_valid_company, is_valid_location
from app.services.skill_extraction import (
    ExtractedSkill,
    extract_skills,
    merge_zones,
    normalize_skill_label,
    suggest_skills,
)
from app.services.taxonomy_loader import get_all_skills

__all__ = [
    "build_extension_job_id",
    "build_imported_job",
    "normalize_skill_label",
    "preview_imported_job",
    "shape_application_response",
    "split_confirmed_skills",
    "suggest_skills",
]


def _safe_company(value: Any) -> str:
    """A non-null, non-junk company for the NOT-NULL jobs.company_name column."""
    text = (str(value or "")).strip()
    return text if is_valid_company(text) else "Unknown company"


def _absent_or(value: Any) -> str | None:
    """A real location, or NULL. Never a word standing in for one."""
    text = (str(value or "")).strip()
    return text if is_valid_location(text) else None


def _dedupe_key(label: str) -> str:
    return normalize_skill_label(label).replace(" ", "")


def build_extension_job_id(
    source_url: str | None,
    role_name: str,
    company_name: str | None,
    location: str | None,
) -> str:
    source = (source_url or "").strip().lower()
    if not source:
        source = "|".join(
            [
                (role_name or "").strip().lower(),
                (company_name or "").strip().lower(),
                (location or "").strip().lower(),
            ]
        )
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:20]
    return f"ext_{digest}"


def split_confirmed_skills(
    skills: list[str],
    valid_taxonomy_keys: set[str],
    skill_type: str,
) -> tuple[list[str], list[dict[str, str]]]:
    canonical: list[str] = []
    emerging: list[dict[str, str]] = []
    seen_canonical: set[str] = set()
    seen_emerging: set[str] = set()

    for raw in skills:
        label = raw.strip()
        if not label:
            continue
        if label in valid_taxonomy_keys:
            if label not in seen_canonical:
                canonical.append(label)
                seen_canonical.add(label)
            continue

        normalized = normalize_skill_label(label)
        dedupe_key = _dedupe_key(label)
        if normalized and dedupe_key not in seen_emerging:
            emerging.append({"label": label, "skill_type": skill_type, "source": "user_added"})
            seen_emerging.add(dedupe_key)

    return canonical, emerging


def _valid_taxonomy_keys() -> set[str]:
    return {skill.name for skill in get_all_skills()}


def _today_marker() -> int:
    """Today as the YYYYMMDD int the `jobs` feed columns store.

    `first_seen` / `last_seen` / `batch_date` are integer date markers, not
    timestamps — see `_fresh_cutoff_marker` in the jobs repository, which
    compares against exactly this shape.
    """
    return int(date.today().strftime("%Y%m%d"))


def _canonical_skill_rows(
    primary: list[str], secondary: list[str], *, role_name: str, job_description: str
) -> tuple[list[ExtractedSkill], str]:
    """The skills to persist for one imported job, and where they came from.

    A contributor's own confirmation outranks anything we could infer, so the
    payload's lists win when it has them. `merge_zones` keeps a key that appears
    in both lists once, at its stronger claim — `job_skills` is UNIQUE on
    (job_id, skill_id) and Postgres errors on a duplicate inside one upsert
    batch rather than deduping it.

    When the payload confirms nothing, the job's own text is read instead. That
    is the floor: an import arriving with empty skill lists must still be
    matchable, because a job with no skills reaches nobody. Two prod extension
    rows are in exactly that state and cannot be repaired from stored arrays —
    they have none.
    """
    confirmed = [
        ExtractedSkill(
            taxonomy_key=key,
            zone="must_have" if is_must else "preferred",
            required_level=4 if is_must else 2,
            confidence=0.9,
        )
        for is_must, keys in ((True, primary), (False, secondary))
        for key in keys
    ]
    if confirmed:
        return merge_zones(confirmed), skill_floor.USER_CONFIRMED
    return extract_skills(role_name, job_description), skill_floor.STAGE_A


def preview_imported_job(db: Client, body: Any) -> dict[str, Any]:
    suggestions = suggest_skills(body.role_name, body.job_description)
    warnings = []
    if not suggestions["primary_skills"] and not suggestions["secondary_skills"]:
        warnings.append("No taxonomy skills were confidently detected. Add skills manually before saving.")

    return {
        "role_name": body.role_name,
        "company_name": body.company_name,
        "location": body.location,
        "job_description": body.job_description,
        **suggestions,
        "warnings": warnings,
    }


def _emerging_payloads(
    job_id: str,
    user_id: str,
    source_platform: str | None,
    emerging_skills: list[Any],
) -> list[dict[str, Any]]:
    payloads: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for item in emerging_skills:
        label = (getattr(item, "label", None) or item.get("label", "")).strip()
        skill_type = getattr(item, "skill_type", None) or item.get("skill_type", "secondary")
        source = getattr(item, "source", None) or item.get("source", "user_added")
        normalized = normalize_skill_label(label)
        if not label or skill_type not in {"primary", "secondary"} or not normalized:
            continue
        key = (normalized, skill_type)
        if key in seen:
            continue
        seen.add(key)
        payloads.append(
            {
                "job_id": job_id,
                "user_id": user_id,
                "raw_label": label,
                "normalized_label": normalized,
                "skill_type": skill_type,
                "source": source if source in {"user_added", "llm_suggested", "page_extracted"} else "user_added",
                "source_platform": source_platform,
                "confidence": None,
                "occurrence_count": 1,
                "status": "unmapped",
            }
        )
    return payloads


def build_imported_job(user_id: str, body: Any) -> dict[str, Any]:
    """Shape the rows for an extension-imported job. Pure — no DB access.

    The repository owns which client writes each table: ``jobs``, ``job_skills``
    and ``job_skill_candidates`` are community/scraper-owned (service-role),
    while ``job_applications`` is user-owned (user-token, RLS by user).

    ``skill_rows`` carries taxonomy KEYS, not ``skills.id`` — resolving an id is
    a DB read and this function stays pure. The repository resolves them.
    """
    valid_keys = _valid_taxonomy_keys()
    primary, primary_emerging = split_confirmed_skills(body.primary_skills, valid_keys, "primary")
    secondary, secondary_emerging = split_confirmed_skills(body.secondary_skills, valid_keys, "secondary")
    job_id = build_extension_job_id(body.source_url, body.role_name, body.company_name, body.location)

    job_row = {
        "job_id": job_id,
        "job_title": body.role_name.strip(),
        # Integrity boundary: never persist a junk company ("Job ID: 10426211")
        # or a null into the NOT-NULL columns — coerce to safe sentinels. The
        # backstop should have produced a real value by now; this is the net.
        "company_name": _safe_company(body.company_name),
        "industry": "unknown",
        # Absent, not "unknown". The column was NOT NULL, so this minted a
        # sentinel that then printed as the job's location on 6 of 20 extension
        # imports; 20260905090000 widened it so absence can be recorded as
        # absence. `is_valid_location` also rejects placeholders now, so a page
        # that literally says "Unknown" cannot re-enter through the backstop.
        "location": _absent_or(body.location),
        "apply_url": body.source_url,
        "source_url": body.source_url,
        "source_platform": body.source_platform or "generic",
        "job_description": body.job_description.strip(),
        "main_skills": primary,
        "side_skills": secondary,
        # A user importing from the listing page IS an observation of it. Leaving
        # these NULL parked every imported job below every freshness floor and
        # out of every "newest first" order — the scraper stamps the same three
        # markers on ingest and nothing else backfills them.
        "first_seen": _today_marker(),
        "last_seen": _today_marker(),
        "batch_date": _today_marker(),
        "ingestion_source": "extension",
        "quality_status": "user_confirmed",
        "created_by_user_id": user_id,
    }

    skill_rows, skill_source = _canonical_skill_rows(
        primary, secondary, role_name=body.role_name, job_description=body.job_description
    )

    emerging_inputs = list(body.emerging_skills) + primary_emerging + secondary_emerging
    candidate_rows = _emerging_payloads(job_id, user_id, body.source_platform or "generic", emerging_inputs)

    status = getattr(body, "status", None) or "saved"
    if status not in APPLICATION_STATUSES:
        status = "saved"

    return {
        "job_id": job_id,
        "job_row": job_row,
        # Canonical rows are what the matcher's candidate pool is built from
        # (`get_candidate_job_ids_for_skills` → job_skills). `candidate_rows` is
        # the OTHER half: labels the taxonomy does not know yet, which can never
        # become a match until they are mapped.
        "skill_rows": skill_rows,
        "skill_source": skill_source,
        "candidate_rows": candidate_rows,
        # An extension/import is the user's OWN discovery — never a Myro match.
        # Labelling it user_discovery is what makes it surface in Liked/All
        # (buildFeed) instead of silently claiming to be a "Myro found" match.
        "application_row": {"user_id": user_id, "job_id": job_id, "status": status, "source": "user_discovery"},
        "status": status,
    }


def shape_application_response(row: dict[str, Any], job_id: str, body: Any, status: str) -> dict[str, Any]:
    """Pure projection of a job_applications row (+ joined job) to the API shape."""
    job = row.get("jobs") or {}
    return {
        "id": row.get("id", 0),
        "job_id": job_id,
        "title": job.get("job_title") or body.role_name.strip(),
        "company": job.get("company_name") or body.company_name,
        "job_description": job.get("job_description") or body.job_description.strip(),
        "status": row.get("status", status),
        "source": row.get("source", "user_discovery"),
        "applied_at": row.get("applied_at"),
        "response_at": row.get("response_at"),
        "checkin_sent_at": row.get("checkin_sent_at"),
        "notes": row.get("notes"),
        "created_at": row.get("created_at"),
    }
