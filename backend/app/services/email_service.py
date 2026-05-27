"""Best-effort transactional email via the Resend HTTP API.

Magic-link / auth emails still flow through Supabase SMTP. This module covers
custom backend-originated sends (currently the Myrology booking notification).

Design: a send must NEVER be load-bearing for the action that triggered it. A
missing key or a failed POST logs a structured warning and returns False — the
caller has already persisted the durable row before calling here.
"""

from __future__ import annotations

import logging

import requests

from app.config import settings

logger = logging.getLogger(__name__)

_RESEND_ENDPOINT = "https://api.resend.com/emails"
_TIMEOUT_SECONDS = 8


def send_email(*, to: str, subject: str, text: str) -> bool:
    """Send a plain-text email. Returns True on a 2xx, False on any failure."""
    api_key = settings.resend_api_key.strip()
    if not api_key:
        logger.warning("metric email.skipped reason=no_api_key subject=%r", subject)
        return False
    if not to.strip():
        logger.warning("metric email.skipped reason=no_recipient subject=%r", subject)
        return False

    try:
        response = requests.post(
            _RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"from": settings.resend_from_email, "to": [to], "subject": subject, "text": text},
            timeout=_TIMEOUT_SECONDS,
        )
    except requests.exceptions.RequestException as exc:
        logger.warning("metric email.failed reason=network subject=%r error=%s", subject, exc)
        return False

    if response.status_code >= 300:
        logger.warning(
            "metric email.failed reason=http_%s subject=%r body=%s",
            response.status_code,
            subject,
            response.text[:200],
        )
        return False

    return True
