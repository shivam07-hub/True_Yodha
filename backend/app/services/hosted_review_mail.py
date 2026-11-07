"""The two emails around a held internship post.

The reviewer hears the moment a post arrives, so the glance a seeker is
protected by actually happens. The poster hears the moment it is cleared:
that email is her reason to come back. Neither is load-bearing — the row is
already written, and send_email only logs on failure.
"""
from __future__ import annotations

import logging
from typing import Any

from app.config import settings
from app.services.email_service import send_email

logger = logging.getLogger(__name__)


def _label(card: dict[str, Any]) -> str:
    return f"{card.get('job_title') or 'Internship'} at {card.get('company_name') or 'a company'}"


def alert_reviewer(card: dict[str, Any]) -> bool:
    """A new post is waiting. Sent to the ops inbox the Notice digest uses."""
    stipend = card.get("stipend_low_inr")
    text = (
        f"{_label(card)} is waiting for a check before seekers see it.\n\n"
        f"Stipend: INR {stipend}/month · {card.get('duration_months')} months · "
        f"{card.get('location') or card.get('location_mode') or 'no city'}\n\n"
        f"{(card.get('job_description') or '').strip()[:600]}\n\n"
        f"Clear or refuse: POST /jobs/internships/{card.get('job_id')}/review "
        '{"decision": "clear" | "refuse"} with X-Myro-Admin-Token.'
    )
    return send_email(
        to=settings.ops_alert_email,
        subject=f"Internship to check: {_label(card)}",
        text=text,
    )


def tell_poster_live(db: Any, card: dict[str, Any]) -> bool:
    """The post is cleared and seekers can apply."""
    poster_id = card.get("poster_id")
    if not poster_id:
        logger.warning("metric hosted_review.live_mail_skipped reason=no_poster job_id=%s", card.get("job_id"))
        return False
    user = db.auth.admin.get_user_by_id(str(poster_id)).user
    email = getattr(user, "email", None) or ""
    text = (
        f"{_label(card)} is live on Myro. Seekers see it under Apply here and apply "
        "with the CV they already have on Myro.\n\n"
        f"See who applies: {settings.public_app_url}/recruiters"
    )
    return send_email(to=email, subject=f"Your internship is live: {_label(card)}", text=text)
