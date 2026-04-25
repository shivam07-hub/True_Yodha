from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from openai import OpenAI
from supabase import Client

from app.config import settings

CONTENT_DIR = Path(__file__).resolve().parents[1] / "content" / "job_path"
AI_POLISH_LIMIT = 3
_OR_HEADERS = {"HTTP-Referer": "https://truemirror.vercel.app", "X-Title": "Truth Mirror"}
_OR_BASE = "https://openrouter.ai/api/v1"
_GROQ_BASE = "https://api.groq.com/openai/v1"
_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/"
_POLISH_MAX_TOKENS = 4096

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class QualityGateResult:
    accepted: bool
    reason: str | None = None


def _load_json(name: str) -> dict[str, Any]:
    with open(CONTENT_DIR / name, encoding="utf-8") as handle:
        return json.load(handle)


def _load_text(name: str) -> str:
    with open(CONTENT_DIR / name, encoding="utf-8") as handle:
        return handle.read()


def content_bundle() -> dict[str, Any]:
    return {
        "milestone_templates": _load_json("milestone_templates.json"),
        "readiness_tiers": _load_json("readiness_tiers.json"),
        "cv_confidence_labels": _load_json("cv_confidence_labels.json"),
        "follow_up_playbooks": _load_json("follow_up_playbooks.json"),
        "job_card_copy": _load_json("job_card_copy.json"),
        "ai_polish_prompt": _load_text("ai_polish_prompt.md"),
    }


