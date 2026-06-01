from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.config import settings
from app.repositories.newsletter_distribution import (
    CampaignNotApprovedError,
    CampaignNotFoundError,
    NewsletterDistributionRepository,
    get_newsletter_distribution_repository,
)
from app.schemas.newsletter_distribution import (
    CampaignApproveRequest,
    CampaignApproveResponse,
    CampaignCreateRequest,
    CampaignCreateResponse,
    CampaignResponse,
    ContactImportRequest,
    ContactImportResponse,
    QueueEmailRequest,
    QueueEmailResponse,
)
from app.services.newsletter_distribution import build_campaign_messages

router = APIRouter(prefix="/newsletter/distribution", tags=["newsletter-distribution"])


def require_newsletter_distribution_admin(
    x_newsletter_agent_token: str | None = Header(default=None),
) -> None:
    expected = settings.newsletter_distribution_admin_token.strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Newsletter distribution agent is not configured.",
        )
    supplied = (x_newsletter_agent_token or "").strip()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid newsletter distribution token.",
        )


@router.post(
    "/contacts/import",
    response_model=ContactImportResponse,
    dependencies=[Depends(require_newsletter_distribution_admin)],
)
async def import_contacts(
    body: ContactImportRequest,
    repo: NewsletterDistributionRepository = Depends(get_newsletter_distribution_repository),
) -> ContactImportResponse:
    return repo.import_contacts(body.contacts)


@router.post(
    "/campaigns",
    response_model=CampaignCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_newsletter_distribution_admin)],
)
async def create_campaign(
    body: CampaignCreateRequest,
    repo: NewsletterDistributionRepository = Depends(get_newsletter_distribution_repository),
) -> CampaignCreateResponse:
    messages = build_campaign_messages(body.issue, body.channels)
    created = repo.create_campaign(body.issue, messages)
    return CampaignCreateResponse(
        ok=True,
        id=created.id,
        status=created.status,
        messages=created.messages,
    )


@router.get(
    "/campaigns/{campaign_id}",
    response_model=CampaignResponse,
    dependencies=[Depends(require_newsletter_distribution_admin)],
)
async def get_campaign(
    campaign_id: str,
    repo: NewsletterDistributionRepository = Depends(get_newsletter_distribution_repository),
) -> dict:
    try:
        return repo.get_campaign(campaign_id)
    except CampaignNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Newsletter distribution campaign not found.",
        )


@router.post(
    "/campaigns/{campaign_id}/approve",
    response_model=CampaignApproveResponse,
    dependencies=[Depends(require_newsletter_distribution_admin)],
)
async def approve_campaign(
    campaign_id: str,
    body: CampaignApproveRequest,
    repo: NewsletterDistributionRepository = Depends(get_newsletter_distribution_repository),
) -> CampaignApproveResponse:
    try:
        repo.approve_campaign(campaign_id, body.approved_by.strip())
    except CampaignNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Newsletter distribution campaign not found.",
        )
    return CampaignApproveResponse(ok=True, id=campaign_id, status="approved")


@router.post(
    "/campaigns/{campaign_id}/queue-email",
    response_model=QueueEmailResponse,
    dependencies=[Depends(require_newsletter_distribution_admin)],
)
async def queue_email_outreach(
    campaign_id: str,
    body: QueueEmailRequest,
    repo: NewsletterDistributionRepository = Depends(get_newsletter_distribution_repository),
) -> QueueEmailResponse:
    try:
        return repo.queue_email_outreach(campaign_id, body.limit)
    except CampaignNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Newsletter distribution campaign not found.",
        )
    except CampaignNotApprovedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approve the campaign before queueing outreach.",
        )
