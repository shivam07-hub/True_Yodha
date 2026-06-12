from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.schemas.newsletter_distribution import CampaignMessageDraft, NewsletterIssueInput


class CampaignNotFoundError(ValueError):
    pass


@dataclass(frozen=True)
class CreatedCampaign:
    id: str
    status: str
    messages: list[CampaignMessageDraft]


class NewsletterCampaignStore:
    def __init__(self, db: Client) -> None:
        self.db = db

    def create(
        self,
        issue: NewsletterIssueInput,
        messages: list[CampaignMessageDraft],
    ) -> CreatedCampaign:
        asset_rows = _rows(
            self.db.table("growth_content_assets")
            .upsert(
                {
                    "legacy_key": f"newsletter:asset:{issue.slug}",
                    "kind": "newsletter",
                    "title": issue.title,
                    "slug": issue.slug,
                    "summary": issue.summary,
                    "canonical_url": issue.canonical_url,
                    "audience": issue.cta_role,
                    "status": "published",
                    "metadata": {
                        "cta_role": issue.cta_role,
                        "issue_number": issue.issue_number,
                    },
                },
                on_conflict="legacy_key",
                ignore_duplicates=False,
            )
            .execute()
        )
        if not asset_rows:
            raise RuntimeError("Failed to create newsletter content asset")
        asset_id = str(asset_rows[0]["id"])
        campaign_rows = _rows(
            self.db.table("growth_campaigns")
            .upsert(
                {
                    "legacy_key": f"newsletter:campaign:{issue.slug}",
                    "asset_id": asset_id,
                    "slug": issue.slug,
                    "name": issue.title,
                    "objective": issue.summary,
                    "audience": issue.cta_role,
                    "status": "ready_for_review",
                    "metadata": {
                        "cta_role": issue.cta_role,
                        "issue_number": issue.issue_number,
                    },
                },
                on_conflict="legacy_key",
                ignore_duplicates=False,
            )
            .execute()
        )
        if not campaign_rows:
            raise RuntimeError("Failed to create newsletter distribution campaign")
        campaign_id = str(campaign_rows[0]["id"])
        message_rows = [
            {
                "campaign_id": campaign_id,
                "asset_id": asset_id,
                "channel": message.channel,
                "variant": message.variant,
                "subject": message.subject,
                "draft_copy": message.body,
                "call_to_action_url": message.call_to_action_url,
                "utm_url": message.call_to_action_url,
                "status": message.status,
                "legacy_key": (
                    f"newsletter:message:{campaign_id}:"
                    f"{message.channel}:{message.variant}"
                ),
            }
            for message in messages
        ]
        if message_rows:
            self.db.table("growth_messages").upsert(
                message_rows,
                on_conflict="campaign_id,channel,variant",
                ignore_duplicates=False,
            ).execute()
        return CreatedCampaign(
            id=campaign_id,
            status="ready_for_review",
            messages=messages,
        )

    def approve(self, campaign_id: str, approved_by: str) -> None:
        result = (
            self.db.table("growth_campaigns")
            .update(
                {
                    "status": "approved",
                    "approved_by_label": approved_by,
                    "approved_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", campaign_id)
            .execute()
        )
        if not _rows(result):
            raise CampaignNotFoundError(campaign_id)
        self.db.table("growth_messages").update(
            {"status": "approved"}
        ).eq("campaign_id", campaign_id).eq("status", "ready_for_review").execute()

    def get(self, campaign_id: str) -> dict[str, Any]:
        rows = _rows(
            self.db.table("growth_campaigns")
            .select("id,asset_id,status,approved_by_label,approved_at,metadata")
            .eq("id", campaign_id)
            .limit(1)
            .execute()
        )
        if not rows:
            raise CampaignNotFoundError(campaign_id)
        asset_rows = _rows(
            self.db.table("growth_content_assets")
            .select("slug,title,summary,canonical_url,metadata")
            .eq("id", rows[0]["asset_id"])
            .limit(1)
            .execute()
        )
        if not asset_rows:
            raise CampaignNotFoundError(f"{campaign_id}:asset")
        asset = asset_rows[0]
        message_rows = _rows(
            self.db.table("growth_messages")
            .select(
                "id,channel,variant,subject,draft_copy,final_copy,"
                "call_to_action_url,status"
            )
            .eq("campaign_id", campaign_id)
            .execute()
        )
        metadata = {**asset.get("metadata", {}), **rows[0].get("metadata", {})}
        return {
            "id": rows[0]["id"],
            "issue_slug": asset["slug"],
            "issue_title": asset["title"],
            "summary": asset["summary"],
            "canonical_url": asset["canonical_url"],
            "cta_role": metadata.get("cta_role"),
            "issue_number": metadata.get("issue_number"),
            "status": rows[0]["status"],
            "approved_by": rows[0].get("approved_by_label"),
            "approved_at": rows[0].get("approved_at"),
            "messages": [_compat_message(row) for row in message_rows],
        }


def _rows(result: Any) -> list[dict[str, Any]]:
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


def _compat_message(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "channel": row["channel"],
        "variant": row["variant"],
        "subject": row.get("subject"),
        "body": row.get("final_copy") or row.get("draft_copy") or "",
        "call_to_action_url": row.get("call_to_action_url") or "",
        "status": "posted" if row.get("status") == "published" else row.get("status"),
    }
