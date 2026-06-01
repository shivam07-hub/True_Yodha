from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.repositories.newsletter_distribution import (
    CampaignNotApprovedError,
    CreatedCampaign,
)
from app.routers import newsletter_distribution as distribution_router
from app.schemas.newsletter_distribution import (
    ContactImportItemResult,
    ContactImportResponse,
    QueueEmailResponse,
)

TOKEN = "test-newsletter-agent-token"
HEADERS = {"x-newsletter-agent-token": TOKEN}


class _FakeRepo:
    def __init__(self) -> None:
        self.contacts: list[Any] = []
        self.created_issue: Any = None
        self.created_messages: list[Any] = []
        self.approved: tuple[str, str] | None = None
        self.queue_error: Exception | None = None

    def import_contacts(self, contacts: list[Any]) -> ContactImportResponse:
        self.contacts = contacts
        return ContactImportResponse(
            ok=True,
            inserted=len(contacts),
            updated=0,
            skipped=0,
            results=[
                ContactImportItemResult(email=contact.normalized_email, action="inserted")
                for contact in contacts
            ],
        )

    def create_campaign(self, issue: Any, messages: list[Any]) -> CreatedCampaign:
        self.created_issue = issue
        self.created_messages = messages
        return CreatedCampaign(
            id="00000000-0000-0000-0000-000000000101",
            status="ready_for_review",
            messages=messages,
        )

    def get_campaign(self, campaign_id: str) -> dict[str, Any]:
        return {
            "id": campaign_id,
            "issue_slug": "2026-05-ncr-20-company-watchlist",
            "issue_title": "20 companies NCR students should watch this month",
            "summary": "A public briefing for students comparing active NCR roles.",
            "canonical_url": "https://www.himyro.com/newsletter/2026-05-ncr-20-company-watchlist",
            "cta_role": "Business Analyst",
            "issue_number": 7,
            "status": "ready_for_review",
            "approved_by": None,
            "approved_at": None,
            "messages": [
                {
                    "id": "00000000-0000-0000-0000-000000000303",
                    "channel": "linkedin",
                    "variant": "company-page",
                    "subject": None,
                    "body": "Students need evidence.",
                    "call_to_action_url": "https://www.himyro.com/newsletter/2026-05-ncr-20-company-watchlist",
                    "status": "ready_for_review",
                }
            ],
        }

    def approve_campaign(self, campaign_id: str, approved_by: str) -> None:
        self.approved = (campaign_id, approved_by)

    def queue_email_outreach(self, campaign_id: str, limit: int) -> QueueEmailResponse:
        if self.queue_error:
            raise self.queue_error
        return QueueEmailResponse(
            ok=True,
            campaign_id=campaign_id,
            message_id="00000000-0000-0000-0000-000000000202",
            total_active_contacts=2,
            queued=min(limit, 2),
            skipped_existing=0,
        )


@pytest.fixture
def fake_repo(monkeypatch: pytest.MonkeyPatch):
    repo = _FakeRepo()
    old_token = settings.newsletter_distribution_admin_token
    settings.newsletter_distribution_admin_token = TOKEN
    app.dependency_overrides[
        distribution_router.get_newsletter_distribution_repository
    ] = lambda: repo
    yield repo
    settings.newsletter_distribution_admin_token = old_token
    app.dependency_overrides.pop(
        distribution_router.get_newsletter_distribution_repository, None
    )


def _issue_body() -> dict[str, Any]:
    return {
        "slug": "2026-05-ncr-20-company-watchlist",
        "title": "20 companies NCR students should watch this month",
        "summary": (
            "A public briefing for students comparing active NCR roles, target "
            "companies, and the skills most worth proving before applications."
        ),
        "canonical_url": "https://www.himyro.com/newsletter/2026-05-ncr-20-company-watchlist",
        "cta_role": "Business Analyst",
        "issue_number": 7,
    }


def test_distribution_routes_require_agent_token(fake_repo: _FakeRepo) -> None:
    with TestClient(app) as client:
        response = client.post(
            "/newsletter/distribution/campaigns",
            json={"issue": _issue_body(), "channels": ["email"]},
        )

    assert response.status_code == 401


def test_distribution_routes_are_disabled_without_configured_token(
    fake_repo: _FakeRepo,
) -> None:
    settings.newsletter_distribution_admin_token = ""

    with TestClient(app) as client:
        response = client.post(
            "/newsletter/distribution/campaigns",
            json={"issue": _issue_body(), "channels": ["email"]},
            headers=HEADERS,
        )

    assert response.status_code == 503


def test_create_campaign_generates_reviewable_channel_messages(
    fake_repo: _FakeRepo,
) -> None:
    with TestClient(app) as client:
        response = client.post(
            "/newsletter/distribution/campaigns",
            json={"issue": _issue_body(), "channels": ["email", "linkedin", "x"]},
            headers=HEADERS,
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "ready_for_review"
    assert fake_repo.created_issue.slug == "2026-05-ncr-20-company-watchlist"
    assert len(body["messages"]) == 8
    assert {message["channel"] for message in body["messages"]} == {
        "email",
        "linkedin",
        "x",
    }


def test_import_contacts_preserves_source_and_normalizes_email(
    fake_repo: _FakeRepo,
) -> None:
    with TestClient(app) as client:
        response = client.post(
            "/newsletter/distribution/contacts/import",
            json={
                "contacts": [
                    {
                        "organization_name": "Campus Times",
                        "email": "Desk@CampusTimes.example",
                        "contact_type": "newspaper",
                        "outreach_basis": "public_media_contact",
                        "source_label": "Public newsroom contact page",
                    }
                ]
            },
            headers=HEADERS,
        )

    assert response.status_code == 200, response.text
    assert response.json()["results"][0]["email"] == "desk@campustimes.example"
    assert fake_repo.contacts[0].source_label == "Public newsroom contact page"


def test_get_campaign_returns_reviewable_messages(fake_repo: _FakeRepo) -> None:
    with TestClient(app) as client:
        response = client.get(
            "/newsletter/distribution/campaigns/campaign-id",
            headers=HEADERS,
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == "campaign-id"
    assert body["messages"][0]["channel"] == "linkedin"
    assert body["messages"][0]["status"] == "ready_for_review"


def test_queue_email_requires_campaign_approval(fake_repo: _FakeRepo) -> None:
    fake_repo.queue_error = CampaignNotApprovedError("campaign-id")

    with TestClient(app) as client:
        response = client.post(
            "/newsletter/distribution/campaigns/campaign-id/queue-email",
            json={"limit": 25},
            headers=HEADERS,
        )

    assert response.status_code == 409
    assert "approve" in response.json()["detail"].lower()
