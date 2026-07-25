"""Minimise direct personal identifiers before data leaves Myro."""

from __future__ import annotations

import re
from typing import Any

_EMAIL = re.compile(r"(?i)(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?![\w.-])")
_PHONE = re.compile(r"(?<!\w)(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{3,4}(?!\w)")
_IPV4 = re.compile(r"(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])")
_UUID = re.compile(r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b")
_URL = re.compile(r"(?i)\bhttps?://[^\s<>()]+|\b(?:www\.)?linkedin\.com/[^\s<>()]+")


def redact_personal_data_text(value: str) -> str:
    """Remove direct identifiers that external AI providers do not need."""
    text = _EMAIL.sub("[REDACTED_EMAIL]", value)
    text = _PHONE.sub("[REDACTED_PHONE]", text)
    text = _IPV4.sub("[REDACTED_IP]", text)
    text = _UUID.sub("[REDACTED_ID]", text)
    return _URL.sub("[REDACTED_URL]", text)


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
    """Redact a CV header and direct contact fields before cloud analysis."""
    lines = text.splitlines()
    nonempty_seen = 0
    for index, line in enumerate(lines):
        if not line.strip():
            continue
        nonempty_seen += 1
        if nonempty_seen <= 3:
            lines[index] = "[REDACTED_CV_HEADER]"
        if nonempty_seen >= 3:
            break
    return redact_personal_data_text("\n".join(lines))
