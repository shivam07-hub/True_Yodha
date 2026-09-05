"""₹999 AI Workflow Audit — the buyer's two endpoints.

Read what I bought, and hand over the workflow to be audited. Everything else
about an audit's life is a reviewer action on the service role: status is a
lifecycle, not a field a client sets.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.services import ai_workflow_audit

router = APIRouter(prefix="/ai-workflow-audit", tags=["ai-workflow-audit"])


class AuditIntakeRequest(BaseModel):
    what_the_workflow_does: str = Field(max_length=4000)
    tools_used: str = Field(max_length=4000)
    data_it_touches: str = Field(max_length=4000)
    who_checks_the_output: str = Field(max_length=4000)
    what_happens_when_it_is_wrong: str = Field(max_length=4000)


@router.get("/availability")
def audit_availability() -> dict[str, Any]:
    """Whether the queue can take another audit, and how many slots are left.

    Public-facing honesty: the offer says how many audits are open rather than
    selling an unbounded promise and queueing behind it.
    """
    slots = ai_workflow_audit.slots_available()
    return {"available": slots > 0, "slots_open": slots, "price_paise": ai_workflow_audit.AUDIT_PRICE_PAISE}


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
    """Hand over the workflow. Starts the 5-working-day clock."""
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
