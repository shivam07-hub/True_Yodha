from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any

from app.repositories.diary import DiaryRepository
from app.repositories.scores import ScoresRepository
from app.services.scoring import compute_and_persist_score, fetch_aspiration_skills, infer_level_from_signals

_SIGNAL_XP: dict[str, int] = {
    "mention": 50,
    "project": 150,
    "impact": 350,
    "leadership": 500,
}

_PROJECT_HINTS = (
    "built",
    "implemented",
    "shipped",
    "deployed",
    "delivered",
    "created",
    "launched",
    "designed",
    "owned",
)
_IMPACT_HINTS = (
    "improved",
    "increased",
    "reduced",
    "faster",
    "slower",
    "saved",
    "growth",
    "revenue",
    "kpi",
    "metric",
    "%",
)
_LEADERSHIP_HINTS = (
    "led",
    "mentored",
    "managed",
    "architected",
    "strategy",
    "roadmap",
    "stakeholder",
)


def _entry_signal_type(entry_text: str) -> str:
    lowered = entry_text.lower()
    if any(hint in lowered for hint in _LEADERSHIP_HINTS):
        return "leadership"
    if any(hint in lowered for hint in _IMPACT_HINTS):
        return "impact"
    if any(hint in lowered for hint in _PROJECT_HINTS):
        return "project"
    return "mention"


def _evidence_excerpt(entry_text: str, skill: str) -> str:
    sentences = [chunk.strip() for chunk in re.split(r"(?<=[.!?])\s+", entry_text.strip()) if chunk.strip()]
    skill_lower = skill.lower()
    for sentence in sentences:
        if skill_lower in sentence.lower():
            return sentence[:300]
    return entry_text.strip()[:300]


def _extract_signals(entry_text: str, known_skill_keys: list[str]) -> list[dict[str, Any]]:
    lowered = entry_text.lower()
    signal_type = _entry_signal_type(entry_text)
    xp_awarded = _SIGNAL_XP[signal_type]
    signals: list[dict[str, Any]] = []

    for skill_key in known_skill_keys:
        normalized = skill_key.strip()
        if not normalized:
            continue
        if normalized.lower() not in lowered:
            continue
        signals.append(
            {
                "taxonomy_key": normalized,
                "signal_type": signal_type,
                "xp_awarded": xp_awarded,
                "evidence": _evidence_excerpt(entry_text, normalized),
            }
        )

    return signals


def _upgrade_user_skills_from_signals(
    diary_repo: DiaryRepository,
    user_id: str,
    signals: list[dict[str, Any]],
) -> None:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for signal in signals:
        grouped.setdefault(signal["taxonomy_key"], []).append(signal)

    current_rows = diary_repo.list_user_skill_rows(user_id)
    skill_by_key: dict[str, tuple[int, int]] = {}
    for row in current_rows:
        skill = row.get("skills") or {}
        key = (skill.get("taxonomy_key") or "").strip()
        if not key:
            continue
        skill_by_key[key] = (int(row.get("skill_id") or 0), int(row.get("matched_level") or 0))

    updates: list[dict[str, Any]] = []
    for taxonomy_key, skill_signals in grouped.items():
        record = skill_by_key.get(taxonomy_key)
        if not record:
            continue

        skill_id, current_level = record
        new_level = infer_level_from_signals(skill_signals)
        if new_level <= current_level:
            continue

        updates.append(
            {
                "user_id": user_id,
                "skill_id": skill_id,
                "matched_level": new_level,
                "source": "diary",
                "evidence_text": skill_signals[0]["evidence"],
                "last_updated": datetime.now(timezone.utc).isoformat(),
            }
        )

    if updates:
        diary_repo.upsert_user_skill_rows(updates)


def _recompute_score(diary_repo: DiaryRepository, user_id: str) -> float | None:
    skill_level_map = diary_repo.get_user_skill_level_map(user_id)
    if not skill_level_map:
        return diary_repo.get_total_score(user_id)

    scores_repo = ScoresRepository(diary_repo.client)
    aspiration_skills = fetch_aspiration_skills(scores_repo, diary_repo.get_target_roles(user_id))
    score_row = compute_and_persist_score(
        scores_repo,
        user_id,
        aspiration_skills=aspiration_skills or None,
        skill_level_map=skill_level_map,
    )
    return score_row.get("total_score")


def record_diary_entry(
    diary_repo: DiaryRepository,
    user_id: str,
    entry_text: str,
    log_date: date,
) -> tuple[dict[str, Any], float | None, float | None]:
    score_before = diary_repo.get_total_score(user_id)

    known_skill_keys = diary_repo.list_user_skill_keys(user_id)
    signals = _extract_signals(entry_text, known_skill_keys)
    if signals:
        _upgrade_user_skills_from_signals(diary_repo, user_id, signals)
        score_after = _recompute_score(diary_repo, user_id)
    else:
        score_after = score_before

    existing_entry = diary_repo.get_daily_log_for_append(user_id, log_date)
    if existing_entry:
        prior_text = existing_entry.get("entry_text") or ""
        combined_text = prior_text + "\n\n---\n\n" + entry_text if prior_text else entry_text
        prior_delta = existing_entry.get("skills_delta") or []
    else:
        combined_text = entry_text
        prior_delta = []

    signal_deltas = [
        {"taxonomy_key": signal["taxonomy_key"], "xp_added": signal["xp_awarded"], "evidence": signal["evidence"]}
        for signal in signals
    ]
    now = datetime.now(timezone.utc).isoformat()
    diary_repo.upsert_daily_log(
        {
            "user_id": user_id,
            "log_date": str(log_date),
            "entry_text": combined_text,
            "skills_delta": prior_delta + signal_deltas,
            "updated_at": now,
        }
    )
    row = diary_repo.get_daily_log(user_id, log_date)
    return row, score_before, score_after


def list_progress_milestones(
    diary_repo: DiaryRepository,
    user_id: str,
    limit: int,
) -> list[dict[str, Any]]:
    personal_rows = diary_repo.list_user_milestones(user_id, limit)
    job_rows = diary_repo.list_job_application_milestones(user_id, limit)

    normalized_personal_rows = [
        {**row, "source_type": "personal"} for row in personal_rows
    ]

    normalized_job_rows: list[dict[str, Any]] = []
    for row in job_rows:
        normalized_job_rows.append(
            {
                "id": row["id"],
                "milestone_date": row["milestone_date"],
                "skill": row.get("skill"),
                "task": row.get("action") or row.get("title") or "",
                "proof": row.get("proof"),
                "impact": row.get("impact"),
                "confidence": row.get("confidence") or 0.6,
                "completed_at": row.get("completed_at"),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
                "source_type": "job",
            }
        )

    combined = normalized_personal_rows + normalized_job_rows
    combined.sort(key=lambda item: str(item.get("milestone_date") or ""), reverse=True)
    return combined[:limit]


def upsert_personal_milestone(
    diary_repo: DiaryRepository,
    user_id: str,
    milestone_date: date,
    skill: str | None,
    task: str,
    proof: str | None,
    impact: str | None,
    confidence: float,
    completed: bool,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    payload: dict[str, Any] = {
        "user_id": user_id,
        "milestone_date": str(milestone_date),
        "skill": skill.strip() if skill else None,
        "task": task,
        "proof": proof.strip() if proof else None,
        "impact": impact.strip() if impact else None,
        "confidence": confidence,
        "updated_at": now,
    }
    if completed:
        payload["completed_at"] = now

    diary_repo.upsert_user_milestone(payload)
    return diary_repo.get_user_milestone(user_id, milestone_date)
