"""Best-effort transactional email via the Resend HTTP API.

The single email pathway. Every backend-originated send goes through here:
Myrology + institutions notify hooks, and the magic-link sign-in email (the
link is minted by ``auth_links`` and delivered here). Other Supabase Auth
emails (confirmation, recovery, email-change) ride Supabase's own SMTP, which
is pointed at the same Resend account.

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
        logger.warning("metric email.skipped reason=no_api_key")
        return False
    if not to.strip():
        logger.warning("metric email.skipped reason=no_recipient")
        return False

    try:
        response = requests.post(
            _RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"from": settings.resend_from_email, "to": [to], "subject": subject, "text": text},
            timeout=_TIMEOUT_SECONDS,
        )
    except requests.exceptions.RequestException as exc:
        logger.warning("metric email.failed reason=network error_type=%s", type(exc).__name__)
        return False

    if response.status_code >= 300:
        logger.warning(
            "metric email.failed reason=http_%s",
            response.status_code,
        )
        return False

    return True
