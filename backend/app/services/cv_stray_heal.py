"""Drop CV skills whose only receipt is an employer header or a nameless metric.

Extraction now refuses those. People who uploaded before that still carry them
until they come back — this is the visit that removes them. Nothing is rewritten
on accounts that are not here (no backfill).
"""

from __future__ import annotations

import logging
from typing import Any

from app.services import background, scoring
from app.services.cv_skill_evidence import stray_skill_ids

logger = logging.getLogger("myro.forward_pass")


def _receipts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        skill = row.get("skills") if isinstance(row.get("skills"), dict) else {}
        key = str(skill.get("taxonomy_key") or "").strip()
        if not key:
            continue
        out.append({
            "skill_id": int(row["skill_id"]),
            "taxonomy_key": key,
            "evidence_text": str(row.get("evidence_text") or ""),
            "source": str(row.get("source") or "cv"),
        })
    return out


def _load(db: Any, user_id: str) -> tuple[str, list[dict[str, Any]]]:
    baseline_rows = (
        db.table("cv_versions")
        .select("id, body_text")
        .eq("user_id", user_id)
        .eq("kind", "baseline_upload")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    baseline = (baseline_rows.data or [None])[0]
    if not baseline:
        return "", []
    skill_rows = (
        db.table("user_skills")
        .select("skill_id, evidence_text, source, skills(taxonomy_key)")
        .eq("user_id", user_id)
        .execute()
    )
    return str(baseline.get("body_text") or ""), _receipts(skill_rows.data or [])


def enqueue_if_behind(user_id: str) -> bool:
    """Cheap check, then enqueue. Caller owns the claim."""
    from app.database import get_supabase_admin

    db = get_supabase_admin()
    cv_text, receipts = _load(db, user_id)
    if not stray_skill_ids(receipts, cv_text):
        return False
    background.enqueue(
        background.LANE_FAST,
        "stray_skill_heal",
        payload={"user_id": user_id},
    )
    return True


def heal_stray_cv_skills(user_id: str) -> int:
    from app.database import get_supabase_admin
    from app.repositories.scores import ScoresRepository

    db = get_supabase_admin()
    cv_text, receipts = _load(db, user_id)
    ids = stray_skill_ids(receipts, cv_text)
    if not ids:
        return 0
    (
        db.table("user_skills")
        .delete()
        .eq("user_id", user_id)
        .in_("skill_id", ids)
        .execute()
    )
    scoring.recompute_score(ScoresRepository(db), user_id)
    logger.info("metric forward_pass.stray_skills_dropped user=%s n=%d", user_id, len(ids))
    return len(ids)


@background.handler("stray_skill_heal")
async def _stray_skill_heal_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    heal_stray_cv_skills(str(payload["user_id"]))
