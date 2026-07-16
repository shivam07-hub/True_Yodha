"""Redact credentials before errors or logs cross the process boundary.

This is a defensive boundary, not a substitute for keeping secrets in env
vars. It handles credentials accidentally echoed by SDKs, upstream services,
or exception messages before they reach a response or log sink.
"""

from __future__ import annotations

import logging
import re
import traceback
from typing import Any

_ASSIGNMENT = re.compile(
    r"(?i)(\b(?:authorization|proxy-authorization|api[-_]?key|apikey|"
    r"client[-_]?secret|access[-_]?token|refresh[-_]?token|password|passwd|"
    r"secret|token)\b\s*[:=]\s*)([^\s,;&}\]]+)"
)
_BEARER = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{12,}")
_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")
_CONNECTION_URL = re.compile(
    r"(?i)\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|redis|mysql|mssql)://"
    r"[^\s:@/]+:[^\s@/]+@[^\s]+"
)
_PROVIDER_KEY = re.compile(
    r"\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{8,}\b|"
    r"\b(?:AIza|AKIA)[A-Za-z0-9_-]{12,}\b|"
    r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{12,}\b|"
    r"\bxox[baprs]-[A-Za-z0-9-]{12,}\b"
)


def redact_sensitive_text(value: Any, *, max_length: int = 1200) -> str:
    """Return bounded text with common credential formats redacted."""

    text = str(value)
    text = _CONNECTION_URL.sub("[REDACTED_CONNECTION_URL]", text)
    text = _BEARER.sub("Bearer [REDACTED]", text)
    text = _ASSIGNMENT.sub(r"\1[REDACTED]", text)
    text = _JWT.sub("[REDACTED_JWT]", text)
    text = _PROVIDER_KEY.sub("[REDACTED_PROVIDER_KEY]", text)
    return text[:max_length]


class _SensitiveLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        rendered = redact_sensitive_text(record.getMessage())
        if record.exc_info:
            trace = "".join(traceback.format_exception(*record.exc_info))
            rendered = f"{rendered}\n{redact_sensitive_text(trace)}"
            record.exc_info = None
        record.msg = rendered
        record.args = ()
        return True


def install_sensitive_log_filter() -> None:
    """Attach redaction to current and fallback logging handlers."""

    redactor = _SensitiveLogFilter()
    handlers = list(logging.getLogger().handlers)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        handlers.extend(logging.getLogger(name).handlers)
    handlers.append(logging.lastResort)
    seen: set[int] = set()
    for handler in handlers:
        if id(handler) in seen:
            continue
        seen.add(id(handler))
        if getattr(handler, "_myro_sensitive_redaction", False):
            continue
        handler.addFilter(redactor)
        setattr(handler, "_myro_sensitive_redaction", True)
