"""Human Check — user endpoints and the reviewer's (ARCHITECTURE_PAYMENTS.md §3 D).

User: list my checks, spend a held check on a job or on LinkedIn, or buy a
LinkedIn check with 5,000 coins. Reviewer (the one `require_admin` guard): the
open queue with stuck payments, claim, deliver, close the LinkedIn paste call,
and retry a stuck grant.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.config import settings
from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.cv import CVRepository
from app.security.admin_auth import require_admin
from app.services import human_check, linkedin_draft, settlement
from app.services.razorpay_gateway import Arrival

router = APIRouter(tags=["human-checks"])
logger = logging.getLogger(__name__)

STUCK_AFTER = timedelta(hours=1)

# What the owner of a check may see. The WhatsApp number and the reviewer's
# draft stay on the reviewer's side.
_USER_FIELDS = (
    "id", "kind", "job_id", "status", "slot_starts_at", "due_at", "reviewer_name",
    "note", "reviewed_cv_version_id", "linkedin_url", "blocks", "pasted_at",
    "delivered_at", "created_at",
)


class CheckOut(BaseModel):
    id: str
    kind: str | None = None
    job_id: str | None = None
    status: str
    slot_starts_at: str | None = None
    due_at: str | None = None
    reviewer_name: str | None = None
    note: str | None = None
    reviewed_cv_version_id: int | None = None
    linkedin_url: str | None = None
    blocks: dict[str, Any] | None = None
    pasted_at: str | None = None
    delivered_at: str | None = None
    created_at: str | None = None


class CheckList(BaseModel):
    checks: list[CheckOut]


class AssignJobIn(BaseModel):
    job_id: str = Field(min_length=1, max_length=200)


class LinkedInIn(BaseModel):
    linkedin_url: str = Field(min_length=1, max_length=300)
    whatsapp: str = Field(min_length=1, max_length=40)


class DeliverIn(BaseModel):
    note: str = Field(min_length=1, max_length=4000)
    reviewed_cv_version_id: int | None = None
    blocks: dict[str, Any] | None = None


class CloseCallIn(BaseModel):
    pasted: bool


def _store() -> human_check.HumanCheckStore:
    return human_check.SupabaseHumanCheckStore()


def _out(row: dict[str, Any]) -> CheckOut:
    return CheckOut(**{k: row.get(k) for k in _USER_FIELDS})


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, human_check.CheckNotFound):
        return HTTPException(status.HTTP_404_NOT_FOUND, "Check not found")
    if isinstance(exc, human_check.CheckConflict):
        return HTTPException(status.HTTP_409_CONFLICT, str(exc))
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))


_CHECK_ERRORS = (human_check.CheckNotFound, human_check.CheckConflict, human_check.CheckInputInvalid)


def _reviewer_name() -> str:
    name = settings.human_check_reviewer_name.strip()
    if not name:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "HUMAN_CHECK_REVIEWER_NAME is not set")
    return name


# ── user ────────────────────────────────────────────────────────────────────


@router.get("/human-checks", response_model=CheckList)
async def list_my_checks(principal: Principal = Depends(get_principal)) -> CheckList:
    rows = await run_in_threadpool(_store().for_user, principal.id)
    return CheckList(checks=[_out(r) for r in rows])


@router.post("/human-checks/{check_id}/job", response_model=CheckOut)
async def use_check_on_job(
    check_id: str, body: AssignJobIn, principal: Principal = Depends(get_principal)
) -> CheckOut:
    try:
        row = await run_in_threadpool(human_check.assign_job, _store(), principal.id, check_id, body.job_id)
    except _CHECK_ERRORS as exc:
        raise _http(exc) from exc
    return _out(row)


@router.post("/human-checks/{check_id}/linkedin", response_model=CheckOut)
async def use_check_on_linkedin(
    check_id: str, body: LinkedInIn, principal: Principal = Depends(get_principal)
) -> CheckOut:
    try:
        row = await run_in_threadpool(
            lambda: human_check.assign_linkedin(
                _store(), principal.id, check_id, linkedin_url=body.linkedin_url, whatsapp=body.whatsapp
            )
        )
    except _CHECK_ERRORS as exc:
        raise _http(exc) from exc
    return _out(row)


@router.post("/human-checks/linkedin", response_model=CheckOut, status_code=status.HTTP_201_CREATED)
async def buy_linkedin_check_with_coins(body: LinkedInIn, principal: Principal = Depends(get_principal)) -> CheckOut:
    """5,000 coins. Out of coins answers with the shortfall (InsufficientXPError);
    the client then offers the Apply Pack."""
    try:
        row = await human_check.open_linkedin_with_coins(
            _store(), principal.id, linkedin_url=body.linkedin_url, whatsapp=body.whatsapp
        )
    except _CHECK_ERRORS as exc:
        raise _http(exc) from exc
    return _out(row)


# ── reviewer ────────────────────────────────────────────────────────────────


def _stuck_payments(now: datetime) -> list[dict[str, Any]]:
    res = (
        get_supabase_admin()
        .table("billing_payments")
        .select("id, user_id, product, amount_paise, verified_at")
        .eq("grant_pending", True)
        .lt("verified_at", (now - STUCK_AFTER).isoformat())
        .order("verified_at")
        .limit(50)
        .execute()
    )
    return list(res.data or [])


def _with_buyer_email(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ids = sorted({str(r["user_id"]) for r in rows})
    if not ids:
        return rows
    res = get_supabase_admin().table("user_profiles").select("id, email").in_("id", ids).execute()
    email_of = {str(p["id"]): p.get("email") for p in (res.data or [])}
    return [{**r, "buyer_email": email_of.get(str(r["user_id"]))} for r in rows]


@router.get("/admin/human-checks", dependencies=[Depends(require_admin)])
async def reviewer_queue() -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    queue = await run_in_threadpool(_store().open_queue)
    return {
        "checks": await run_in_threadpool(_with_buyer_email, queue),
        "stuck_payments": await run_in_threadpool(_stuck_payments, now),
    }


@router.post("/admin/human-checks/{check_id}/claim", dependencies=[Depends(require_admin)])
async def reviewer_claim(check_id: str) -> dict[str, Any]:
    """Claim a queued check. A LinkedIn check gets its first draft here, written
    from the user's CV — on the reviewer's tap, never on the payment path."""
    store = _store()
    try:
        row = await run_in_threadpool(human_check.claim, store, check_id, _reviewer_name())
    except _CHECK_ERRORS as exc:
        raise _http(exc) from exc
    if row.get("kind") == "linkedin" and not row.get("draft"):
        draft = await linkedin_draft.draft(str(row["user_id"]))
        if draft is not None:
            row = await run_in_threadpool(human_check.store_draft, store, check_id, draft) or row
        logger.info("metric human_check.linkedin_drafted drafted=%s", draft is not None)
    return row


def _assert_reviewed_version(row: dict[str, Any], version_id: int) -> None:
    """A CV check records a version of THIS job's document for THIS user."""
    version = CVRepository(get_supabase_admin()).find(version_id, str(row["user_id"]))
    if version is None or str(version.get("job_id") or "") != str(row.get("job_id") or ""):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That version is not this job's CV.")


