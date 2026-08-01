"""Minimise direct personal identifiers before data leaves Myro.

Two rules govern this module, both learned the hard way:

1. **Redaction is one-way and egress-only.** A `[REDACTED_*]` token is what an
   external provider sees. It must never come back into Myro's own records. If
   one appears in something we are about to persist or print for a user, that is
   a bug, not data — see `contains_redaction_token`.

2. **Never destroy content to hide an identifier.** The previous version blanked
   the first three non-empty lines of every CV. On a CV whose name and contact
   share one line, that deleted the `EXPERIENCE` heading and the first role with
   it — the model never saw the employer. Header removal is now *detected*
   (`cv_contact.header_lines`), and only identifier-bearing lines are dropped.
"""

from __future__ import annotations

import re
from typing import Any

from app.services.cv_contact import (
    has_direct_identifier,
    header_lines,
    PHONE_CANDIDATE,
    is_unambiguous_phone,
    parse_contact,
)

_EMAIL = re.compile(r"(?i)(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?![\w.-])")
_IPV4 = re.compile(r"(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])")
_UUID = re.compile(r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b")
# Identity-bearing URLs only. A general `https?://` sweep also ate the GitHub and
# portfolio links that live inside project bullets — professional content, not a
# direct identifier, and its loss is visible in the user's own CV.
_IDENTITY_URL = re.compile(r"(?i)\b(?:https?://)?(?:[\w-]+\.)?linkedin\.com/[^\s<>()]+")

REDACTION_TOKEN = re.compile(r"\[REDACTED(?:_[A-Z_]+)?\]")


def contains_redaction_token(value: Any) -> bool:
    """True when `value` (str, list, or dict, walked recursively) holds an
    egress redaction marker. Used at write boundaries: a marker in something
    bound for the database or a user-facing artifact is always a defect."""
    if isinstance(value, str):
        return bool(REDACTION_TOKEN.search(value))
    if isinstance(value, dict):
        return any(contains_redaction_token(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return any(contains_redaction_token(v) for v in value)
    return False


def _redact_phones(text: str) -> str:
    """Replace unambiguous phone numbers only.

    This runs over professional content — bullets, JDs, summaries — where the old
    shape-only pattern turned `10-12-2023` and `250 500 1200` into
    `[REDACTED_PHONE]` inside the user's own CV. The contact block is handled
    separately and never reaches a provider, so this is a backstop, and a
    backstop must not damage what it is guarding.
    """
    def sub(match: re.Match[str]) -> str:
        token = match.group(1)
        preceding = text[: match.start()]
        return "[REDACTED_PHONE]" if is_unambiguous_phone(token, preceding) else token

    return PHONE_CANDIDATE.sub(sub, text)


def redact_personal_data_text(value: str) -> str:
    """Remove direct identifiers that external AI providers do not need."""
    text = _EMAIL.sub("[REDACTED_EMAIL]", value)
    text = _redact_phones(text)
    text = _IPV4.sub("[REDACTED_IP]", text)
    text = _UUID.sub("[REDACTED_ID]", text)
    return _IDENTITY_URL.sub("[REDACTED_URL]", text)


def sanitize_ai_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Copy chat messages while redacting direct identifiers in text content."""
    safe: list[dict[str, Any]] = []
    for message in messages:
        item = dict(message)
        if isinstance(item.get("content"), str):
            item["content"] = redact_personal_data_text(item["content"])
        safe.append(item)
    return safe


def sanitize_cv_text_for_ai(text: str) -> str:
    """Drop the CV's contact header, then redact identifiers in the body.

    The header block is *detected*, not counted, and only its identifier-bearing
    lines plus the name line are removed — a headline/role line under the name is
    professional context the extractor needs, so it stays.

    The name itself is read locally by `cv_contact.parse_contact`; nothing in the
    header has to survive this trip.
    """
    header_len = len(header_lines(text))
    if not header_len:
        return redact_personal_data_text(text)

    name = parse_contact(text)["name"]
    kept: list[str] = []
    seen = 0

    for raw in text.splitlines():
        line = raw.strip()
        if seen < header_len and line:
            seen += 1
            # An identifier line carries nothing the extractor needs. The name
            # line goes too — it is read locally, never sent.
            if has_direct_identifier(line) or (name and line.startswith(name) and len(line) <= len(name) + 2):
                continue
        kept.append(raw)
    return redact_personal_data_text("\n".join(kept))
