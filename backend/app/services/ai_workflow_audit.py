"""₹999 AI Workflow Audit — a call about the AI workflow you actually run.

The buyer describes a workflow they operate; a reviewer reads it, then **the
service is a call**. The written audit is the artifact that comes out of that
call, not a report mailed instead of one. This is bet 4 in POSITIONING.md —
human-in-the-loop AI ops — sold rather than only practised internally.

No refund path exists, deliberately: this is a service business and the call is
the service. Delivery is a person turning up, so the honest guarantee is the
date, not a money-back clause.

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
    # The service is a call, so when the buyer can take one is part of the
    # brief, not an afterthought arranged over email later. Free text rather
    # than a slot picker: one reviewer, a handful of audits, and a picker would
    # be scheduling infrastructure built for a queue of five.
    "when_you_are_free",
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


# ── reviewer operations ──────────────────────────────────────────────────────
#
# Back of house. Everything below is admin-token gated at the router; none of it
# is reachable by a buyer's session.

#: Target status => the statuses it may be reached from. `delivered` is terminal.
#: Mirrors `job_switch_plan_service._ALLOWED_REVIEW_TRANSITIONS` — same lifecycle,
#: same words, so the two merge cleanly when there is a third of these.
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "in_progress": {"submitted"},
    "delivered": {"submitted", "in_progress"},
}

_DRAFT_MAX_TOKENS = 1100

_DRAFT_SYSTEM = (
    "You are preparing NOTES FOR A HUMAN REVIEWER before they get on a call "
    "about someone's AI workflow. You are not writing to the buyer and your "
    "text will never be sent as-is.\n\n"
    "Ground every line in what the buyer wrote. Where they left something out, "
    "say what is missing and what to ask on the call — do not fill the gap with "
    "a plausible assumption. If the workflow looks fine in some respect, say so "
    "plainly rather than inventing a concern.\n\n"
    "Cover, in this order: where this can be wrong without anyone noticing; "
    "what it touches that it probably should not; who is accountable when it "
    "fails and whether that person can actually act; and the smallest change "
    "worth making first.\n\n"
    "No preamble, no flattery, no summary of what they told you."
)


def _intake_block(intake: dict[str, Any]) -> str:
    return "\n\n".join(
        f"{field.replace('_', ' ').upper()}:\n{intake.get(field, '(not answered)')}"
        for field in INTAKE_FIELDS
    )


def review_queue() -> list[dict[str, Any]]:
    """Open audits, oldest SLA first, with the buyer's email.

    The email is here because the service is a CALL and the reviewer has to be
    able to reach them. It is the one place buyer contact details leave the
    user's own row, and it is behind the admin token.
    """
    admin = get_supabase_admin()
    audits = (
        admin.table("ai_workflow_audits")
        .select("id, user_id, status, intake, submitted_at, sla_due_at, purchased_at")
        .in_("status", ["submitted", "in_progress"])
        .order("sla_due_at", desc=False)
        .limit(50)
        .execute()
        .data
        or []
    )
    if not audits:
        return []
    # One batched lookup, not one per row.
    profiles = (
        admin.table("user_profiles")
        .select("id, email")
        .in_("id", list({str(a["user_id"]) for a in audits}))
        .execute()
        .data
        or []
    )
    email_of = {str(p["id"]): p.get("email") for p in profiles}
    for audit in audits:
        audit["buyer_email"] = email_of.get(str(audit["user_id"]))
    return audits


def reviewer_view(audit_id: str) -> dict[str, Any]:
    """One audit as the reviewer sees it: the intake plus any model draft."""
    admin = get_supabase_admin()
    # `.limit(1)` + list rather than `.maybe_single()`: on a miss the client
    # returns None from execute() itself, so `.data` raises AttributeError
    # instead of yielding an empty result. An audit with no draft yet is the
    # NORMAL case here, not an error.
    audits = (
        admin.table("ai_workflow_audits")
        .select("*")
        .eq("id", audit_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not audits:
        raise LookupError("No such audit.")
    audit = audits[0]
    drafts = (
        admin.table("ai_workflow_audit_drafts")
        .select("draft_text, model, generated_at")
        .eq("audit_id", audit_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    audit["draft"] = drafts[0] if drafts else None
    return audit


async def draft_audit(audit_id: str) -> str | None:
    """Model-draft the reviewer's notes and store them.

    Fail-soft: a draft failure returns None and changes nothing, so the reviewer
    writes their own notes rather than being blocked by a provider outage. The
    draft is never the deliverable — the buyer cannot read this table, and
    delivering still requires a human's name.
    """
    from app.services.llm_provider import LLMProviderError, get_llm_provider

    audit = reviewer_view(audit_id)
    intake = audit.get("intake") or {}
    if not intake:
        raise ValueError("This audit has no intake yet.")

    try:
        provider = get_llm_provider()
        text = await provider.complete(
            [
                {"role": "system", "content": _DRAFT_SYSTEM},
                {"role": "user", "content": _intake_block(intake)},
            ],
            max_tokens=_DRAFT_MAX_TOKENS,
        )
    except LLMProviderError:
        logger.warning("metric ai_workflow_audit.draft_failed audit=%s", audit_id)
        return None

    text = (text or "").strip()
    if not text:
        return None
    get_supabase_admin().table("ai_workflow_audit_drafts").upsert(
        {"audit_id": audit_id, "draft_text": text, "model": "provider_default"},
        on_conflict="audit_id",
    ).execute()
    return text


def transition_audit(
    audit_id: str,
    new_status: str,
    *,
    audit_text: str | None = None,
    reviewed_by: str | None = None,
) -> dict[str, Any]:
    """Advance an audit. Delivering requires the written audit AND a name.

    The name is not defaulted and not inferred from a token: the whole product
    is that a person read this, and a signature nobody typed is not a signature.
    The database enforces the same rule, so a caller that skips it fails there
    too rather than writing a half-signed row.
    """
    allowed_from = _ALLOWED_TRANSITIONS.get(new_status)
    if allowed_from is None:
        raise ValueError(f"Unknown status: {new_status}")

    audit = reviewer_view(audit_id)
    if audit["status"] not in allowed_from:
        raise PermissionError(
            f"An audit that is {audit['status']} cannot become {new_status}."
        )

    now = _now()
    patch: dict[str, Any] = {"status": new_status, "updated_at": now.isoformat()}
    if new_status == "delivered":
        text = (audit_text or "").strip()
        signer = (reviewed_by or "").strip()
        if not text:
            raise ValueError("A delivered audit needs the written audit.")
        if not signer:
            raise ValueError("A delivered audit needs the name of whoever reviewed it.")
        patch |= {
            "audit_text": text,
            "reviewed_by": signer,
            "signed_off_at": now.isoformat(),
            "delivered_at": now.isoformat(),
        }

    get_supabase_admin().table("ai_workflow_audits").update(patch).eq("id", audit_id).execute()
    logger.info(
        "metric ai_workflow_audit.transition audit=%s status=%s", audit_id, new_status
    )
    return reviewer_view(audit_id)
