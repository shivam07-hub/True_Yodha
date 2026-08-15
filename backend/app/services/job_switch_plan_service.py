"""₹99 Personalised Job-Switch Plan — entitlement + review lifecycle (#33).

One LIVING plan per user (B4); up to TWO async founder/HITL reviews within a
120-day window (B5/B6): review 1 fires automatically on purchase, review 2 is
user-requested after review 1 is delivered. The plan never expires; only the
human reviews are capped + windowed.

Activation is invoked from the Razorpay fulfilment path (a "job_switch_plan"
entitlement product), which guarantees exactly-once via the same
created->verified CAS used for every other product. Activation therefore MUST be
robust — it never raises into the payment path: the critical insert is plain and
fast, while the gap snapshot + reviewer email are best-effort.

Writes use the service-role admin client (the tables expose SELECT-own RLS only),
mirroring myrology_bookings.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status

from app.config import settings
from app.database import get_supabase_admin
from app.repositories.jobs import get_public_jobs_repository
from app.services import email_service, myro_voice
from app.services.llm_provider import LLMProviderError, get_llm_provider

logger = logging.getLogger(__name__)

PLAN_PRICE_PAISE = 9900          # ₹99 intro
PLAN_WINDOW_DAYS = 120           # B5 — human-review window
REVIEW_SLA_WORKING_DAYS = 5      # B3 — per-review SLA
MAX_REVIEWS = 2                  # B5
DRAFT_MAX_TOKENS = 900           # L1 — LLM draft note budget

# Review lifecycle (B6): pending -> in_progress -> delivered. Keyed by target =>
# the set of source statuses it may be reached from. 'delivered' is terminal.
_ALLOWED_REVIEW_TRANSITIONS: dict[str, set[str]] = {
    "in_progress": {"pending"},
    "delivered": {"pending", "in_progress"},
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _add_working_days(start: datetime, n: int) -> datetime:
    """Add ``n`` working days, skipping Sat/Sun. Good enough for an SLA clock —
    public holidays are not modelled (founder queue absorbs them)."""
    day = start
    added = 0
    while added < n:
        day = day + timedelta(days=1)
        if day.weekday() < 5:  # Mon–Fri
            added += 1
    return day


# ── snapshot (best-effort, never raises into fulfilment) ─────────────────────

def _build_gap_snapshot(user_id: str) -> tuple[str | None, dict[str, Any]]:
    """Capture the target role + a compact gap reference for the reviewer to
    anchor on. The LIVE plan content is recomputed from the skill engine on read;
    this is the 'where you started' reference, not the source of truth."""
    target_role: str | None = None
    snapshot: dict[str, Any] = {"captured_at": _now().isoformat()}
    try:
        repo = get_public_jobs_repository()
        roles = repo.get_user_target_roles(user_id) or []
        target_role = roles[0] if roles else None
        snapshot["target_roles"] = roles
    except Exception:  # snapshot is a nicety — never block activation
        logger.warning("metric jsp.snapshot_failed user=%s", user_id)
    return target_role, snapshot


# ── activation (called by Razorpay fulfilment) ───────────────────────────────

def activate_plan(user_id: str) -> dict[str, Any]:
    """Create the user's living plan + auto-fire review 1. Idempotent: a user who
    already has a plan keeps it (one-plan-per-user, B4) — a duplicate fulfilment
    (e.g. webhook + verify race already converges upstream, but defend anyway)
    never creates a second plan or a second auto-review."""
    admin = get_supabase_admin()

    existing = (
        admin.table("job_switch_plans").select("*").eq("user_id", user_id).maybe_single().execute()
    )
    if existing and existing.data:
        return existing.data  # already active — idempotent

    target_role, snapshot = _build_gap_snapshot(user_id)
    now = _now()
    inserted = (
        admin.table("job_switch_plans")
        .insert(
            {
                "user_id": user_id,
                "target_role": target_role,
                "gap_snapshot": snapshot,
                "status": "active",
                "reviews_used": 0,
                "window_expires_at": (now + timedelta(days=PLAN_WINDOW_DAYS)).isoformat(),
            }
        )
        .execute()
    )
    if not inserted.data:
        # Unique-violation race (a concurrent fulfilment won) — fetch + return.
        again = (
            admin.table("job_switch_plans").select("*").eq("user_id", user_id).maybe_single().execute()
        )
        if again and again.data:
            return again.data
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to activate Job-Switch Plan",
        )
    plan = inserted.data[0]

    _open_review(plan["id"], review_no=1)
    _notify_reviewer(user_id=user_id, plan=plan, review_no=1)
    logger.info("metric jsp.activated user=%s plan=%s", user_id, plan["id"])
    return plan


def _open_review(plan_id: str, *, review_no: int) -> dict[str, Any]:
    admin = get_supabase_admin()
    sla = _add_working_days(_now(), REVIEW_SLA_WORKING_DAYS)
    result = (
        admin.table("job_switch_plan_reviews")
        .insert(
            {
                "plan_id": plan_id,
                "review_no": review_no,
                "status": "pending",
                "sla_due_at": sla.isoformat(),
            }
        )
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to open review",
        )
    return result.data[0]


def _notify_reviewer(*, user_id: str, plan: dict[str, Any], review_no: int) -> None:
    """Email the founder/HITL reviewer. Best-effort — never blocks activation."""
    to = settings.job_switch_reviewer_email
    if not to:
        return
    try:
        body = (
            f"New Job-Switch Plan review (#{review_no}).\n\n"
            f"Plan ID: {plan.get('id')}\n"
            f"User: {user_id}\n"
            f"Target role: {plan.get('target_role') or '—'}\n"
            f"SLA: 5 working days.\n\n"
            "Open the reviewer queue to read the plan and write the personalised note."
        )
        email_service.send_email(
            to=to,
            subject=f"Job-Switch Plan · review #{review_no} requested",
            text=body,
        )
    except Exception:
        logger.warning("metric jsp.notify_failed plan=%s", plan.get("id"))


# ── read ─────────────────────────────────────────────────────────────────────

def get_plan_state(user_id: str) -> dict[str, Any] | None:
    """The plan + its reviews for the owner. None when the user hasn't purchased.
    The living skill content is composed client-side from the existing skill
    surfaces; this returns the plan meta + review lifecycle only."""
    admin = get_supabase_admin()
    plan_res = (
        admin.table("job_switch_plans").select("*").eq("user_id", user_id).maybe_single().execute()
    )
    plan = plan_res.data if plan_res else None
    if not plan:
        return None
    reviews_res = (
        admin.table("job_switch_plan_reviews")
        .select("*")
        .eq("plan_id", plan["id"])
        .order("review_no")
        .execute()
    )
    reviews = reviews_res.data or []
    now = _now()
    window_expires = _parse_dt(plan.get("window_expires_at"))
    delivered = [r for r in reviews if r.get("status") == "delivered"]
    in_window = bool(window_expires and now < window_expires)
    can_request_second = (
        len(reviews) < MAX_REVIEWS
        and len(delivered) >= 1  # review 1 must be delivered first (B6)
        and in_window
    )
    return {
        "plan": plan,
        "reviews": reviews,
        "can_request_second_review": can_request_second,
        "window_open": in_window,
    }


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


# ── second review (user-requested, B6) ───────────────────────────────────────

def request_second_review(user_id: str) -> dict[str, Any]:
    state = get_plan_state(user_id)
    if state is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You don't have a Job-Switch Plan yet.",
        )
    reviews = state["reviews"]
    if any(r.get("review_no") == 2 for r in reviews):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Your second review is already requested.")
    if not state["window_open"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your 120-day review window has closed. Your plan stays — reviews don't.",
        )
    if not any(r.get("status") == "delivered" for r in reviews):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your first review is still in progress — it must land before you request the second.",
        )
    review = _open_review(state["plan"]["id"], review_no=2)
    _notify_reviewer(user_id=user_id, plan=state["plan"], review_no=2)
    logger.info("metric jsp.second_review_requested user=%s plan=%s", user_id, state["plan"]["id"])
    return review


# ── reviewer ops: deliver / advance a review (admin-token gated) ──────────────

def transition_review(review_id: str, new_status: str, review_text: str | None = None) -> dict[str, Any]:
    """Advance a review through pending -> in_progress -> delivered. On
    'delivered' it stamps the note + delivered_at and increments the plan's
    reviews_used. CAS on the source status so concurrent ops can't double-apply."""
    admin = get_supabase_admin()
    current = (
        admin.table("job_switch_plan_reviews").select("*").eq("id", review_id).maybe_single().execute()
    )
    row = current.data if current else None
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")

    from_status = str(row.get("status"))
    if from_status == new_status and new_status != "delivered":
        return row  # idempotent no-op for non-terminal repeats
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
        .eq("status", from_status)  # CAS
        .execute()
    )
    if not updated.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Review status changed concurrently — reload and retry.",
        )
    review = updated.data[0]

    if new_status == "delivered":
        # Bump reviews_used off the actual delivered count (self-correcting).
        delivered_count = (
            admin.table("job_switch_plan_reviews")
            .select("id", count="exact")
            .eq("plan_id", row["plan_id"])
            .eq("status", "delivered")
            .execute()
        )
        used = int(delivered_count.count or 0)
        admin.table("job_switch_plans").update(
            {"reviews_used": min(used, MAX_REVIEWS), "updated_at": now.isoformat()}
        ).eq("id", row["plan_id"]).execute()
    return review


# ── LLM review draft (L1: model drafts → founder edits + approves) ────────────
# The draft is generated ON DEMAND when the founder opens a review to work it —
# deliberately OFF the Razorpay fulfilment path (an LLM call must never slow or
# break a payment). The founder always edits + delivers via transition_review;
# the draft only saves them the blank page.

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
    """Load a review + its parent plan + owner for drafting/working. Admin-gated
    upstream (the founder queue), so it reads across users via the admin client."""
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
    """Compact 'Skill — proficiency' lines for the draft prompt. Best-effort."""
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
    """LLM-draft a personalised review note grounded in the user's target role +
    actual skills. Fail-soft: returns None on any provider error so the founder
    falls back to writing manually — a draft failure must never block the queue."""
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
    """Save the LLM draft as the working note + advance pending -> in_progress so
    the queue shows it's being handled. A None draft leaves the row untouched
    (founder writes manually). Never marks delivered — the founder still approves
    via transition_review with the final, edited text."""
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
