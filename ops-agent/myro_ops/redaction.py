import re

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
_UUID_RE = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
_SECRET_RE = re.compile(
    r"\b(?:sk|pk|rk|ghp|gho|github_pat|xoxb|xoxp|supabase|openrouter|groq|gemini|razorpay)"
    r"[-_A-Za-z0-9]{8,}\b",
    re.IGNORECASE,
)


def redact_sensitive(value: str) -> str:
    redacted = _JWT_RE.sub("[redacted-jwt]", value)
    redacted = _EMAIL_RE.sub("[redacted-email]", redacted)
    redacted = _UUID_RE.sub("[redacted-uuid]", redacted)
    return _SECRET_RE.sub("[redacted-secret]", redacted)


def redact_lines(lines: list[str]) -> list[str]:
    return [redact_sensitive(line) for line in lines]
