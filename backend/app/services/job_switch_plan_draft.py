"""LLM draft for an engagement pass — off the payment path.

Generated when the founder opens a pass to work it. Fail-soft: a provider
error leaves the row untouched so they can still write the note by hand.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status

from app.database import get_supabase_admin
from app.repositories.jobs import get_public_jobs_repository
from app.services import myro_voice
from app.services.llm_provider import LLMProviderError, get_llm_provider

logger = logging.getLogger(__name__)

_ALLOWED_REVIEW_TRANSITIONS: dict[str, set[str]] = {
    "in_progress": {"pending"},
    "delivered": {"pending", "in_progress"},
}


def _now() -> datetime:
    return datetime.now(timezone.utc)

DRAFT_MAX_TOKENS = 900

_DRAFT_TASK = (
    "THIS SURFACE: a plan note helping them become switch-READY for a target "
    "role. The founder edits it before it is sent, so write the note itself, not "
    "a draft with placeholders. Ground every claim only in the skills they "
    "actually list. Frame it as readiness: name what they already have, then the "
    "concrete next skills to build toward the role and why each one matters. "
    "150–220 words, plain English, no headers."
)

_DRAFT_SYSTEM = myro_voice.speaking_to_reader(_DRAFT_TASK)


def get_review_context(review_id: str) -> dict[str, Any]:
    """Load a review + its parent plan + owner. Admin-gated upstream."""
    admin = get_supabase_admin()
    rev = (
        admin.table("job_switch_plan_reviews").select("*").eq("id", review_id).maybe_single().execute()
    )
    review = rev.data if rev else None
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    plan_res = (
        admin.table("job_switch_plans").select("*").eq("id", review["plan_id"]).maybe_single().execute()
    )
    plan = plan_res.data if plan_res else None
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return {"review": review, "plan": plan, "user_id": plan["user_id"]}


def _user_skill_lines(user_id: str) -> list[str]:
    try:
        rows = get_public_jobs_repository().get_user_skills_with_taxonomy(user_id)
    except Exception:
        logger.warning("metric jsp.draft_skills_failed user=%s", user_id)
        return []
    lines: list[str] = []
    for r in rows:
        sk = r.get("skills") or {}
        name = (sk.get("display_name") or "").strip()
        if not name:
            continue
        title = (r.get("proficiency_title") or "").strip()
        lines.append(f"{name} — {title}" if title else name)
    return lines


async def draft_review_note(ctx: dict[str, Any]) -> str | None:
    plan = ctx["plan"]
    target_role = (plan.get("target_role") or "").strip() or "their target role"
    skills = _user_skill_lines(ctx["user_id"])
    skills_block = "\n".join(f"- {s}" for s in skills) if skills else "(no skills on file)"
    user_msg = (
        f"Target role: {target_role}\n\n"
        f"The user's current skills (the ONLY grounding — do not go beyond this):\n"
        f"{skills_block}\n\n"
        "Write the personalised switch-readiness note now."
    )
    try:
        provider = get_llm_provider()
        text = await provider.complete(
            [
                {"role": "system", "content": _DRAFT_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=DRAFT_MAX_TOKENS,
        )
    except LLMProviderError:
        logger.warning("metric jsp.draft_llm_failed plan=%s", plan.get("id"))
        return None
    text = (text or "").strip()
    return text or None


def store_review_draft(review_id: str, draft: str | None) -> dict[str, Any]:
    admin = get_supabase_admin()
    current = (
        admin.table("job_switch_plan_reviews").select("*").eq("id", review_id).maybe_single().execute()
    )
    row = current.data if current else None
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    if row.get("status") == "delivered":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This review is already delivered.",
        )
    if not draft:
        return row
    patch = {"review_text": draft}
    if row.get("status") == "pending":
        patch["status"] = "in_progress"
    updated = (
        admin.table("job_switch_plan_reviews").update(patch).eq("id", review_id).execute()
    )
    return (updated.data or [row])[0]


def transition_review(review_id: str, new_status: str, review_text: str | None = None) -> dict[str, Any]:
    admin = get_supabase_admin()
    current = (
        admin.table("job_switch_plan_reviews").select("*").eq("id", review_id).maybe_single().execute()
    )
    row = current.data if current else None
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")

    from_status = str(row.get("status"))
    if from_status == new_status and new_status != "delivered":
        return row
    allowed_from = _ALLOWED_REVIEW_TRANSITIONS.get(new_status, set())
    if from_status not in allowed_from:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot move a '{from_status}' review to '{new_status}'.",
        )

    now = _now()
    patch: dict[str, Any] = {"status": new_status}
    if new_status == "delivered":
        if not (review_text or "").strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A delivered review needs the personalised note.",
            )
        patch["review_text"] = review_text.strip()
        patch["delivered_at"] = now.isoformat()

    updated = (
        admin.table("job_switch_plan_reviews")
        .update(patch)
        .eq("id", review_id)
        .eq("status", from_status)
        .execute()
    )
    if not updated.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Review status changed concurrently — reload and retry.",
        )
    review = updated.data[0]

    if new_status == "delivered":
        delivered_count = (
            admin.table("job_switch_plan_reviews")
            .select("id", count="exact")
            .eq("plan_id", row["plan_id"])
            .eq("status", "delivered")
            .execute()
        )
        used = int(delivered_count.count or 0)
        admin.table("job_switch_plans").update(
            {"reviews_used": used, "updated_at": now.isoformat()}
        ).eq("id", row["plan_id"]).execute()
    return review
