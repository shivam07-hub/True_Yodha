"""₹999 AI Workflow Audit.

The product sells a person's attention, which is the one thing here that does
not scale. These lock the three things that follow from that: intake is bounded
before money moves, a delivered audit carries a human's name, and the model's
draft never reaches the buyer.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services import ai_workflow_audit as svc

MIGRATION = (
    Path(__file__).parents[2] / "database/migrations/20260905h_ai_workflow_audit.sql"
).read_text()

#: DDL with prose removed — `--` comments and `comment on … is '…';` alike. The
#: file explains its own guarantees, and an assertion looking for a word finds
#: the explanation rather than the constraint.
_NO_LINE_COMMENTS = "\n".join(line.split("--")[0] for line in MIGRATION.splitlines())
DDL = re.sub(r"comment on [^;]+;", "", _NO_LINE_COMMENTS, flags=re.IGNORECASE | re.DOTALL)


def test_an_audit_cannot_be_delivered_without_a_human_name_on_it() -> None:
    """Selling an unread model draft as a reviewed audit is the exact product
    this company argues against. A docstring would not stop it; a CHECK does.

    Verified against prod: inserting `audit_text` alone raises 23514.
    """
    assert "ai_workflow_audits_signed_chk" in DDL
    signed = DDL.split("constraint ai_workflow_audits_signed_chk check (")[1].split("),")[0]
    for column in ("audit_text", "reviewed_by", "signed_off_at"):
        assert column in signed


def test_delivered_means_the_artifact_exists() -> None:
    assert "ai_workflow_audits_delivered_chk" in DDL
    delivered = DDL.split("constraint ai_workflow_audits_delivered_chk check (")[1].split("),")[0]
    assert "audit_text is not null" in delivered


def test_the_models_draft_is_not_in_the_buyers_table() -> None:
    """A user reading their own row through PostgREST must not be able to reach
    an unreviewed draft. Column discipline in a handler is a convention; a
    separate table with no user policy is a boundary."""
    assert "create table if not exists public.ai_workflow_audit_drafts" in DDL
    assert "revoke all on public.ai_workflow_audit_drafts from public, anon, authenticated;" in DDL
    # The only policy in the migration is the buyer reading their own audits.
    policies = re.findall(r"create policy (\w+)", DDL)
    assert policies == ["ai_workflow_audits_select_own"]


def test_the_user_read_never_selects_the_draft() -> None:
    source = Path(svc.__file__).read_text()
    selected = source.split('.select(')[1].split(')')[0]
    assert "draft" not in selected


def test_the_sla_clock_starts_at_submission_not_purchase() -> None:
    """The queue cannot be late for work it has not been given."""
    assert "sla_due_at" in DDL
    submitted = DDL.split("constraint ai_workflow_audits_submitted_chk check (")[1].split("),")[0]
    assert "submitted_at is not null" in submitted and "sla_due_at is not null" in submitted


def test_intake_is_bounded_before_money_moves(monkeypatch: pytest.MonkeyPatch) -> None:
    """Refusing to sell is recoverable. Taking money for work the queue cannot
    absorb is not."""
    monkeypatch.setattr(svc, "open_audit_count", lambda: svc.MAX_OPEN_AUDITS)
    assert svc.is_available() is False
    assert svc.slots_available() == 0
    monkeypatch.setattr(svc, "open_audit_count", lambda: svc.MAX_OPEN_AUDITS - 1)
    assert svc.is_available() is True


def test_a_paid_but_unsubmitted_audit_still_occupies_a_slot() -> None:
    """The money is taken and the promise is live, so the slot is spent."""
    assert "awaiting_submission" in svc._OPEN_STATUSES


def test_every_intake_field_is_required() -> None:
    """An audit written from a half-described workflow is a guess with an
    invoice attached."""
    with pytest.raises(ValueError) as err:
        svc.validate_intake({"tools_used": "x" * 50})
    message = str(err.value)
    assert "what the workflow does" in message
    assert "tools used" not in message  # the one that was answered is not listed


def test_a_too_short_answer_is_treated_as_absent() -> None:
    with pytest.raises(ValueError):
        svc.validate_intake({field: "yes" for field in svc.INTAKE_FIELDS})


def test_a_complete_intake_normalises_and_caps() -> None:
    raw = {field: " " + "x" * 5000 + " " for field in svc.INTAKE_FIELDS}
    cleaned = svc.validate_intake(raw)
    assert set(cleaned) == set(svc.INTAKE_FIELDS)
    assert all(len(v) == 4000 for v in cleaned.values())


def test_activation_never_raises_into_the_payment_path(monkeypatch: pytest.MonkeyPatch) -> None:
    """An exception here would fail a captured payment's fulfilment and strand
    the buyer between charged and served. The payment stays on record in
    `billing_payments`, so a missing row is recoverable by hand."""

    def _explode() -> None:
        raise RuntimeError("data api down")

    monkeypatch.setattr(svc, "get_supabase_admin", _explode)
    svc.activate_audit("user-1")  # must not raise


def test_the_audit_paywalls_nothing_that_is_free_today() -> None:
    """Practice, quizzes and certificates are free and ungated. The audit adds a
    product; it must never gate one.

    Asserted on IMPORTS, not on prose: the module's own docstring says practice
    stays free, and a word-grep finds that sentence rather than a dependency.
    A gate would have to reach one of those modules to exist.
    """
    source = Path(svc.__file__).read_text()
    imports = [line for line in source.splitlines() if re.match(r"^\s*(from|import)\s", line)]
    joined = " ".join(imports)
    for free_surface in ("upskilling", "skill_certificate", "forge", "xp_service", "quiz"):
        assert free_surface not in joined


# ── reviewer workbench ───────────────────────────────────────────────────────


class _Row:
    def __init__(self, data):
        self.data = data


class _FakeDB:
    """Enough of the client to drive `transition_audit` without a database.

    Models `limit(1) -> execute().data -> list`, which is what the real client
    does. An earlier version modelled `maybe_single()`, whose miss returns None
    from execute() itself — the fake happily returned an object, the tests
    passed, and the AttributeError only appeared against the real database.
    """

    def __init__(self, audit: dict) -> None:
        self.audit = audit
        self.patches: list[dict] = []
        self._table = ""

    def table(self, name):
        self._table = name
        return self

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def update(self, patch):
        self.patches.append(patch)
        return self

    def execute(self):
        if self._table == "ai_workflow_audit_drafts":
            return _Row([])          # the normal case: no draft yet
        return _Row([dict(self.audit)])


def _wire(monkeypatch: pytest.MonkeyPatch, audit: dict) -> _FakeDB:
    db = _FakeDB(audit)
    monkeypatch.setattr(svc, "get_supabase_admin", lambda: db)
    return db


def test_delivering_requires_the_reviewers_name(monkeypatch: pytest.MonkeyPatch) -> None:
    """The product IS that a person read this. A signature nobody typed is not a
    signature, so the name is never defaulted and never taken from the token."""
    _wire(monkeypatch, {"id": "a1", "status": "in_progress"})
    with pytest.raises(ValueError, match="name of whoever reviewed it"):
        svc.transition_audit("a1", "delivered", audit_text="a real audit", reviewed_by="  ")


def test_delivering_requires_the_written_audit(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire(monkeypatch, {"id": "a1", "status": "in_progress"})
    with pytest.raises(ValueError, match="needs the written audit"):
        svc.transition_audit("a1", "delivered", audit_text="   ", reviewed_by="Shivam")


def test_delivery_stamps_text_name_and_time_together(monkeypatch: pytest.MonkeyPatch) -> None:
    """The database refuses them apart, so the service must never try."""
    db = _wire(monkeypatch, {"id": "a1", "status": "in_progress"})
    svc.transition_audit("a1", "delivered", audit_text="the audit", reviewed_by="Shivam")
    patch = db.patches[0]
    for field in ("audit_text", "reviewed_by", "signed_off_at", "delivered_at"):
        assert patch[field]
    assert patch["status"] == "delivered"


def test_an_unsubmitted_audit_cannot_be_picked_up(monkeypatch: pytest.MonkeyPatch) -> None:
    """Nothing to review until the buyer has described the workflow."""
    _wire(monkeypatch, {"id": "a1", "status": "awaiting_submission"})
    with pytest.raises(PermissionError):
        svc.transition_audit("a1", "in_progress")


def test_a_delivered_audit_is_terminal(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire(monkeypatch, {"id": "a1", "status": "delivered"})
    with pytest.raises(PermissionError):
        svc.transition_audit("a1", "in_progress")
    with pytest.raises(PermissionError):
        svc.transition_audit("a1", "delivered", audit_text="again", reviewed_by="Shivam")


def test_an_unknown_status_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire(monkeypatch, {"id": "a1", "status": "submitted"})
    with pytest.raises(ValueError, match="Unknown status"):
        svc.transition_audit("a1", "cancelled")


def test_the_reviewer_prompt_forbids_filling_gaps(monkeypatch: pytest.MonkeyPatch) -> None:
    """A draft that invents a plausible detail is the failure mode that matters:
    a human signs this, so an invented concern becomes a claim we made."""
    assert "do not fill the gap" in svc._DRAFT_SYSTEM
    assert "NOTES FOR A HUMAN REVIEWER" in svc._DRAFT_SYSTEM
    assert "never be sent as-is" in svc._DRAFT_SYSTEM


def test_reviewer_endpoints_are_all_admin_gated() -> None:
    router_source = Path(
        Path(svc.__file__).parents[1] / "routers/ai_workflow_audit.py"
    ).read_text()
    reviewer_block = router_source.split("reviewer operations")[1]
    for route in re.findall(r'@router\.\w+\("([^"]+)"([^)]*)\)', reviewer_block, re.DOTALL):
        path, rest = route
        assert "require_admin" in rest, f"{path} is not admin gated"
