"""₹199 / month Personalised Engagement — scene + one human pass per IST month.

One LIVING scene per user. Month 1 opens on first charge; later months open on
``subscription.charged``. Conversion is theirs; we staff the scene.

Activation is invoked from the Razorpay fulfilment path (the ``job_switch_plan``
product), which guarantees exactly-once via the same created->verified CAS used
for every other product. Activation therefore MUST be robust — it never raises
into the payment path: the critical insert is plain and fast, while the gap
snapshot + reviewer email are best-effort.

Writes use the service-role admin client (SELECT-own RLS only).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status

from app.config import settings
from app.database import get_supabase_admin
from app.repositories.jobs import get_public_jobs_repository
from app.services import email_service
from app.services.billing_month import in_current_period, ist_period_end
from app.services import job_switch_plan_draft as _draft
from app.services.sla_clock import add_working_days

_DRAFT_SYSTEM = _draft._DRAFT_SYSTEM
draft_review_note = _draft.draft_review_note
get_review_context = _draft.get_review_context
store_review_draft = _draft.store_review_draft
transition_review = _draft.transition_review

logger = logging.getLogger(__name__)

PLAN_PRICE_PAISE = 19900
REVIEW_SLA_WORKING_DAYS = 5
_OPEN_PASS_STATUSES = ("pending", "in_progress")
_LIVE_SUB_STATUSES = frozenset({"active", "pending"})


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _build_gap_snapshot(user_id: str) -> tuple[str | None, dict[str, Any]]:
    target_role: str | None = None
    snapshot: dict[str, Any] = {"captured_at": _now().isoformat()}
    try:
        repo = get_public_jobs_repository()
        roles = repo.get_user_target_roles(user_id) or []
        target_role = roles[0] if roles else None
        snapshot["target_roles"] = roles
    except Exception:
        logger.warning("metric jsp.snapshot_failed user=%s", user_id)
    return target_role, snapshot


def subscription_is_live(plan: dict[str, Any] | None) -> bool:
    """True only for a Razorpay-backed scene that has not been stopped."""
    if not plan or not plan.get("razorpay_subscription_id"):
        return False
    return str(plan.get("subscription_status") or "active") in _LIVE_SUB_STATUSES


def open_pass_count() -> int:
    resp = (
        get_supabase_admin()
        .table("job_switch_plan_reviews")
        .select("id", count="exact")
        .in_("status", list(_OPEN_PASS_STATUSES))
        .limit(1)
        .execute()
    )
    return int(resp.count or 0)


def has_active_subscription(user_id: str) -> bool:
    admin = get_supabase_admin()
    result = (
        admin.table("job_switch_plans").select("*").eq("user_id", user_id).maybe_single().execute()
    )
    plan = result.data if result else None
    return subscription_is_live(plan)


def activate_plan(user_id: str, subscription_id: str | None = None) -> dict[str, Any]:
    """Create the scene + this month's pass. Idempotent per user."""
    admin = get_supabase_admin()
    existing = (
        admin.table("job_switch_plans").select("*").eq("user_id", user_id).maybe_single().execute()
    )
    if existing and existing.data:
        plan = existing.data
        if subscription_id:
            patch = {
                "razorpay_subscription_id": subscription_id,
                "subscription_status": "active",
                "window_expires_at": ist_period_end().isoformat(),
                "updated_at": _now().isoformat(),
            }
            admin.table("job_switch_plans").update(patch).eq("id", plan["id"]).execute()
            plan = {**plan, **patch}
            _ensure_period_pass(user_id, plan)
        return plan

    target_role, snapshot = _build_gap_snapshot(user_id)
    inserted = (
        admin.table("job_switch_plans")
        .insert(
            {
                "user_id": user_id,
                "target_role": target_role,
                "gap_snapshot": snapshot,
                "status": "active",
                "subscription_status": "active",
                "reviews_used": 0,
                "window_expires_at": ist_period_end().isoformat(),
                **({"razorpay_subscription_id": subscription_id} if subscription_id else {}),
            }
        )
        .execute()
    )
    if not inserted.data:
        again = (
            admin.table("job_switch_plans").select("*").eq("user_id", user_id).maybe_single().execute()
        )
        if again and again.data:
            return again.data
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to activate the engagement",
        )
    plan = inserted.data[0]
    _open_review(plan["id"], review_no=1)
    _notify_reviewer(user_id=user_id, plan=plan, review_no=1)
    logger.info("metric jsp.activated user=%s plan=%s", user_id, plan["id"])
    return plan


