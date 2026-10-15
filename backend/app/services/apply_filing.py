"""Whether Myro may accept a Yes to file one tailored CV.

A filing Yes is not an application. `applied` stays the person's confirmed
submission, and a later worker may write it only after the company page
returns a receipt. This module decides the Yes. It does no I/O.

The judge score is `user_job_matches.overall_score`, 0–5. 3.5 is the
qualified-application floor (APPLY1), not the 4.0 Agent Picks bar.

The listing clock is `listing_time.verdict`. A crawler sighting is not a
check, so it cannot clear the gate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Mapping
from urllib.parse import urlparse

from app.services.listing_time import verdict

QUALIFIED_SCORE = 3.5
MIN_RECEIPT_CHARS = 12

LISTING_CLOSED = "listing_closed"
LISTING_UNCONFIRMED = "listing_unconfirmed"
BELOW_JUDGE = "below_judge"
NO_TAILORED_CV = "no_tailored_cv"
NO_YES = "no_yes"
STALE_CV = "stale_cv"
RECEIPT_HOST = "receipt_host"
RECEIPT_TEXT = "receipt_text"

HOLD_LOGIN = "login"
HOLD_CAPTCHA = "captcha"
HOLD_UNANSWERED = "unanswered"
HOLD_RESUME = "resume"
HOLD_REASONS = frozenset({HOLD_LOGIN, HOLD_CAPTCHA, HOLD_UNANSWERED, HOLD_RESUME})


@dataclass(frozen=True)
class FilingFacts:
    """What the gate needs, already loaded. `listing` is a jobs row."""

    listing: Mapping[str, Any]
    judge_score: Any
    tailored_cv_id: Any


@dataclass(frozen=True)
class FilingDecision:
    ready: bool
    blocks: tuple[str, ...]
    judge_score: float | None
    cv_version_id: int | None


def decide(
    facts: FilingFacts,
    *,
    now: datetime,
    yes: bool | None = None,
) -> FilingDecision:
    """Name every reason a filing Yes cannot be stored.

    `yes is None` is a read: the person has not been asked on this call.
    `yes is False` adds `no_yes` and is never ready. A True that still
    carries another block is not ready either.
    """
    listing = verdict(facts.listing, now=now)
    blocks: list[str] = []
    if listing.state == "closed":
        blocks.append(LISTING_CLOSED)
    elif listing.state != "confirmed_open":
        blocks.append(LISTING_UNCONFIRMED)

    score = _score(facts.judge_score)
    if score is None or score < QUALIFIED_SCORE:
        blocks.append(BELOW_JUDGE)

    cv_id = _cv_id(facts.tailored_cv_id)
    if cv_id is None:
        blocks.append(NO_TAILORED_CV)

    if yes is False:
        blocks.append(NO_YES)

    return FilingDecision(
        ready=not blocks,
        blocks=tuple(blocks),
        judge_score=score,
        cv_version_id=cv_id,
    )


def with_stored_cv(decision: FilingDecision, stored_cv_id: int | None) -> FilingDecision:
    """A stored Yes names one CV. A newer tailored CV needs a new Yes."""
    if stored_cv_id is None or decision.cv_version_id is None:
        return decision
    if stored_cv_id == decision.cv_version_id:
        return decision
    blocks = tuple(dict.fromkeys((*decision.blocks, STALE_CV)))
    return FilingDecision(
        ready=False,
        blocks=blocks,
        judge_score=decision.judge_score,
        cv_version_id=decision.cv_version_id,
    )


def receipt_block(*, urls: list[str], receipt_url: str, receipt_text: str) -> str | None:
    """None when the confirmation is on this job's company host and has text.

    The host is the job's apply URL or its source URL, with a leading www
    ignored. A receipt from any other site is a different page.
    """
    text = receipt_text.strip() if isinstance(receipt_text, str) else ""
    if len(text) < MIN_RECEIPT_CHARS:
        return RECEIPT_TEXT
    host = _http_host(receipt_url)
    allowed = {item for item in (_http_host(url) for url in urls) if item}
    if host is None or host not in allowed:
        return RECEIPT_HOST
    return None


def _http_host(url: str) -> str | None:
    if not isinstance(url, str) or not url.strip():
        return None
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    host = parsed.hostname.lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def _score(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def as_cv_id(value: Any) -> int | None:
    return _cv_id(value)


def _cv_id(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None
