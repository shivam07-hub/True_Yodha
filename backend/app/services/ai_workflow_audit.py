"""₹999 AI Workflow Audit — a human reads the workflow you actually run.

The buyer describes an AI workflow they operate; a reviewer returns a written
audit of it. This is bet 4 in POSITIONING.md — human-in-the-loop AI ops — sold
rather than only practised internally.

What it does NOT do is paywall anything that is free today. Practice, quizzes
and certificates remain free and ungated. The ₹999 buys a person's attention,
which is the one thing on this platform that does not scale and therefore is the
one thing worth charging for.

Because it does not scale, intake is BOUNDED. `MAX_OPEN_AUDITS` is checked
before an order is created, not after payment: refusing to sell is recoverable,
taking money for work the queue cannot absorb is not. The bound is small on
purpose and should move only when a reviewer says it can.

Lifecycle mirrors `job_switch_plan_service` — the ₹99 plan is the same shape and
is already live. When there is a third of these, they should become one
primitive; today that refactor would touch a live paid product for no gain.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.database import get_supabase_admin
from app.services.sla_clock import add_working_days

logger = logging.getLogger(__name__)

AUDIT_PRICE_PAISE = 99900          # ₹999
AUDIT_SLA_WORKING_DAYS = 5
#: Concurrent audits the queue will accept. A paid-but-unsubmitted audit still
#: occupies a slot: the money is taken and the promise is live.
MAX_OPEN_AUDITS = 5

_OPEN_STATUSES = ("awaiting_submission", "submitted", "in_progress")

#: The intake. Deliberately few questions, each answerable by someone who runs
#: the workflow rather than someone who designed it — an intake nobody can fill
#: in is an audit nobody buys.
INTAKE_FIELDS = (
    "what_the_workflow_does",
    "tools_used",
    "data_it_touches",
    "who_checks_the_output",
    "what_happens_when_it_is_wrong",
)
_MIN_ANSWER_CHARS = 20
_MAX_ANSWER_CHARS = 4000


def _now() -> datetime:
    return datetime.now(timezone.utc)


def open_audit_count() -> int:
    """How many audits are live. Counts paid-but-unsubmitted too."""
    resp = (
        get_supabase_admin()
        .table("ai_workflow_audits")
        .select("id", count="exact")
        .in_("status", list(_OPEN_STATUSES))
        .limit(1)
        .execute()
    )
    return int(resp.count or 0)


def slots_available() -> int:
    return max(0, MAX_OPEN_AUDITS - open_audit_count())


def is_available() -> bool:
    """Whether the queue can take another audit. Checked BEFORE an order."""
    return slots_available() > 0


def activate_audit(user_id: str) -> None:
    """Create the audit row on payment. Called from the entitlement path.

    Never raises into fulfilment. A row that fails to appear is recoverable —
    the payment is on record in `billing_payments` and the row can be created by
    hand — whereas an exception here would fail a captured payment's fulfilment
    and strand the buyer between charged and served.
    """
    try:
        get_supabase_admin().table("ai_workflow_audits").insert(
            {"user_id": user_id, "status": "awaiting_submission"}
        ).execute()
    except Exception as exc:  # noqa: BLE001 — classified: never break fulfilment
        logger.error(
            "metric ai_workflow_audit.activate_failed user=%s reason=%s",
            user_id,
            type(exc).__name__,
        )


def validate_intake(raw: dict[str, Any]) -> dict[str, str]:
    """Normalise the submitted intake, or say exactly what is missing.

    Every field is required. An audit written from a half-described workflow is
    a guess with an invoice attached.
    """
    cleaned: dict[str, str] = {}
    missing: list[str] = []
    for field in INTAKE_FIELDS:
        value = str(raw.get(field) or "").strip()
        if len(value) < _MIN_ANSWER_CHARS:
            missing.append(field)
            continue
        cleaned[field] = value[:_MAX_ANSWER_CHARS]
    if missing:
        raise ValueError(
            "Tell us a little more about: " + ", ".join(f.replace("_", " ") for f in missing)
        )
    return cleaned


def current_audit(user_id: str) -> dict[str, Any] | None:
    """The buyer's most recent audit. Never returns the model's draft — that
    lives in a table this query cannot reach."""
    resp = (
        get_supabase_admin()
        .table("ai_workflow_audits")
        .select(
            "id, status, intake, audit_text, reviewed_by, signed_off_at, "
            "purchased_at, submitted_at, sla_due_at, delivered_at"
        )
        .eq("user_id", user_id)
        .order("purchased_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def submit_intake(user_id: str, raw: dict[str, Any]) -> dict[str, Any]:
    """Attach the workflow description and start the SLA clock.

    The clock starts here rather than at purchase: the queue cannot be late for
    work it has not been given.
    """
    audit = current_audit(user_id)
    if not audit:
        raise LookupError("No audit has been purchased.")
    if audit["status"] != "awaiting_submission":
        raise PermissionError("This audit has already been submitted.")

    intake = validate_intake(raw)
    now = _now()
    due = add_working_days(now, AUDIT_SLA_WORKING_DAYS)
    get_supabase_admin().table("ai_workflow_audits").update(
        {
            "intake": intake,
            "status": "submitted",
            "submitted_at": now.isoformat(),
            "sla_due_at": due.isoformat(),
            "updated_at": now.isoformat(),
        }
    ).eq("id", audit["id"]).execute()
    logger.info("metric ai_workflow_audit.submitted audit=%s", audit["id"])
    return current_audit(user_id) or {}
