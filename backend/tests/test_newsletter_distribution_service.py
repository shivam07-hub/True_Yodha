from __future__ import annotations

from urllib.parse import parse_qs, urlsplit

import pytest
from pydantic import ValidationError

from app.schemas.newsletter_distribution import (
    NewsletterIssueInput,
    NewsletterOutreachContactInput,
)
from app.services.newsletter_distribution import build_campaign_messages, channel_url


def _issue() -> NewsletterIssueInput:
    return NewsletterIssueInput(
        slug="2026-05-ncr-20-company-watchlist",
        title="20 companies NCR students should watch this month",
        summary=(
            "A public briefing for students comparing active NCR roles, target "
            "companies, and the skills most worth proving before applications."
        ),
        canonical_url="https://www.himyro.com/newsletter/2026-05-ncr-20-company-watchlist",
        cta_role="Business Analyst",
        issue_number=7,
    )


def test_build_campaign_messages_covers_all_channels_without_auto_send() -> None:
    messages = build_campaign_messages(
        _issue(), ["email", "linkedin", "x", "instagram", "whatsapp"]
    )

    variants = {(message.channel, message.variant) for message in messages}

    assert ("email", "primary") in variants
    assert ("linkedin", "company-page") in variants
    assert ("instagram", "carousel-caption") in variants
    assert ("whatsapp", "share-message") in variants
    assert [message.variant for message in messages if message.channel == "x"] == [
        "post-1",
        "post-2",
        "post-3",
        "post-4",
        "post-5",
        "post-6",
    ]
    assert all(message.status == "ready_for_review" for message in messages)


def test_x_thread_posts_stay_inside_platform_limit() -> None:
    messages = build_campaign_messages(_issue(), ["x"])

    assert len(messages) == 6
    assert all(len(message.body) <= 280 for message in messages)
    assert messages[-1].body.startswith("6/ Full briefing:")
    assert "utm_source=x" in messages[-1].body


def test_channel_url_replaces_stale_utm_params() -> None:
    issue = _issue().model_copy(
        update={"canonical_url": "https://www.himyro.com/newsletter/demo?utm_source=old&keep=1"}
    )

    tracked = channel_url(issue, "linkedin", "company-page-post")
    params = parse_qs(urlsplit(tracked).query)

    assert params["keep"] == ["1"]
    assert params["utm_source"] == ["linkedin"]
    assert params["utm_medium"] == ["social"]
    assert params["utm_campaign"] == [issue.slug]
    assert params["utm_content"] == ["company-page-post"]


def test_contact_import_requires_provenance() -> None:
    with pytest.raises(ValidationError):
        NewsletterOutreachContactInput(
            organization_name="Campus Times",
            email="desk@campustimes.example",
            outreach_basis="public_media_contact",
        )


def test_contact_import_normalizes_email() -> None:
    contact = NewsletterOutreachContactInput(
        organization_name="Campus Times",
        email="Desk@CampusTimes.example",
        outreach_basis="public_media_contact",
        source_label="Public newsroom contact page",
    )

    assert contact.normalized_email == "desk@campustimes.example"
