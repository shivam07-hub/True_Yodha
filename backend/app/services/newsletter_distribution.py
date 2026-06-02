from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from app.schemas.newsletter_distribution import (
    CampaignMessageDraft,
    DistributionChannel,
    NewsletterIssueInput,
)


def build_campaign_messages(
    issue: NewsletterIssueInput,
    channels: list[DistributionChannel],
) -> list[CampaignMessageDraft]:
    """Create reviewable copy for each requested newsletter distribution channel."""
    messages: list[CampaignMessageDraft] = []
    requested = set(channels)
    if "email" in requested:
        messages.append(_email_message(issue))
    if "linkedin" in requested:
        messages.append(_linkedin_message(issue))
    if "x" in requested:
        messages.extend(_x_thread(issue))
    if "instagram" in requested:
        messages.append(_instagram_message(issue))
    if "whatsapp" in requested:
        messages.append(_whatsapp_message(issue))
    return messages


def channel_url(issue: NewsletterIssueInput, channel: DistributionChannel, content: str) -> str:
    medium = "outreach" if channel == "email" else "social"
    return _with_utm(
        issue.canonical_url,
        source=channel,
        medium=medium,
        campaign=issue.slug,
        content=content,
    )


def _email_message(issue: NewsletterIssueInput) -> CampaignMessageDraft:
    role = issue.cta_role or "career planning"
    subject = _fit(f"{role}: live hiring map for students", 55)
    url = channel_url(issue, "email", "press-outreach")
    body = (
        "Hi [team],\n\n"
        "We publish Myro Career Intelligence for students and freshers who need "
        "job-market evidence before they choose roles, companies, or skills.\n\n"
        f"Latest issue: {issue.title}\n"
        f"{_clean(issue.summary)}\n\n"
        "If your student or career desk shares practical job-market resources, "
        f"this public issue may help readers:\n{url}\n\n"
        'If this is not useful, reply "unsubscribe" and we will suppress this address.'
    )
    return CampaignMessageDraft(
        channel="email",
        variant="primary",
        subject=subject,
        body=body,
        call_to_action_url=url,
    )


def _linkedin_message(issue: NewsletterIssueInput) -> CampaignMessageDraft:
    url = channel_url(issue, "linkedin", "company-page-post")
    body = (
        f"{_fit(issue.title, 145)}\n\n"
        "Students do not need another motivational job-search post. They need "
        "a map of what companies are actually hiring for.\n\n"
        f"{_clean(issue.summary)}\n\n"
        "We turned the data into a public Myro Newsletter briefing so students "
        f"can compare roles, skills, and target companies before they apply.\n\n"
        f"Read it here: {url}"
    )
    return CampaignMessageDraft(
        channel="linkedin",
        variant="company-page",
        body=_fit(body, 1300),
        call_to_action_url=url,
    )


def _x_thread(issue: NewsletterIssueInput) -> list[CampaignMessageDraft]:
    url = channel_url(issue, "x", "thread")
    summary = _clean(issue.summary)
    return [
        _x_post(issue, "post-1", f"1/ {_fit(issue.title, 245)}"),
        _x_post(
            issue,
            "post-2",
            "2/ The useful question for students is not whether the market is "
            "good or bad. It is where the open roles actually cluster.",
        ),
        _x_post(issue, "post-3", f"3/ {_fit(summary, 248)}"),
        _x_post(
            issue,
            "post-4",
            "4/ The gap Myro tracks: roles, companies, locations, and skills in "
            "one view. Career advice gets sharper when it has evidence.",
        ),
        _x_post(
            issue,
            "post-5",
            "5/ For students: pick one target role, then build proof for the "
            "highest-signal missing skill. Broad searching burns weeks.",
        ),
        _x_post(issue, "post-6", f"6/ Full briefing: {url}"),
    ]


def _x_post(issue: NewsletterIssueInput, variant: str, body: str) -> CampaignMessageDraft:
    url = channel_url(issue, "x", "thread")
    return CampaignMessageDraft(
        channel="x",
        variant=variant,
        body=_fit(body, 280),
        call_to_action_url=url,
    )


def _instagram_message(issue: NewsletterIssueInput) -> CampaignMessageDraft:
    url = channel_url(issue, "instagram", "carousel-caption")
    body = (
        f"{issue.title}\n\n"
        f"{_clean(issue.summary)}\n\n"
        "Carousel angle: turn the strongest chart into 5 slides: hook, map, "
        "top companies, skill gaps, and Myro score CTA.\n\n"
        f"Link target for bio/story: {url}"
    )
    return CampaignMessageDraft(
        channel="instagram",
        variant="carousel-caption",
        body=_fit(body, 2200),
        call_to_action_url=url,
    )


def _whatsapp_message(issue: NewsletterIssueInput) -> CampaignMessageDraft:
    url = channel_url(issue, "whatsapp", "share-message")
    body = (
        f"Myro briefing for students: {issue.title}\n\n"
        f"{_clean(issue.summary)}\n\n"
        f"Read/share: {url}"
    )
    return CampaignMessageDraft(
        channel="whatsapp",
        variant="share-message",
        body=_fit(body, 1000),
        call_to_action_url=url,
    )


def _with_utm(
    url: str,
    *,
    source: str,
    medium: str,
    campaign: str,
    content: str,
) -> str:
    split = urlsplit(url)
    params = [
        (key, value)
        for key, value in parse_qsl(split.query, keep_blank_values=True)
        if not key.startswith("utm_")
    ]
    params.extend(
        [
            ("utm_source", source),
            ("utm_medium", medium),
            ("utm_campaign", campaign),
            ("utm_content", content),
        ]
    )
    return urlunsplit((split.scheme, split.netloc, split.path, urlencode(params), split.fragment))


def _clean(text: str) -> str:
    return " ".join(text.split())


def _fit(text: str, limit: int) -> str:
    clean = _clean(text)
    if len(clean) <= limit:
        return clean
    cutoff = max(0, limit - 3)
    trimmed = clean[:cutoff].rsplit(" ", 1)[0]
    return f"{trimmed or clean[:cutoff]}..."
