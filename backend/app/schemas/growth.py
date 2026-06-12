from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


GrowthRole = Literal["owner", "editor", "analyst"]
MessageReviewStatus = Literal["draft", "ready_for_review", "paused"]
PublicationStatus = Literal["published", "failed", "deleted"]


class GrowthOperator(BaseModel):
    user_id: str
    role: GrowthRole
    active: bool
    display_name: str | None = None


class GrowthContentAsset(BaseModel):
    id: str
    legacy_key: str | None = None
    kind: str = "article"
    title: str = ""
    slug: str | None = None
    summary: str | None = None
    canonical_url: str | None = None
    audience: str | None = None
    primary_action: str | None = None
    status: str = "draft"
    sensitivity: str = "low"
    evidence_fresh_until: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    owner_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class GrowthCampaign(BaseModel):
    id: str
    legacy_key: str | None = None
    asset_id: str | None = None
    slug: str | None = None
    name: str = ""
    objective: str | None = None
    audience: str | None = None
    status: str = "draft"
    planned_at: str | None = None
    approved_by: str | None = None
    approved_by_label: str | None = None
    approved_at: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None


class GrowthMessage(BaseModel):
    id: str
    legacy_key: str | None = None
    campaign_id: str | None = None
    asset_id: str | None = None
    channel: str = ""
    format: str | None = None
    variant: str = "primary"
    audience: str | None = None
    intent: str | None = None
    subject: str | None = None
    draft_copy: str = ""
    final_copy: str | None = None
    call_to_action_url: str | None = None
    utm_url: str | None = None
    composer_url: str | None = None
    status: str = "draft"
    automation_level: str = "assisted"
    sensitivity: str = "low"
    reviewer_id: str | None = None
    approved_at: str | None = None
    planned_at: str | None = None
    failure_reason: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None


class GrowthPublication(BaseModel):
    id: str
    legacy_key: str | None = None
    message_id: str
    status: str = "published"
    live_url: str | None = None
    external_id: str | None = None
    published_at: str | None = None
    outcome: dict[str, Any] = Field(default_factory=dict)
    failure_details: str | None = None
    created_by: str | None = None
    created_at: str | None = None


class GrowthCommandSummary(BaseModel):
    assets: int
    campaigns: int
    needs_review: int
    published: int


class GrowthBootstrapResponse(BaseModel):
    operator: GrowthOperator
    assets: list[GrowthContentAsset]
    campaigns: list[GrowthCampaign]
    messages: list[GrowthMessage]
    publications: list[GrowthPublication]
    summary: GrowthCommandSummary


class GrowthMessageUpdate(BaseModel):
    subject: str | None = Field(default=None, max_length=240)
    draft_copy: str | None = Field(default=None, max_length=12000)
    final_copy: str | None = Field(default=None, max_length=12000)
    call_to_action_url: str | None = Field(default=None, max_length=1000)
    utm_url: str | None = Field(default=None, max_length=1200)
    composer_url: str | None = Field(default=None, max_length=1200)
    planned_at: datetime | None = None
    status: MessageReviewStatus | None = None

    @model_validator(mode="after")
    def _require_change(self) -> "GrowthMessageUpdate":
        if not self.model_fields_set:
            raise ValueError("Provide at least one message field to update.")
        return self


class PublicationCreate(BaseModel):
    status: PublicationStatus = "published"
    live_url: str | None = Field(default=None, pattern=r"^https://", max_length=1200)
    external_id: str | None = Field(default=None, max_length=500)
    published_at: datetime | None = None
    outcome: dict[str, Any] = Field(default_factory=dict)
    failure_details: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _validate_outcome(self) -> "PublicationCreate":
        if self.status == "published" and not self.live_url:
            raise ValueError("Published records require a live_url.")
        if self.status == "failed" and not self.failure_details:
            raise ValueError("Failed records require failure_details.")
        return self


class LegacyGrowthImport(BaseModel):
    assets: list[dict[str, Any]] = Field(default_factory=list, max_length=5000)
    campaigns: list[dict[str, Any]] = Field(default_factory=list, max_length=5000)
    messages: list[dict[str, Any]] = Field(default_factory=list, max_length=20000)
    publications: list[dict[str, Any]] = Field(default_factory=list, max_length=20000)

    @model_validator(mode="after")
    def _require_stable_keys(self) -> "LegacyGrowthImport":
        for collection in (
            self.assets,
            self.campaigns,
            self.messages,
            self.publications,
        ):
            if any(not item.get("legacy_key") for item in collection):
                raise ValueError("Every legacy import record requires legacy_key.")
        return self


class LegacyGrowthImportResult(BaseModel):
    ok: bool = True
    assets: int
    campaigns: int
    messages: int
    publications: int
