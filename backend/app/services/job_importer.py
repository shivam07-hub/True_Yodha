from __future__ import annotations

import hashlib
import re
from datetime import date
from typing import Any

from app.schemas.jobs import APPLICATION_STATUSES
from app.services.taxonomy_loader import get_all_skills

_NON_WORD = re.compile(r"[^a-z0-9+#. ]+")
_SPACE = re.compile(r"\s+")
_REQUIRED_HINT = re.compile(r"\b(required|must have|mandatory|responsibilities|requirements)\b", re.IGNORECASE)


def normalize_skill_label(label: str) -> str:
    cleaned = _NON_WORD.sub(" ", label.strip().lower())
    return _SPACE.sub(" ", cleaned).strip()


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


def _skill_terms(skill_name: str) -> list[str]:
    terms = [skill_name]
    if "(" in skill_name:
        terms.append(skill_name.split("(", 1)[0].strip())
    cleaned = []
    for term in terms:
        normalized = normalize_skill_label(term)
        if len(normalized) >= 3 or normalized in {"c++", "c#", "go"}:
            cleaned.append(normalized)
    return list(dict.fromkeys(cleaned))


def _contains_term(text: str, term: str) -> bool:
    escaped = re.escape(term)
    return re.search(rf"(?<![a-z0-9+#.]){escaped}(?![a-z0-9+#.])", text) is not None


def _required_zone(job_description: str) -> str:
    lines = [line.strip() for line in job_description.splitlines() if line.strip()]
    selected = [line for line in lines if _REQUIRED_HINT.search(line)]
    if not selected:
        return "\n".join(lines[: max(1, len(lines) // 2)])
    return "\n".join(selected)


def suggest_skills(role_name: str, job_description: str, limit: int = 12) -> dict[str, list[dict[str, Any]]]:
    text = normalize_skill_label(f"{role_name}\n{job_description}")
    primary_text = normalize_skill_label(f"{role_name}\n{_required_zone(job_description)}")

    primary: list[dict[str, Any]] = []
    secondary: list[dict[str, Any]] = []
    seen: set[str] = set()

    for skill in sorted(get_all_skills(), key=lambda item: len(item.name), reverse=True):
        terms = _skill_terms(skill.name)
        if not terms:
            continue
        if not any(_contains_term(text, term) for term in terms):
            continue
        target = primary if any(_contains_term(primary_text, term) for term in terms) else secondary
        if skill.name in seen:
            continue
        target.append(
            {
                "label": skill.name,
                "taxonomy_key": skill.name,
                "confidence": 0.82 if target is primary else 0.68,
            }
        )
        seen.add(skill.name)
        if len(primary) >= limit and len(secondary) >= limit:
            break

    return {
        "primary_skills": primary[:limit],
        "secondary_skills": secondary[:limit],
        "emerging_skills": [],
    }


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

    The repository owns which client writes each table: ``jobs`` and
    ``job_skill_candidates`` are community/scraper-owned (service-role),
    while ``job_applications`` is user-owned (user-token, RLS by user).
    """
    valid_keys = _valid_taxonomy_keys()
    primary, primary_emerging = split_confirmed_skills(body.primary_skills, valid_keys, "primary")
    secondary, secondary_emerging = split_confirmed_skills(body.secondary_skills, valid_keys, "secondary")
    job_id = build_extension_job_id(body.source_url, body.role_name, body.company_name, body.location)

    job_row = {
        "job_id": job_id,
        "job_title": body.role_name.strip(),
        "company_name": body.company_name,
        "industry": None,
        "location": body.location,
        "apply_url": body.source_url,
        "source_url": body.source_url,
        "source_platform": body.source_platform or "generic",
        "job_description": body.job_description.strip(),
        "main_skills": primary,
        "side_skills": secondary,
        "batch_date": int(date.today().strftime("%Y%m%d")),
        "ingestion_source": "extension",
        "quality_status": "user_confirmed",
        "created_by_user_id": user_id,
    }

    emerging_inputs = list(body.emerging_skills) + primary_emerging + secondary_emerging
    candidate_rows = _emerging_payloads(job_id, user_id, body.source_platform or "generic", emerging_inputs)

    status = getattr(body, "status", None) or "saved"
    if status not in APPLICATION_STATUSES:
        status = "saved"

    return {
        "job_id": job_id,
        "job_row": job_row,
        "candidate_rows": candidate_rows,
        "application_row": {"user_id": user_id, "job_id": job_id, "status": status},
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
        "applied_at": row.get("applied_at"),
        "response_at": row.get("response_at"),
        "checkin_sent_at": row.get("checkin_sent_at"),
        "notes": row.get("notes"),
        "created_at": row.get("created_at"),
    }
