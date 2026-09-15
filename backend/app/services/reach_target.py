"""Reach Target — ADR-0018 Path 3.

The user nominates a LinkedIn /in/{vanity} URL they opened themselves and types
the name they read there. This module parses that URL, fills Path 2 placeholders
once a name exists, and owns the send-ledger transitions. It never fetches a
profile and never sends a message.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from urllib.parse import unquote, urlparse

FOLLOWUP_DAYS = 3
MAX_TARGETS_PER_USER = 80

_ALLOWED_ADVANCES = {
    ("queued", "sent"),
    ("sent", "followed_up"),
    ("queued", "replied"),
    ("sent", "replied"),
    ("followed_up", "replied"),
    ("queued", "stopped"),
    ("sent", "stopped"),
    ("followed_up", "stopped"),
}

_VANITY = re.compile(r"^[A-Za-z0-9\-_%]{2,100}$")


def parse_linkedin_profile_url(raw: str) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    lowered = text.lower()
    if "://" not in text:
        if lowered.startswith("linkedin.com/") or lowered.startswith("www.linkedin.com/"):
            text = "https://" + text
        else:
            return None
    parsed = urlparse(text)
    host = (parsed.hostname or "").lower()
    if host != "linkedin.com" and not host.endswith(".linkedin.com"):
        return None
    parts = [p for p in unquote(parsed.path or "").split("/") if p]
    if len(parts) < 2 or parts[0].lower() != "in":
        return None
    vanity = parts[1].lower()
    if not _VANITY.match(vanity):
        return None
    return f"https://www.linkedin.com/in/{vanity}"


def fill_first_name(template: str, display_name: str) -> str:
    first = (display_name or "").strip().split()[0] if (display_name or "").strip() else ""
    if not first:
        return template
    return template.replace("{first name}", first).replace("{first_name}", first)


def can_advance(current: str, nxt: str) -> bool:
    return (current, nxt) in _ALLOWED_ADVANCES


def followup_due_at(sent_at: datetime) -> datetime:
    return sent_at + timedelta(days=FOLLOWUP_DAYS)


def is_due(status: str, due_at: datetime | None, now: datetime) -> bool:
    return status == "sent" and due_at is not None and due_at <= now
