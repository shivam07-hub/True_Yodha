"""
Add-a-job file parser.

Turns an uploaded job posting (PDF, DOCX, or a screenshot/photo) into the four
tracker fields the Add-application modal needs: company, role, location, and the
full job-description text.

- PDF / DOCX  → reuse the CV text extractor, then one LLM pass to lift fields.
- image       → a single multimodal (vision) LLM call reads the screenshot.

Extraction is FREE (no XP charge). The reward is granted on save, not here.
"""

import base64
import html as html_lib
import ipaddress
import json
import logging
import re
import socket
from urllib.parse import urlparse

import httpx

from app.services.llm_provider import LLMProvider, LLMProviderError

_log = logging.getLogger(__name__)

# Detection
_PDF_TYPES = {"application/pdf"}
_DOCX_TYPES = {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}

MAX_FILE_BYTES = 8 * 1024 * 1024  # 8 MB — generous for a JD page or a phone screenshot
MIN_TEXT_CHARS = 40               # below this a PDF/DOCX is almost certainly scanned/empty

# URL fetch limits
_URL_FETCH_TIMEOUT = 12.0         # seconds — a posting page should answer fast
_URL_MAX_BYTES = 5 * 1024 * 1024  # cap the download so a giant page can't OOM us
_URL_MAX_REDIRECTS = 4
_URL_USER_AGENT = (
    "Mozilla/5.0 (compatible; MyroJobImport/1.0; +https://himyro.com)"
)

_SYSTEM = (
    "You extract structured fields from a single job posting. "
    "Return ONLY a JSON object with exactly these keys: "
    '"company", "role", "location", "job_description". '
    "company = the hiring company name. role = the job title. "
    "location = work location or mode (e.g. 'Remote', 'Bengaluru', 'Hybrid · London'). "
    "job_description = the full posting body as clean plain text. "
    "If a field is not present, use an empty string. Do not invent values. "
    "Do not wrap the JSON in markdown fences."
)


class JobFileParseError(Exception):
    """Raised when a file cannot be turned into a usable job posting."""


def detect_file_kind(content_type: str | None, filename: str | None, data: bytes) -> str:
    """Return 'pdf' | 'docx' | 'image' | 'unknown'.

    Trusts magic bytes first (drag-dropped files often carry wrong/empty MIME),
    then content_type, then the filename extension.
    """
    if data[:5] == b"%PDF-":
        return "pdf"
    if data[:4] == b"PK\x03\x04" and (filename or "").lower().endswith(".docx"):
        return "docx"
    if data[:8] == b"\x89PNG\r\n\x1a\n" or data[:3] == b"\xff\xd8\xff" or data[:4] == b"RIFF":
        return "image"

    ct = (content_type or "").lower()
    if ct in _PDF_TYPES:
        return "pdf"
    if ct in _DOCX_TYPES:
        return "docx"
    if ct in _IMAGE_TYPES:
        return "image"

    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return "pdf"
    if name.endswith(".docx"):
        return "docx"
    if name.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
        return "image"
    return "unknown"


def _parse_fields_json(raw: str) -> dict:
    """Pull the JSON object out of an LLM response, tolerating code fences/prose."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text.strip("`")
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise JobFileParseError("Could not read the job posting from that file.")
    try:
        obj = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise JobFileParseError("Could not read the job posting from that file.") from exc
    return {
        "company": str(obj.get("company", "") or "").strip(),
        "role": str(obj.get("role", "") or "").strip(),
        "location": str(obj.get("location", "") or "").strip(),
        "job_description": str(obj.get("job_description", "") or "").strip(),
    }


async def extract_job_from_text(raw_text: str, provider: LLMProvider) -> dict:
    messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": raw_text[:24000]},
    ]
    try:
        out = await provider.complete(messages, max_tokens=2048, temperature=0)
    except LLMProviderError as exc:
        raise JobFileParseError("The parser is busy right now — paste the text instead.") from exc
    return _parse_fields_json(out)


class JobUrlFetchError(JobFileParseError):
    """Raised when a posting URL can't be safely fetched or read."""