def renew_period(user_id: str) -> dict[str, Any] | None:
    """Open this IST month's pass after a recurring charge. No-op if already open."""
    admin = get_supabase_admin()
    result = (
        admin.table("job_switch_plans").select("*").eq("user_id", user_id).maybe_single().execute()
    )
    plan = result.data if result else None
    if not subscription_is_live(plan):
        return plan
    assert plan is not None
    admin.table("job_switch_plans").update(
        {"window_expires_at": ist_period_end().isoformat(), "updated_at": _now().isoformat()}
    ).eq("id", plan["id"]).execute()
    _ensure_period_pass(user_id, plan)
    logger.info("metric jsp.renewed user=%s plan=%s", user_id, plan["id"])
    return plan


def mark_subscription_stopped(subscription_id: str) -> None:
    get_supabase_admin().table("job_switch_plans").update(
        {"subscription_status": "cancelled", "updated_at": _now().isoformat()}
    ).eq("razorpay_subscription_id", subscription_id).execute()
    logger.info("metric jsp.subscription_stopped sub=%s", subscription_id)


def _list_reviews(plan_id: str) -> list[dict[str, Any]]:
    reviews_res = (
        get_supabase_admin()
        .table("job_switch_plan_reviews")
        .select("*")
        .eq("plan_id", plan_id)
        .order("review_no")
        .execute()
    )
    return reviews_res.data or []


def _ensure_period_pass(user_id: str, plan: dict[str, Any]) -> None:
    reviews = _list_reviews(plan["id"])
    if any(in_current_period(r.get("requested_at")) for r in reviews):
        return
    nos = [int(r.get("review_no") or 0) for r in reviews]
    review_no = max(nos, default=0) + 1
    _open_review(plan["id"], review_no=review_no)
    _notify_reviewer(user_id=user_id, plan=plan, review_no=review_no)


def _open_review(plan_id: str, *, review_no: int) -> dict[str, Any]:
    admin = get_supabase_admin()
    sla = add_working_days(_now(), REVIEW_SLA_WORKING_DAYS)
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
    to = settings.job_switch_reviewer_email
    if not to:
        return
    try:
        body = (
            f"New engagement pass (#{review_no}).\n\n"
            f"Plan ID: {plan.get('id')}\n"
            f"User: {user_id}\n"
            f"Target role: {plan.get('target_role') or '—'}\n"
            f"SLA: 5 working days.\n\n"
            "Open the reviewer queue to read the scene and write the personalised note."
        )
        email_service.send_email(
            to=to,
            subject=f"Engagement · pass #{review_no} requested",
            text=body,
        )
    except Exception:
        logger.warning("metric jsp.notify_failed plan=%s", plan.get("id"))


def get_plan_state(user_id: str) -> dict[str, Any] | None:
    admin = get_supabase_admin()
    plan_res = (
        admin.table("job_switch_plans").select("*").eq("user_id", user_id).maybe_single().execute()
    )
    plan = plan_res.data if plan_res else None
    if not plan:
        return None
    reviews = _list_reviews(plan["id"])
    sub_status = str(plan.get("subscription_status") or "active")
    live = sub_status in _LIVE_SUB_STATUSES
    open_pass = any(r.get("status") in _OPEN_PASS_STATUSES for r in reviews)
    this_month = any(in_current_period(r.get("requested_at")) for r in reviews)
    return {
        "plan": plan,
        "reviews": reviews,
        "can_request_second_review": live and not open_pass and not this_month,
        "window_open": live,
        "subscription_status": sub_status,
    }


def request_second_review(user_id: str) -> dict[str, Any]:
    """Open this month's pass when renewal did not (or the user asks first)."""
    state = get_plan_state(user_id)
    if state is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You don't have a Job-Switch Plan yet.",
        )
    reviews = state["reviews"]
    if not state["window_open"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your engagement window is not live this month.",
        )
    if any(r.get("status") in _OPEN_PASS_STATUSES for r in reviews):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Your review is already requested.")
    if any(in_current_period(r.get("requested_at")) for r in reviews):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This month's pass is already on the scene.",
        )
    nos = [int(r.get("review_no") or 0) for r in reviews]
    review_no = max(nos, default=0) + 1
    review = _open_review(state["plan"]["id"], review_no=review_no)
    _notify_reviewer(user_id=user_id, plan=state["plan"], review_no=review_no)
    logger.info("metric jsp.period_pass_requested user=%s plan=%s", user_id, state["plan"]["id"])
    return review
