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

# `[REDACTED]`, `[REDACTED_EMAIL]`, `[REDACTED_CV_HEADER]`, and the numbered
# `[REDACTED_EMAIL_1]` a ledger issues. All of them are tokens at a write gate.
REDACTION_TOKEN = re.compile(r"\[REDACTED(?:_[A-Z]+)*(?:_\d+)?\]")
_LEDGER_TOKEN = re.compile(r"\[REDACTED_[A-Z]+_\d+\]")


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


class _Marker:
    """Hands out the token for one identifier.

    Without a ledger every identifier of a kind gets the same fixed token, as
    always. With one, each distinct original gets a numbered token and the
    ledger remembers it — in this process, never sent — so a parse that copies
    bullets verbatim can have the original put back (`restore_redactions`).
    """

    def __init__(self, ledger: dict[str, str] | None) -> None:
        self._ledger = ledger
        self._by_original: dict[tuple[str, str], str] = {}

    def __call__(self, kind: str, original: str) -> str:
        if self._ledger is None:
            return f"[REDACTED_{kind}]"
        key = (kind, original)
        token = self._by_original.get(key)
        if token is None:
            n = sum(1 for k, _ in self._by_original if k == kind) + 1
            token = f"[REDACTED_{kind}_{n}]"
            self._by_original[key] = token
            self._ledger[token] = original
        return token


def restore_redactions(value: Any, ledger: dict[str, str]) -> Any:
    """Put a ledger's originals back into a parsed payload (str, list, dict).

    A token the ledger does not hold is left as it is, so the write gate still
    refuses it — a model that mangled a token has not been believed.
    """
    if isinstance(value, str):
        return _LEDGER_TOKEN.sub(lambda m: ledger.get(m.group(0), m.group(0)), value)
    if isinstance(value, dict):
        return {k: restore_redactions(v, ledger) for k, v in value.items()}
    if isinstance(value, list):
        return [restore_redactions(v, ledger) for v in value]
    return value


def _redact_phones(text: str, mark: _Marker | None = None) -> str:
    """Replace unambiguous phone numbers only.

    This runs over professional content — bullets, JDs, summaries — where the old
    shape-only pattern turned `10-12-2023` and `250 500 1200` into
    `[REDACTED_PHONE]` inside the user's own CV. The contact block is handled
    separately and never reaches a provider, so this is a backstop, and a
    backstop must not damage what it is guarding.
    """
    marker = mark or _Marker(None)

    def sub(match: re.Match[str]) -> str:
        token = match.group(1)
        preceding = text[: match.start()]
        return marker("PHONE", token) if is_unambiguous_phone(token, preceding) else token

    return PHONE_CANDIDATE.sub(sub, text)


def redact_personal_data_text(value: str, *, ledger: dict[str, str] | None = None) -> str:
    """Remove direct identifiers that external AI providers do not need.

    Pass a `ledger` to get numbered tokens whose originals it keeps.
    """
    mark = _Marker(ledger)
    text = _EMAIL.sub(lambda m: mark("EMAIL", m.group(0)), value)
    text = _redact_phones(text, mark)
    text = _IPV4.sub(lambda m: mark("IP", m.group(0)), text)
    text = _UUID.sub(lambda m: mark("ID", m.group(0)), text)
    return _IDENTITY_URL.sub(lambda m: mark("URL", m.group(0)), text)


def sanitize_ai_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Copy chat messages while redacting direct identifiers in text content."""
    safe: list[dict[str, Any]] = []
    for message in messages:
        item = dict(message)
        if isinstance(item.get("content"), str):
            item["content"] = redact_personal_data_text(item["content"])
        safe.append(item)
    return safe


def sanitize_cv_text_for_ai(text: str, *, ledger: dict[str, str] | None = None) -> str:
    """Drop the CV's contact header, then redact identifiers in the body.

    The header block is *detected*, not counted, and only its identifier-bearing
    lines plus the name line are removed — a headline/role line under the name is
    professional context the extractor needs, so it stays.

    The name itself is read locally by `cv_contact.parse_contact`; nothing in the
    header has to survive this trip.
    """
    header_len = len(header_lines(text))
    if not header_len:
        return redact_personal_data_text(text, ledger=ledger)

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
    return redact_personal_data_text("\n".join(kept), ledger=ledger)
