from __future__ import annotations

from typing import Any

from app.repositories.newsletter_distribution import NewsletterDistributionRepository
from app.schemas.newsletter_distribution import (
    CampaignMessageDraft,
    ContactStatus,
    NewsletterIssueInput,
    NewsletterOutreachContactInput,
)


class _DuplicateContactDB:
    def __init__(self) -> None:
        self.mode = ""
        self.updated: dict[str, Any] | None = None

    def table(self, _name: str) -> "_DuplicateContactDB":
        return self

    def insert(self, _payload: dict[str, Any]) -> "_DuplicateContactDB":
        self.mode = "insert"
        return self

    def update(self, payload: dict[str, Any]) -> "_DuplicateContactDB":
        self.mode = "update"
        self.updated = payload
        return self

    def eq(self, *_args: Any) -> "_DuplicateContactDB":
        return self

    def execute(self) -> Any:
        if self.mode == "insert":
            raise Exception("duplicate key value violates unique constraint")
        return _Result([{"id": "contact-id"}])


class _RecordingDB:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.current: dict[str, Any] = {}

    def table(self, name: str) -> "_RecordingDB":
        self.current = {"table": name, "filters": []}
        return self

    def select(self, *_args: Any) -> "_RecordingDB":
        self.current["op"] = "select"
        return self

    def update(self, payload: dict[str, Any]) -> "_RecordingDB":
        self.current["op"] = "update"
        self.current["payload"] = payload
        return self

    def upsert(self, payload: Any, **kwargs: Any) -> "_RecordingDB":
        self.current["op"] = "upsert"
        self.current["payload"] = payload
        self.current["kwargs"] = kwargs
        return self

    def insert(self, payload: list[dict[str, Any]] | dict[str, Any]) -> "_RecordingDB":
        self.current["op"] = "insert"
        self.current["payload"] = payload
        return self

    def eq(self, key: str, value: Any) -> "_RecordingDB":
        self.current["filters"].append((key, value))
        return self

    def limit(self, value: int) -> "_RecordingDB":
        self.current["limit"] = value
        return self

    def execute(self) -> Any:
        call = {**self.current, "filters": list(self.current.get("filters", []))}
        self.calls.append(call)
        table = call["table"]
        op = call.get("op")
        if table == "growth_content_assets" and op == "upsert":
            return _Result([{"id": "asset-id"}])
        if table == "growth_campaigns" and op == "upsert":
            return _Result([{"id": "campaign-id", "status": "ready_for_review"}])
        if table == "growth_campaigns" and op == "select":
            return _Result(
                [{"id": "campaign-id", "asset_id": "asset-id", "status": "approved"}]
            )
        if table == "growth_campaigns" and op == "update":
            return _Result([{"id": "campaign-id"}])
        if table == "growth_messages" and op == "select":
            return _Result([{"id": "message-id"}])
        if table == "growth_email_queue" and op == "select":
            return _Result([])
        if table == "growth_outreach_contacts" and op == "select":
            return _Result([{"id": "contact-id", "email": "desk@campus.example"}])
        return _Result([{"id": "ok"}])


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


def _contact(status: ContactStatus = "active") -> NewsletterOutreachContactInput:
    return NewsletterOutreachContactInput(
        organization_name="Campus Times",
        email="desk@campustimes.example",
        contact_type="newspaper",
        outreach_basis="public_media_contact",
        source_label="Public newsroom contact page",
        status=status,
    )


def test_importing_duplicate_active_contact_does_not_reactivate_suppression() -> None:
    db = _DuplicateContactDB()

    NewsletterDistributionRepository(db).import_contacts([_contact("active")])

    assert db.updated is not None
    assert "status" not in db.updated


def test_importing_duplicate_suppressed_contact_updates_status() -> None:
    db = _DuplicateContactDB()

    NewsletterDistributionRepository(db).import_contacts([_contact("suppressed")])

    assert db.updated is not None
    assert db.updated["status"] == "suppressed"


def test_approve_campaign_marks_messages_approved() -> None:
    db = _RecordingDB()

    NewsletterDistributionRepository(db).approve_campaign("campaign-id", "Shivam")

    assert {
        "table": "growth_messages",
        "op": "update",
        "payload": {"status": "approved"},
        "filters": [("campaign_id", "campaign-id"), ("status", "ready_for_review")],
    } in db.calls


def test_queue_email_marks_campaign_and_message_queued() -> None:
    db = _RecordingDB()

    result = NewsletterDistributionRepository(db).queue_email_outreach("campaign-id", 25)

    assert result.queued == 1
    assert {
        "table": "growth_campaigns",
        "op": "update",
        "payload": {"status": "queued"},
        "filters": [("id", "campaign-id")],
    } in db.calls
    assert {
        "table": "growth_messages",
        "op": "update",
        "payload": {"status": "queued"},
        "filters": [("id", "message-id")],
    } in db.calls


def test_create_campaign_uses_generic_asset_campaign_and_message_tables() -> None:
    db = _RecordingDB()
    issue = NewsletterIssueInput(
        slug="2026-06-cv-proof",
        title="How to prove CV impact without inventing metrics",
        summary="A practical guide to writing credible evidence-led CV bullets.",
        canonical_url="https://www.himyro.com/newsletter/2026-06-cv-proof",
        issue_number=8,
    )
    message = CampaignMessageDraft(
        channel="linkedin",
        variant="primary",
        body="Lead with the evidence a hiring manager can verify.",
        call_to_action_url=issue.canonical_url,
    )

    created = NewsletterDistributionRepository(db).create_campaign(issue, [message])

    assert created.id == "campaign-id"
    assert [call["table"] for call in db.calls[:3]] == [
        "growth_content_assets",
        "growth_campaigns",
        "growth_messages",
    ]
    assert db.calls[0]["kwargs"]["on_conflict"] == "legacy_key"
    assert db.calls[2]["payload"][0]["asset_id"] == "asset-id"