def _key(value: str | None) -> str:
    return (value or "").strip().lower()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_datetime(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _readiness_content() -> dict[str, Any]:
    return _load_json("readiness_tiers.json")


def _tier_for_pct(pct: int) -> dict[str, Any]:
    tiers = _readiness_content()["tiers"]
    for tier in tiers:
        lo, hi = tier["range"]
        if lo <= pct <= hi:
            return tier
    return tiers[-1]


def compute_readiness(
    main_skills: list[str],
    side_skills: list[str],
    user_skill_levels: dict[str, int],
    targets: list[dict[str, Any]],
    completed_proof_counts: dict[str, int],
) -> dict[str, Any]:
    math = _readiness_content()["math"]
    target_keys = {_key(item.get("skill")) for item in targets}
    proof_keys = {skill_key for skill_key, count in completed_proof_counts.items() if count > 0}

    weighted_total = 0.0
    weighted_credit = 0.0
    ordered_skills: list[tuple[str, bool]] = []
    seen: set[str] = set()
    for skill in main_skills:
        if _key(skill) and _key(skill) not in seen:
            ordered_skills.append((skill, True))
            seen.add(_key(skill))
    for skill in side_skills:
        if _key(skill) and _key(skill) not in seen:
            ordered_skills.append((skill, False))
            seen.add(_key(skill))

    for skill, is_primary in ordered_skills:
        skill_key = _key(skill)
        weight = math["primary_weight"] if is_primary else math["secondary_weight"]
        weighted_total += float(weight)
        if skill_key in user_skill_levels and user_skill_levels[skill_key] > 0:
            credit = math["existing_skill_credit"]
        elif skill_key in proof_keys:
            credit = math["target_with_proof_credit"]
        elif skill_key in target_keys:
            credit = math["target_no_proof_credit"]
        else:
            credit = 0.0
        weighted_credit += float(credit) * float(weight)

    pct = round((weighted_credit / weighted_total) * 100) if weighted_total else 0
    pct = max(0, min(100, pct))
    return {
        "readiness_pct": pct,
        "tier": _tier_for_pct(pct),
    }


def _skill_family(skill: str) -> str:
    text = _key(skill)
    analytics_terms = ("sql", "data", "analytics", "metric", "forecast", "experiment", "statistics")
    product_terms = ("product", "roadmap", "user", "priorit", "market", "strategy")
    leadership_terms = ("leadership", "stakeholder", "management", "mentor", "ownership")
    communication_terms = ("communication", "writing", "presentation", "storytelling", "negotiation")
    if any(term in text for term in analytics_terms):
        return "analytics"
    if any(term in text for term in product_terms):
        return "product"
    if any(term in text for term in leadership_terms):
        return "leadership"
    if any(term in text for term in communication_terms):
        return "communication"
    return "technical"


def _fill_slots(text: str, *, skill: str, job_title: str, company: str) -> str:
    return (
        text.replace("{skill}", skill)
        .replace("{job_title}", job_title)
        .replace("{company}", company or "the company")
    )


def build_rolling_milestones(
    user_id: str,
    job_id: str,
    job_title: str,
    company: str | None,
    targets: list[dict[str, Any]],
    start_date: date | None = None,
    days: int = 7,
) -> list[dict[str, Any]]:
    content = _load_json("milestone_templates.json")
    start = start_date or date.today()
    normalized_targets = [
        {"skill": item["skill"], "is_primary": bool(item.get("is_primary"))}
        for item in targets
        if item.get("skill")
    ]
    if not normalized_targets:
        return []

    weighted: list[dict[str, Any]] = []
    for target in sorted(normalized_targets, key=lambda item: (not item["is_primary"], _key(item["skill"]))):
        weighted.extend([target] * (2 if target["is_primary"] else 1))

    seed = int(hashlib.sha256(f"{user_id}|{job_id}|{start.isoformat()}".encode()).hexdigest()[:8], 16)
    index = seed % len(weighted)
    last_skill: str | None = None
    template_indices: dict[str, int] = {}
    milestones: list[dict[str, Any]] = []

    for offset in range(days):
        chosen = weighted[index % len(weighted)]
        attempts = 0
        while len({item["skill"] for item in normalized_targets}) > 1 and chosen["skill"] == last_skill and attempts < len(weighted):
            index += 1
            chosen = weighted[index % len(weighted)]
            attempts += 1
        index += 1
        last_skill = chosen["skill"]

        family = _skill_family(chosen["skill"])
        templates = content["families"][family]["templates"]
        template_index = template_indices.get(family, 0)
        template = templates[template_index % len(templates)]
        template_indices[family] = template_index + 1

        slots = {
            "skill": chosen["skill"],
            "job_title": job_title,
            "company": company or "the company",
        }
        milestones.append(
            {
                "milestone_date": (start + timedelta(days=offset)).isoformat(),
                "skill": chosen["skill"],
                "is_primary": chosen["is_primary"],
                "template_id": template["id"],
                "title": _fill_slots(template["title"], **slots),
                "action": _fill_slots(template["action"], **slots),
                "proof_prompt": _fill_slots(template["proof_prompt"], **slots),
                "impact_prompt": _fill_slots(template["impact_prompt"], **slots),
                "expected_minutes": template.get("expected_minutes"),
            }
        )

    return milestones


def cv_confidence_for_proof_count(proof_count: int) -> dict[str, Any]:
    labels = _load_json("cv_confidence_labels.json")["labels"]
    if proof_count <= 0:
        target_id = "starter"
    elif proof_count < 3:
        target_id = "proof_backed"
    else:
        target_id = "strong_evidence"
    return next(label for label in labels if label["id"] == target_id)


def select_follow_up_playbook(
    status: str,
    applied_at: str | datetime | None,
    response_at: str | datetime | None,
) -> dict[str, Any] | None:
    applied_dt = _parse_datetime(applied_at)
    response_dt = _parse_datetime(response_at)
    days_since_applied = 0
    if applied_dt:
        days_since_applied = (datetime.now(timezone.utc) - applied_dt).days

    playbooks = _load_json("follow_up_playbooks.json")["playbooks"]
    priority = [
        ("offer", status == "offer"),
        ("interview", status in {"interviewing", "interview_scheduled"}),
        ("rejection", status == "rejected"),
        ("abandoned", status in {"abandoned"} or (status == "applied" and days_since_applied >= 21 and response_dt is None)),
        ("no_response", status == "no_response" or (status == "applied" and days_since_applied >= 7 and response_dt is None)),
    ]
    for key, matched in priority:
        if matched:
            return {"id": key, **playbooks[key]}
    return None


def _word_count(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


def polish_output_passes_quality_gates(
    output: str,
    baseline_text: str,
    inputs: dict[str, Any],
) -> QualityGateResult:
    lowered = output.lower()
    banned = ["world-class", "rockstar", "ninja", "guru", "synergy", "leveraged cutting-edge"]
    if any(phrase in lowered for phrase in banned):
        return QualityGateResult(False, "banned_phrase")
    if "```" in output or re.search(r"^#{1,6}\s", output, flags=re.MULTILINE):
        return QualityGateResult(False, "markdown_output")
    baseline_words = max(1, _word_count(baseline_text))
    if _word_count(output) > baseline_words * 1.25:
        return QualityGateResult(False, "too_long")

    allowed_text = "\n".join(
        [
            str(inputs.get("baseline_text") or ""),
            str(inputs.get("job_description") or ""),
            " ".join(inputs.get("target_skills") or []),
            " ".join(inputs.get("proof_texts") or []),
        ]
    ).lower()
    metrics = re.findall(r"\b\d+(?:\.\d+)?%?\b", output)
    for metric in metrics:
        if metric.lower() not in allowed_text:
            return QualityGateResult(False, "invented_metric")
    baseline_tokens = {token for token in re.findall(r"\b[a-zA-Z][a-zA-Z0-9+#.-]{3,}\b", baseline_text.lower())}
    if baseline_tokens:
        output_tokens = set(re.findall(r"\b[a-zA-Z][a-zA-Z0-9+#.-]{3,}\b", lowered))
        retained_ratio = len(baseline_tokens & output_tokens) / len(baseline_tokens)
        if retained_ratio < 0.7:
            return QualityGateResult(False, "removed_factual_content")
    return QualityGateResult(True)


def _single_or_none(query) -> dict[str, Any] | None:
    result = query.execute()
    return result.data if isinstance(result.data, dict) else (result.data[0] if result.data else None)


def _get_job(db: Client, job_id: str) -> dict[str, Any]:
    row = _single_or_none(
        db.table("jobs")
        .select("job_id, job_title, company_name, apply_url, job_description, main_skills, side_skills")
        .eq("job_id", job_id)
        .limit(1)
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return row


def _ensure_application(db: Client, user_id: str, job_id: str) -> dict[str, Any]:
    row = _single_or_none(
        db.table("job_applications")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .limit(1)
    )
    if row:
        return row
    inserted = db.table("job_applications").insert(
        {"user_id": user_id, "job_id": job_id, "status": "pending"}
    ).execute()
    return inserted.data[0] if inserted.data else {"user_id": user_id, "job_id": job_id, "status": "pending"}


def _user_skill_levels(db: Client, user_id: str) -> dict[str, int]:
    result = (
        db.table("user_skills")
        .select("matched_level, skills(taxonomy_key)")
        .eq("user_id", user_id)
        .execute()
    )
    levels: dict[str, int] = {}
    for row in result.data or []:
        skill = row.get("skills") or {}
        key = _key(skill.get("taxonomy_key"))
        if key:
            levels[key] = int(row.get("matched_level") or 0)
    return levels


def _fetch_targets(db: Client, user_id: str, job_id: str) -> list[dict[str, Any]]:
    result = (
        db.table("job_application_skill_targets")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .order("selected_at")
        .execute()
    )
    return result.data or []


def _fetch_milestones(db: Client, user_id: str, job_id: str) -> list[dict[str, Any]]:
    result = (
        db.table("job_application_milestones")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .order("milestone_date")
        .execute()
    )
    return result.data or []


def _completed_proof_counts(milestones: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in milestones:
        if row.get("completed_at"):
            counts[_key(row.get("skill"))] = counts.get(_key(row.get("skill")), 0) + 1
    return counts


def _target_response(targets: list[dict[str, Any]], proof_counts: dict[str, int]) -> list[dict[str, Any]]:
    return [
        {
            "skill": row["skill"],
            "is_primary": bool(row.get("is_primary")),
            "selected_at": row.get("selected_at"),
            "proof_count": proof_counts.get(_key(row.get("skill")), 0),
        }
        for row in targets
    ]


def _milestone_response(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "milestone_date": row["milestone_date"],
        "skill": row["skill"],
        "is_primary": bool(row.get("is_primary")),
        "template_id": row.get("template_id"),
        "title": row["title"],
        "action": row["action"],
        "proof_prompt": row.get("proof_prompt"),
        "impact_prompt": row.get("impact_prompt"),
        "proof": row.get("proof"),
        "impact": row.get("impact"),
        "confidence": row.get("confidence"),
        "completed_at": row.get("completed_at"),
    }


def _latest_cv_variant(db: Client, user_id: str, job_id: str) -> dict[str, Any] | None:
    return _single_or_none(
        db.table("job_cv_variants")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .order("created_at", desc=True)
        .limit(1)
    )


def _cv_summary(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    confidence = cv_confidence_for_proof_count(int(row.get("proof_count") or 0))
    return {
        "id": row.get("id"),
        "confidence": confidence,
        "snapshot_hash": row.get("snapshot_hash"),
        "ai_polished": bool(row.get("ai_polished")),
        "created_at": row.get("created_at"),
    }


def get_application_path(db: Client, user_id: str, job_id: str) -> dict[str, Any]:
    job = _get_job(db, job_id)
    application = _ensure_application(db, user_id, job_id)
    targets = _fetch_targets(db, user_id, job_id)
    milestones = _fetch_milestones(db, user_id, job_id)
    proof_counts = _completed_proof_counts(milestones)
    readiness = compute_readiness(
        main_skills=job.get("main_skills") or [],
        side_skills=job.get("side_skills") or [],
        user_skill_levels=_user_skill_levels(db, user_id),
        targets=targets,
        completed_proof_counts=proof_counts,
    )
    today = date.today().isoformat()
    today_milestone = next((row for row in milestones if str(row.get("milestone_date"))[:10] == today), None)
    follow_up = select_follow_up_playbook(
        status=application.get("status") or "pending",
        applied_at=application.get("applied_at"),
        response_at=application.get("response_at"),
    )
    return {
        "job_id": job_id,
        "job_title": job.get("job_title") or "",
        "company": job.get("company_name"),
        "readiness_pct": readiness["readiness_pct"],
        "readiness_tier": readiness["tier"],
        "target_skills": _target_response(targets, proof_counts),
        "milestones": [_milestone_response(row) for row in milestones],
        "today_milestone": _milestone_response(today_milestone) if today_milestone else None,
        "cv": _cv_summary(_latest_cv_variant(db, user_id, job_id)),
        "follow_up": follow_up,
        "status": application.get("status") or "pending",
        "applied_at": application.get("applied_at"),
    }


def _validate_targets(job: dict[str, Any], targets: list[Any]) -> list[dict[str, Any]]:
    valid_primary = {_key(skill): skill for skill in job.get("main_skills") or []}
    valid_secondary = {_key(skill): skill for skill in job.get("side_skills") or []}
    valid_all = {**valid_secondary, **valid_primary}
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in targets:
        skill = (getattr(item, "skill", None) or item.get("skill", "")).strip()
        skill_key = _key(skill)
        if not skill_key or skill_key in seen:
            continue
        if skill_key not in valid_all:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target skill is not part of this job: {skill}",
            )
        normalized.append(
            {
                "skill": valid_all[skill_key],
                "is_primary": skill_key in valid_primary,
            }
        )
        seen.add(skill_key)
    return normalized


def _seed_milestones(db: Client, user_id: str, job: dict[str, Any], targets: list[dict[str, Any]]) -> None:
    job_id = job["job_id"]
    (
        db.table("job_application_milestones")
        .delete()
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .gte("milestone_date", date.today().isoformat())
        .is_("completed_at", "null")
        .execute()
    )
    milestones = build_rolling_milestones(
        user_id=user_id,
        job_id=job_id,
        job_title=job.get("job_title") or "this role",
        company=job.get("company_name"),
        targets=targets,
    )
    rows = [
        {
            "user_id": user_id,
            "job_id": job_id,
            **milestone,
            "confidence": 0.6,
            "updated_at": _now_iso(),
        }
        for milestone in milestones
    ]
    if rows:
        db.table("job_application_milestones").upsert(
            rows,
            on_conflict="user_id,job_id,milestone_date",
        ).execute()


def replace_skill_targets(db: Client, user_id: str, job_id: str, targets: list[Any]) -> dict[str, Any]:
    job = _get_job(db, job_id)
    _ensure_application(db, user_id, job_id)
    normalized = _validate_targets(job, targets)
    db.table("job_application_skill_targets").delete().eq("user_id", user_id).eq("job_id", job_id).execute()
    now = _now_iso()
    rows = [
        {
            "user_id": user_id,
            "job_id": job_id,
            "skill": item["skill"],
            "is_primary": item["is_primary"],
            "selected_at": now,
        }
        for item in normalized
    ]
    if rows:
        db.table("job_application_skill_targets").upsert(
            rows,
            on_conflict="user_id,job_id,skill",
        ).execute()
    _seed_milestones(db, user_id, job, normalized)
    return get_application_path(db, user_id, job_id)


def update_milestone(
    db: Client,
    user_id: str,
    job_id: str,
    milestone_id: str,
    body: Any,
) -> dict[str, Any]:
    updates: dict[str, Any] = {"updated_at": _now_iso()}
    if body.proof is not None:
        updates["proof"] = body.proof.strip() or None
    if body.impact is not None:
        updates["impact"] = body.impact.strip() or None
    if body.confidence is not None:
        updates["confidence"] = max(0.0, min(1.0, float(body.confidence)))
    if body.completed:
        updates["completed_at"] = _now_iso()
    result = (
        db.table("job_application_milestones")
        .update(updates)
        .eq("id", milestone_id)
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .execute()
    )
    row = result.data[0] if result.data else _single_or_none(
        db.table("job_application_milestones")
        .select("*")
        .eq("id", milestone_id)
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .limit(1)
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found.")
    return _milestone_response(row)


def _latest_cv_history(db: Client, user_id: str) -> dict[str, Any] | None:
    return _single_or_none(
        db.table("cv_history")
        .select("*")
        .eq("user_id", user_id)
        .order("version_number", desc=True)
        .limit(1)
    )


def _profile_cv_text(db: Client, user_id: str) -> str | None:
    row = _single_or_none(
        db.table("user_profiles")
        .select("cv_raw_text")
        .eq("id", user_id)
        .limit(1)
    )
    return (row or {}).get("cv_raw_text")


def _completed_milestones(milestones: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = [row for row in milestones if row.get("completed_at")]
    return sorted(rows, key=lambda row: str(row.get("completed_at") or ""))


def _snapshot_hash(
    user_id: str,
    job_id: str,
    cv_version: int,
    completed: list[dict[str, Any]],
) -> str:
    proof_payload = [
        {
            "id": str(row.get("id")),
            "skill": row.get("skill"),
            "proof": row.get("proof"),
            "impact": row.get("impact"),
            "completed_at": row.get("completed_at"),
        }
        for row in completed
    ]
    raw = json.dumps(
        {
            "user_id": user_id,
            "job_id": job_id,
            "cv_version": cv_version,
            "proofs": proof_payload,
        },
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _build_deterministic_cv(
    baseline_text: str,
    job: dict[str, Any],
    targets: list[dict[str, Any]],
    completed: list[dict[str, Any]],
    confidence: dict[str, Any],
) -> str:
    lines = [
        f"{confidence['label']} for {job.get('job_title') or 'Tracked role'}",
        "",
        "Job fit focus",
        f"Company: {job.get('company_name') or 'Unknown'}",
        f"Role: {job.get('job_title') or 'Tracked role'}",
        "",
        "Target skills",
    ]
    if targets:
        for target in targets:
            marker = "primary" if target.get("is_primary") else "secondary"
            lines.append(f"- {target['skill']} ({marker})")
    else:
        lines.append("- No target skills selected yet.")

    lines.extend(["", "Completed proof for this job"])
    if completed:
        for row in completed:
            parts = [f"- {row.get('skill')}: {row.get('proof') or 'Proof logged'}"]
            if row.get("impact"):
                parts.append(f"Impact: {row['impact']}.")
            lines.append(" ".join(parts))
    else:
        lines.append("- No job-scoped proof logged yet. This is a starter CV.")

    lines.extend(["", "Baseline CV", baseline_text.strip()])
    return "\n".join(lines).strip() + "\n"


def _polish_providers() -> list[tuple[OpenAI, str]]:
    providers: list[tuple[OpenAI, str]] = []
    if settings.openrouter_api_key:
        providers.append((OpenAI(api_key=settings.openrouter_api_key, base_url=_OR_BASE, default_headers=_OR_HEADERS), "openai/gpt-4o-mini"))
    if settings.groq_api_key:
        providers.append((OpenAI(api_key=settings.groq_api_key, base_url=_GROQ_BASE), "llama-3.3-70b-versatile"))
    if settings.google_api_key:
        providers.append((OpenAI(api_key=settings.google_api_key, base_url=_GEMINI_BASE), "gemini-2.0-flash-lite"))
    if settings.openrouter_api_key:
        providers.append((OpenAI(api_key=settings.openrouter_api_key, base_url=_OR_BASE, default_headers=_OR_HEADERS), "meta-llama/llama-3.3-70b-instruct:free"))
    return providers


def _prompt_section(prompt_doc: str, start_heading: str, end_heading: str | None = None) -> str:
    start = prompt_doc.find(start_heading)
    if start == -1:
        return prompt_doc
    start += len(start_heading)
    end = prompt_doc.find(end_heading, start) if end_heading else -1
    return prompt_doc[start:end if end != -1 else None].strip()


def _build_polish_messages(
    baseline_text: str,
    job: dict[str, Any],
    targets: list[dict[str, Any]],
    completed: list[dict[str, Any]],
) -> list[dict[str, str]]:
    prompt_doc = _load_text("ai_polish_prompt.md")
    system_prompt = _prompt_section(prompt_doc, "## System Prompt", "## User Prompt Template")
    proof_payload = [
        {
            "skill": row.get("skill"),
            "proof": row.get("proof"),
            "impact": row.get("impact"),
            "confidence": row.get("confidence"),
            "completed_at": row.get("completed_at"),
        }
        for row in completed
    ]
    user_prompt = f"""BASELINE CV:
<<<
{baseline_text}
>>>

JOB DESCRIPTION:
<<<
{job.get("job_description") or ""}
>>>

SELECTED TARGET SKILLS:
{json.dumps([row.get("skill") for row in targets], ensure_ascii=False)}

COMPLETED MILESTONE PROOF (for this job only):
{json.dumps(proof_payload, ensure_ascii=False)}

Return the polished CV text now. No preamble. No commentary."""
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _call_ai_polish(
    baseline_text: str,
    job: dict[str, Any],
    targets: list[dict[str, Any]],
    completed: list[dict[str, Any]],
) -> str | None:
    providers = _polish_providers()
    if not providers:
        logger.info("No LLM configured for CV polish.")
        return None
    messages = _build_polish_messages(baseline_text, job, targets, completed)
    for client, model in providers:
        try:
            response = client.chat.completions.create(
                model=model,
                max_tokens=_POLISH_MAX_TOKENS,
                messages=messages,
            )
            content = response.choices[0].message.content or ""
        except Exception as exc:
            logger.warning("CV polish failed with %s: %s", model, exc)
            continue
        cleaned = content.strip()
        if cleaned:
            return cleaned
    return None


def _ai_polish_count(db: Client, user_id: str) -> int:
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    result = (
        db.table("job_cv_variants")
        .select("id")
        .eq("user_id", user_id)
        .eq("ai_polished", True)
        .gte("ai_polish_used_at", since)
        .execute()
    )
    return len(result.data or [])


def _latest_polished_cv(db: Client, user_id: str, job_id: str) -> dict[str, Any] | None:
    return _single_or_none(
        db.table("job_cv_variants")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .eq("ai_polished", True)
        .order("created_at", desc=True)
        .limit(1)
    )


def generate_job_cv(
    db: Client,
    user_id: str,
    job_id: str,
    ai_polish: bool = False,
) -> dict[str, Any]:
    job = _get_job(db, job_id)
    _ensure_application(db, user_id, job_id)
    latest_cv = _latest_cv_history(db, user_id)
    baseline_text = (latest_cv or {}).get("cv_raw_text") or _profile_cv_text(db, user_id)
    if not baseline_text:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload a baseline CV first.")

    cv_version = int((latest_cv or {}).get("version_number") or 1)
    targets = _fetch_targets(db, user_id, job_id)
    completed = _completed_milestones(_fetch_milestones(db, user_id, job_id))
    proof_count = len(completed)
    confidence = cv_confidence_for_proof_count(proof_count)
    snapshot_hash = _snapshot_hash(user_id, job_id, cv_version, completed)

    cached = _single_or_none(
        db.table("job_cv_variants")
        .select("*")
        .eq("user_id", user_id)
        .eq("job_id", job_id)
        .eq("snapshot_hash", snapshot_hash)
        .limit(1)
    )
    polish_used = _ai_polish_count(db, user_id)
    if cached and (not ai_polish or cached.get("polished_text")):
        return {
            "id": cached["id"],
            "job_id": job_id,
            "cv_text": cached.get("deterministic_text"),
            "polished_text": cached.get("polished_text"),
            "confidence": confidence,
            "snapshot_hash": snapshot_hash,
            "from_cache": True,
            "ai_polish_used": polish_used,
            "ai_polish_limit": AI_POLISH_LIMIT,
            "limit_reached": False,
            "polish_unavailable": False,
        }

    deterministic_text = _build_deterministic_cv(baseline_text, job, targets, completed, confidence)
    limit_reached = bool(ai_polish and polish_used >= AI_POLISH_LIMIT)

    payload = {
        "user_id": user_id,
        "job_id": job_id,
        "cv_version_number": cv_version,
        "confidence_label": confidence["id"],
        "deterministic_text": deterministic_text,
        "polished_text": None,
        "snapshot_hash": snapshot_hash,
        "proof_count": proof_count,
        "ai_polished": False,
        "ai_polish_used_at": None,
    }

    if not cached:
        insert_result = db.table("job_cv_variants").insert(payload).execute()
        cached = insert_result.data[0] if insert_result.data else {**payload, "id": 0}
    row = cached

    if limit_reached:
        fallback = _latest_polished_cv(db, user_id, job_id)
        if fallback and fallback.get("polished_text"):
            return {
                "id": fallback.get("id", row.get("id", 0)),
                "job_id": job_id,
                "cv_text": fallback.get("deterministic_text") or deterministic_text,
                "polished_text": fallback.get("polished_text"),
                "confidence": confidence,
                "snapshot_hash": snapshot_hash,
                "from_cache": True,
                "ai_polish_used": polish_used,
                "ai_polish_limit": AI_POLISH_LIMIT,
                "limit_reached": True,
                "polish_unavailable": False,
            }

    if ai_polish and not limit_reached:
        polished_text = _call_ai_polish(baseline_text, job, targets, completed)
        gate = QualityGateResult(False, "empty_response")
        if polished_text:
            gate = polish_output_passes_quality_gates(
                polished_text,
                baseline_text,
                {
                    "baseline_text": baseline_text,
                    "job_description": job.get("job_description") or "",
                    "target_skills": [row.get("skill") for row in targets],
                    "proof_texts": [
                        " ".join(
                            [
                                str(item.get("skill") or ""),
                                str(item.get("proof") or ""),
                                str(item.get("impact") or ""),
                            ]
                        )
                        for item in completed
                    ],
                },
            )
        if polished_text and gate.accepted:
            update_payload = {
                "polished_text": polished_text,
                "ai_polished": True,
                "ai_polish_used_at": _now_iso(),
                "updated_at": _now_iso(),
            }
            update_result = (
                db.table("job_cv_variants")
                .update(update_payload)
                .eq("id", row.get("id"))
                .eq("user_id", user_id)
                .execute()
            )
            row = update_result.data[0] if update_result.data else {**row, **update_payload}
            return {
                "id": row.get("id", 0),
                "job_id": job_id,
                "cv_text": row.get("deterministic_text") or deterministic_text,
                "polished_text": row.get("polished_text"),
                "confidence": confidence,
                "snapshot_hash": snapshot_hash,
                "from_cache": False,
                "ai_polish_used": polish_used + 1,
                "ai_polish_limit": AI_POLISH_LIMIT,
                "limit_reached": False,
                "polish_unavailable": False,
            }
        if gate.reason:
            logger.info("CV polish rejected for user=%s job=%s reason=%s", user_id, job_id, gate.reason)

    return {
        "id": row.get("id", 0),
        "job_id": job_id,
        "cv_text": row.get("deterministic_text") or deterministic_text,
        "polished_text": row.get("polished_text"),
        "confidence": confidence,
        "snapshot_hash": snapshot_hash,
        "from_cache": False,
        "ai_polish_used": polish_used,
        "ai_polish_limit": AI_POLISH_LIMIT,
        "limit_reached": limit_reached,
        "polish_unavailable": bool(ai_polish and not limit_reached),
    }
