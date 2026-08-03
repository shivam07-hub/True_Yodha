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
_EMAIL = re.compile(r"(?i)(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?![\w.-])")
_UUID = re.compile(
    r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-"
    r"[89ab][0-9a-f]{3}-[0-9a-f]{12}\b"
)
_IPV4 = re.compile(
    r"(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)"
    r"(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])"
)
_IPV6 = re.compile(
    r"(?i)(?<![0-9a-f:])(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{0,4}(?![0-9a-f:])"
)
_PHONE = re.compile(r"(?<!\w)(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{3,4}(?!\w)")


# Tracebacks get their own, larger budget: the ASGI middleware stack alone eats
# well past the 1200-char default before reaching a single app frame.
_TRACEBACK_CHARS = 6000


def redact_sensitive_text(value: Any, *, max_length: int | None = 1200) -> str:
    """Return bounded text with common credential formats redacted."""

    text = str(value)
    text = _CONNECTION_URL.sub("[REDACTED_CONNECTION_URL]", text)
    text = _BEARER.sub("Bearer [REDACTED]", text)
    text = _ASSIGNMENT.sub(r"\1[REDACTED]", text)
    text = _JWT.sub("[REDACTED_JWT]", text)
    text = _PROVIDER_KEY.sub("[REDACTED_PROVIDER_KEY]", text)
    text = _EMAIL.sub("[REDACTED]", text)
    text = _UUID.sub("[REDACTED]", text)
    text = _IPV4.sub("[REDACTED]", text)
    text = _IPV6.sub("[REDACTED]", text)
    text = _PHONE.sub("[REDACTED]", text)
    return text if max_length is None else text[:max_length]


def _redact_if_str(value: Any) -> Any:
    return redact_sensitive_text(value) if isinstance(value, str) else value


class _SensitiveLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.exc_info:
            # Stash the redacted traceback in exc_text — the stdlib Formatter
            # appends exc_text to the rendered line even when exc_info is
            # cleared, so the trace still reaches the log sink redacted.
            #
            # Keep the TAIL, not the head. A traceback's answer — the exception
            # type, its message, and the app frames that raised it — is at the
            # bottom; the top is ASGI middleware boilerplate. The old head-first
            # 1200-char cut spent the whole budget on starlette frames and
            # severed every prod 500 mid-word ("File .../python3.11/sit"), which
            # is why /home/bootstrap failures could not be diagnosed from logs.
            trace = "".join(traceback.format_exception(*record.exc_info))
            record.exc_text = redact_sensitive_text(trace, max_length=None)[-_TRACEBACK_CHARS:]
            record.exc_info = None
        if record.args:
            # Preserve the msg/args contract: some formatters (uvicorn's
            # AccessFormatter unpacks record.args as a 5-tuple) re-read args
            # at format time, so redact in place instead of flattening.
            # msg keeps its % placeholders — never truncate it, a slice
            # could cut a placeholder and break formatting.
            if isinstance(record.args, dict):
                record.args = {k: _redact_if_str(v) for k, v in record.args.items()}
            else:
                record.args = tuple(_redact_if_str(a) for a in record.args)
            if isinstance(record.msg, str):
                record.msg = redact_sensitive_text(record.msg, max_length=None)
        else:
            record.msg = redact_sensitive_text(record.getMessage())
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
