from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


DistributionChannel = Literal["email", "linkedin", "x", "instagram", "whatsapp"]
CampaignStatus = Literal[
    "draft",
    "ready_for_review",
    "approved",
    "queued",
    "sent",
    "failed",
    "cancelled",
]
MessageStatus = Literal[
    "draft",
    "ready_for_review",
    "approved",
    "queued",
    "sent",
    "posted",
    "failed",
    "skipped",
]
ContactType = Literal[
    "newspaper",
    "college",
    "student_community",
    "company",
    "partner",
    "other",
]
OutreachBasis = Literal[
    "public_media_contact",
    "existing_relationship",
    "opt_in",
    "manual_research",
    "partner_referral",
]
ContactStatus = Literal["active", "unsubscribed", "bounced", "suppressed"]


class NewsletterIssueInput(BaseModel):
    slug: str = Field(min_length=3, max_length=140, pattern=r"^[a-z0-9][a-z0-9-]+$")
    title: str = Field(min_length=6, max_length=180)
    summary: str = Field(min_length=20, max_length=600)
    canonical_url: str = Field(min_length=12, max_length=500, pattern=r"^https://")
    cta_role: str | None = Field(default=None, max_length=120)
    issue_number: int | None = Field(default=None, ge=1, le=999)

    @field_validator("slug", "title", "summary", "canonical_url", "cta_role")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class NewsletterOutreachContactInput(BaseModel):
    organization_name: str = Field(min_length=2, max_length=180)
    email: EmailStr
    contact_type: ContactType = "newspaper"
    outreach_basis: OutreachBasis
    source_url: str | None = Field(default=None, max_length=500)
    source_label: str | None = Field(default=None, max_length=180)
    status: ContactStatus = "active"
    notes: str | None = Field(default=None, max_length=600)

    @field_validator("organization_name", "source_url", "source_label", "notes")
    @classmethod
    def _strip_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @model_validator(mode="after")
    def _source_required(self) -> "NewsletterOutreachContactInput":
        if not self.source_url and not self.source_label:
            raise ValueError("Provide source_url or source_label for outreach provenance.")
        return self

    @property
    def normalized_email(self) -> str:
        return str(self.email).strip().lower()


class ContactImportRequest(BaseModel):
    contacts: list[NewsletterOutreachContactInput] = Field(min_length=1, max_length=500)


class ContactImportItemResult(BaseModel):
    email: str
    action: Literal["inserted", "updated", "skipped"]


class ContactImportResponse(BaseModel):
    ok: bool
    inserted: int
    updated: int
    skipped: int
    results: list[ContactImportItemResult]


class CampaignMessageDraft(BaseModel):
    channel: DistributionChannel
    variant: str = Field(min_length=2, max_length=40)
    subject: str | None = Field(default=None, max_length=120)
    body: str = Field(min_length=10, max_length=3000)
    call_to_action_url: str = Field(min_length=12, max_length=700)
    status: MessageStatus = "ready_for_review"


class CampaignCreateRequest(BaseModel):
    issue: NewsletterIssueInput
    channels: list[DistributionChannel] = Field(
        default_factory=lambda: ["email", "linkedin", "x", "instagram", "whatsapp"],
        min_length=1,
        max_length=5,
    )

    @field_validator("channels")
    @classmethod
    def _dedupe_channels(
        cls, value: list[DistributionChannel]
    ) -> list[DistributionChannel]:
        return list(dict.fromkeys(value))


class CampaignCreateResponse(BaseModel):
    ok: bool
    id: str
    status: CampaignStatus
    messages: list[CampaignMessageDraft]


class CampaignMessageResponse(BaseModel):
    id: str
    channel: DistributionChannel
    variant: str
    subject: str | None = None
    body: str
    call_to_action_url: str
    status: MessageStatus


class CampaignResponse(BaseModel):
    ok: bool = True
    id: str
    issue_slug: str
    issue_title: str
    summary: str
    canonical_url: str
    cta_role: str | None = None
    issue_number: int | None = None
    status: CampaignStatus
    approved_by: str | None = None
    approved_at: str | None = None
    messages: list[CampaignMessageResponse]


class CampaignApproveRequest(BaseModel):
    approved_by: str = Field(min_length=2, max_length=120)


class CampaignApproveResponse(BaseModel):
    ok: bool
    id: str
    status: Literal["approved"]


class QueueEmailRequest(BaseModel):
    limit: int = Field(default=250, ge=1, le=5000)


class QueueEmailResponse(BaseModel):
    ok: bool
    campaign_id: str
    message_id: str
    total_active_contacts: int
    queued: int
    skipped_existing: int