def _assert_public_http_url(url: str) -> None:
    """Reject anything that isn't a public http(s) URL (SSRF guard).

    Resolves the host and refuses private, loopback, link-local, reserved,
    multicast, or unspecified addresses so a posting link can never be used to
    probe internal infrastructure. Called on every redirect hop, not just once.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise JobUrlFetchError("Enter a job posting link starting with http:// or https://.")
    host = parsed.hostname
    if not host:
        raise JobUrlFetchError("That doesn't look like a valid link.")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise JobUrlFetchError("Couldn't reach that link — check the address and try again.") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise JobUrlFetchError("That link can't be fetched.")


_BLOCK_TAGS = re.compile(r"(?is)<(script|style|noscript|svg|head|template|iframe)[^>]*>.*?</\1>")
_BR = re.compile(r"(?is)<br\s*/?>")
_BLOCK_CLOSE = re.compile(r"(?is)</(p|div|li|h[1-6]|tr|section|article)>")
_TAGS = re.compile(r"(?s)<[^>]+>")
_INLINE_WS = re.compile(r"[ \t\r\f]+")
_BLANK_LINES = re.compile(r"\n\s*\n+")


def _html_to_text(raw_html: str) -> str:
    """Strip a posting page down to readable plain text for the field extractor."""
    text = _BLOCK_TAGS.sub(" ", raw_html)
    text = _BR.sub("\n", text)
    text = _BLOCK_CLOSE.sub("\n", text)
    text = _TAGS.sub(" ", text)
    text = html_lib.unescape(text)
    text = _INLINE_WS.sub(" ", text)
    text = _BLANK_LINES.sub("\n\n", text)
    return text.strip()


async def _fetch_posting_html(url: str) -> str:
    """Fetch a posting page, re-validating against SSRF on each redirect hop."""
    headers = {
        "User-Agent": _URL_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en",
    }
    current = url
    async with httpx.AsyncClient(
        follow_redirects=False, timeout=_URL_FETCH_TIMEOUT
    ) as client:
        for _ in range(_URL_MAX_REDIRECTS + 1):
            _assert_public_http_url(current)
            try:
                resp = await client.get(current, headers=headers)
            except httpx.HTTPError as exc:
                raise JobUrlFetchError(
                    "Couldn't open that link — paste the description instead."
                ) from exc
            if resp.is_redirect and resp.next_request is not None:
                current = str(resp.next_request.url)
                continue
            if resp.status_code >= 400:
                raise JobUrlFetchError(
                    "That link returned an error — paste the description instead."
                )
            declared = resp.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > _URL_MAX_BYTES:
                raise JobUrlFetchError("That page is too large to read automatically.")
            return resp.text[: _URL_MAX_BYTES]
    raise JobUrlFetchError("That link redirected too many times.")


async def extract_job_from_url(url: str, provider: LLMProvider) -> dict:
    """Fetch a public posting URL and lift the four tracker fields from it."""
    raw_html = await _fetch_posting_html(url.strip())
    text = _html_to_text(raw_html)
    if len(text) < MIN_TEXT_CHARS:
        raise JobUrlFetchError(
            "Couldn't read a job posting at that link — paste the text instead."
        )
    return await extract_job_from_text(text, provider)


async def extract_job_from_image(data: bytes, mime: str, provider: LLMProvider) -> dict:
    b64 = base64.b64encode(data).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"
    messages = [
        {"role": "system", "content": _SYSTEM},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Extract the job posting fields from this screenshot."},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        },
    ]
    try:
        out = await provider.complete(messages, max_tokens=2048, temperature=0)
    except LLMProviderError as exc:
        raise JobFileParseError("Couldn't read that image — try a clearer screenshot or paste the text.") from exc
    return _parse_fields_json(out)