@router.post("/admin/human-checks/{check_id}/deliver", dependencies=[Depends(require_admin)])
async def reviewer_deliver(check_id: str, body: DeliverIn) -> dict[str, Any]:
    store = _store()
    row = await run_in_threadpool(store.by_id, check_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Check not found")
    if row.get("kind") == "cv_job" and body.reviewed_cv_version_id is not None:
        await run_in_threadpool(_assert_reviewed_version, row, body.reviewed_cv_version_id)
    try:
        return await run_in_threadpool(
            lambda: human_check.deliver(
                store,
                check_id,
                note=body.note,
                reviewer_name=_reviewer_name(),
                reviewed_cv_version_id=body.reviewed_cv_version_id,
                blocks=body.blocks,
            )
        )
    except _CHECK_ERRORS as exc:
        raise _http(exc) from exc


@router.post("/admin/human-checks/{check_id}/close-call", dependencies=[Depends(require_admin)])
async def reviewer_close_call(check_id: str, body: CloseCallIn) -> dict[str, Any]:
    try:
        return await run_in_threadpool(lambda: human_check.close_call(_store(), check_id, pasted=body.pasted))
    except _CHECK_ERRORS as exc:
        raise _http(exc) from exc


@router.post("/admin/payments/{payment_row_id}/settle", dependencies=[Depends(require_admin)])
async def reviewer_retry_grant(payment_row_id: str) -> dict[str, Any]:
    """Run Settlement again for a payment whose grant never finished."""
    res = (
        get_supabase_admin()
        .table("billing_payments")
        .select("razorpay_order_id, razorpay_payment_id, grant_pending")
        .eq("id", payment_row_id)
        .maybe_single()
        .execute()
    )
    row = (res.data if res else None) or None
    if row is None or not row.get("razorpay_payment_id"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No paid order with that id")
    arrival = Arrival(
        order_id=str(row["razorpay_order_id"]), payment_id=str(row["razorpay_payment_id"]), source="retry"
    )
    result = await settlement.settle(arrival, store=settlement.SupabaseSettlementStore(), grants=settlement.default_grants())
    return {"outcome": result.outcome}
