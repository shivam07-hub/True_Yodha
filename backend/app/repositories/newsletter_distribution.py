from __future__ import annotations

from typing import Any

from fastapi import Depends
from supabase import Client

from app.database import get_supabase_admin
from app.repositories.newsletter_distribution_campaigns import (
    CampaignNotFoundError,
    CreatedCampaign,
    NewsletterCampaignStore,
)
from app.schemas.newsletter_distribution import (
    CampaignMessageDraft,
    ContactImportItemResult,
    ContactImportResponse,
    NewsletterIssueInput,
    NewsletterOutreachContactInput,
    QueueEmailResponse,
)


class CampaignNotApprovedError(ValueError):
    pass


class NewsletterDistributionRepository:
    def __init__(self, db: Client) -> None:
        self.db = db
        self.campaigns = NewsletterCampaignStore(db)

    def import_contacts(
        self, contacts: list[NewsletterOutreachContactInput]
    ) -> ContactImportResponse:
        inserted = 0
        updated = 0
        results: list[ContactImportItemResult] = []
        for contact in contacts:
            payload = _contact_payload(contact)
            try:
                result = (
                    self.db.table("growth_outreach_contacts")
                    .insert(payload)
                    .execute()
                )
            except Exception as exc:
                if not _is_unique_violation(exc):
                    raise
                update_payload = {k: v for k, v in payload.items() if k != "email"}
                if contact.status == "active":
                    update_payload.pop("status", None)
                self.db.table("growth_outreach_contacts").update(
                    update_payload
                ).eq("email", payload["email"]).execute()
                updated += 1
                results.append(ContactImportItemResult(email=payload["email"], action="updated"))
                continue
            if not _rows(result):
                results.append(ContactImportItemResult(email=payload["email"], action="skipped"))
                continue
            inserted += 1
            results.append(ContactImportItemResult(email=payload["email"], action="inserted"))
        return ContactImportResponse(
            ok=True,
            inserted=inserted,
            updated=updated,
            skipped=len(results) - inserted - updated,
            results=results,
        )

    def create_campaign(
        self,
        issue: NewsletterIssueInput,
        messages: list[CampaignMessageDraft],
    ) -> CreatedCampaign:
        return self.campaigns.create(issue, messages)

    def approve_campaign(self, campaign_id: str, approved_by: str) -> None:
        self.campaigns.approve(campaign_id, approved_by)

    def get_campaign(self, campaign_id: str) -> dict[str, Any]:
        return self.campaigns.get(campaign_id)

    def queue_email_outreach(self, campaign_id: str, limit: int) -> QueueEmailResponse:
        campaign = self._campaign(campaign_id)
        if campaign.get("status") != "approved":
            raise CampaignNotApprovedError(campaign_id)

        message = self._email_message(campaign_id)
        existing_contact_ids = self._existing_queue_contact_ids(campaign_id)
        contacts = self._active_contacts(limit)
        payloads: list[dict[str, Any]] = []
        skipped = 0
        for contact in contacts:
            contact_id = str(contact["id"])
            if contact_id in existing_contact_ids:
                skipped += 1
                continue
            payloads.append(
                {
                    "campaign_id": campaign_id,
                    "contact_id": contact_id,
                    "message_id": message["id"],
                    "recipient_email": contact["email"],
                    "status": "queued",
                }
            )
        if payloads:
            self.db.table("growth_email_queue").insert(payloads).execute()
            self.db.table("growth_campaigns").update(
                {"status": "queued"}
            ).eq("id", campaign_id).execute()
            self.db.table("growth_messages").update(
                {"status": "queued"}
            ).eq("id", message["id"]).execute()
        return QueueEmailResponse(
            ok=True,
            campaign_id=campaign_id,
            message_id=str(message["id"]),
            total_active_contacts=len(contacts),
            queued=len(payloads),
            skipped_existing=skipped,
        )

    def _campaign(self, campaign_id: str) -> dict[str, Any]:
        result = (
            self.db.table("growth_campaigns")
            .select("id,status")
            .eq("id", campaign_id)
            .limit(1)
            .execute()
        )
        rows = _rows(result)
        if not rows:
            raise CampaignNotFoundError(campaign_id)
        return rows[0]

    def _email_message(self, campaign_id: str) -> dict[str, Any]:
        result = (
            self.db.table("growth_messages")
            .select("id")
            .eq("campaign_id", campaign_id)
            .eq("channel", "email")
            .eq("variant", "primary")
            .limit(1)
            .execute()
        )
        rows = _rows(result)
        if not rows:
            raise CampaignNotFoundError(f"{campaign_id}:email")
        return rows[0]

    def _existing_queue_contact_ids(self, campaign_id: str) -> set[str]:
        result = (
            self.db.table("growth_email_queue")
            .select("contact_id")
            .eq("campaign_id", campaign_id)
            .execute()
        )
        return {str(row["contact_id"]) for row in _rows(result)}

    def _active_contacts(self, limit: int) -> list[dict[str, Any]]:
        result = (
            self.db.table("growth_outreach_contacts")
            .select("id,email,status")
            .eq("status", "active")
            .limit(limit)
            .execute()
        )
        return _rows(result)


def get_newsletter_distribution_repository(
    db: Client = Depends(get_supabase_admin),
) -> NewsletterDistributionRepository:
    return NewsletterDistributionRepository(db)


def _contact_payload(contact: NewsletterOutreachContactInput) -> dict[str, Any]:
    return {
        "organization_name": contact.organization_name.strip(),
        "email": contact.normalized_email,
        "contact_type": contact.contact_type,
        "outreach_basis": contact.outreach_basis,
        "source_url": contact.source_url,
        "source_label": contact.source_label,
        "status": contact.status,
        "notes": contact.notes,
    }


def _rows(result: Any) -> list[dict[str, Any]]:
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


def _is_unique_violation(exc: Exception) -> bool:
    text = str(exc).lower()
    return "duplicate key" in text or "23505" in text or "already exists" in text
