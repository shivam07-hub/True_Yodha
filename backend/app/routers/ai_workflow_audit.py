"""₹999 AI Workflow Audit — the buyer's two endpoints.

Read what I bought, and hand over the workflow to be audited. Everything else
about an audit's life is a reviewer action on the service role: status is a
lifecycle, not a field a client sets.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.security.admin_auth import require_admin
from app.services import ai_workflow_audit, shared_cache

router = APIRouter(prefix="/ai-workflow-audit", tags=["ai-workflow-audit"])


class AuditIntakeRequest(BaseModel):
    what_the_workflow_does: str = Field(max_length=4000)
    tools_used: str = Field(max_length=4000)
    data_it_touches: str = Field(max_length=4000)
    who_checks_the_output: str = Field(max_length=4000)
    what_happens_when_it_is_wrong: str = Field(max_length=4000)
    when_you_are_free: str = Field(max_length=4000)


def _availability() -> dict[str, Any]:
    slots = ai_workflow_audit.slots_available()
    return {
        "available": slots > 0,
        "slots_open": slots,
        "price_paise": ai_workflow_audit.AUDIT_PRICE_PAISE,
    }


@router.get("/availability")
def audit_availability(response: Response) -> dict[str, Any]:
    """Whether the queue can take another audit, and how many slots are left.

    Public-facing honesty: the offer says how many audits are open rather than
    selling an unbounded promise and queueing behind it.

    Cached 60s. It is an unauthenticated read that renders on a page load, and
    the count moves only when someone buys or a call is finished. Staleness is
    safe here because the ORDER is what enforces capacity: a buyer who acts on a
    60-second-old count meets a 409 and is told the slot went, rather than
    silently joining a queue nobody can serve.
    """
    response.headers["Cache-Control"] = "public, max-age=60"
    return shared_cache.get_or_compute(
        "ai_workflow_audit_availability", _availability, ttl_seconds=60, stale_seconds=600
    )


@router.get("/me")
def my_audit(principal: Principal = Depends(get_principal)) -> dict[str, Any]:
    """The buyer's most recent audit, or `null` if they have never bought one.

    Never carries the model's draft: that lives in a reviewer-only table this
    read cannot reach.
    """
    return {"audit": ai_workflow_audit.current_audit(principal.id)}


@router.post("/submit")
def submit_audit_intake(
    body: AuditIntakeRequest,
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    """Hand over the workflow. Starts the 5-working-day clock to the call."""
    try:
        audit = ai_workflow_audit.submit_intake(principal.id, body.model_dump())
    except LookupError:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Buy the audit first.",
        ) from None
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already sent this one in. We will come back to you by the date on your audit.",
        ) from None
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from None
    return {"audit": audit}


# ── reviewer operations (admin-token gated) ─────────────────────────────────


class AuditStatusUpdate(BaseModel):
    status: str
    audit_text: str | None = None
    #: Who read it. Required to deliver, never defaulted — the product IS that a
    #: person did this, and a signature nobody typed is not a signature.
    reviewed_by: str | None = Field(default=None, max_length=120)


@router.get("/queue", dependencies=[Depends(require_admin)])
def audit_queue() -> dict[str, Any]:
    """Open audits, oldest SLA first, with the buyer's email so a call can be
    arranged. Behind the reviewer token."""
    return {"queue": ai_workflow_audit.review_queue()}


@router.get("/queue/{audit_id}", dependencies=[Depends(require_admin)])
def audit_detail(audit_id: str) -> dict[str, Any]:
    """One audit as the reviewer sees it: intake plus any model draft."""
    try:
        return {"audit": ai_workflow_audit.reviewer_view(audit_id)}
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such audit.") from None


@router.post("/queue/{audit_id}/draft", dependencies=[Depends(require_admin)])
async def draft_audit_notes(audit_id: str) -> dict[str, Any]:
    """Model-draft the reviewer's notes before the call.

    Notes FOR the reviewer, never text for the buyer: they land in a table the
    buyer cannot read, and delivering still requires a human to write and sign
    the audit. Fail-soft — a provider outage returns `drafted: false` and the
    reviewer writes their own.
    """
    try:
        draft = await ai_workflow_audit.draft_audit(audit_id)
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such audit.") from None
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
    return {"drafted": draft is not None, "draft_text": draft}


@router.patch("/queue/{audit_id}/status", dependencies=[Depends(require_admin)])
def update_audit_status(audit_id: str, body: AuditStatusUpdate) -> dict[str, Any]:
    """Advance an audit: submitted → in_progress → delivered.

    Delivering stamps the written audit, the reviewer's name and the sign-off
    time together, because the database will not accept them apart.
    """
    try:
        audit = ai_workflow_audit.transition_audit(
            audit_id,
            body.status,
            audit_text=body.audit_text,
            reviewed_by=body.reviewed_by,
        )
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such audit.") from None
    except PermissionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from None
    return {"audit": audit}
