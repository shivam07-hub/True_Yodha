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
import json
import logging

from app.services.llm_provider import LLMProvider, LLMProviderError

_log = logging.getLogger(__name__)

# Detection
_PDF_TYPES = {"application/pdf"}
_DOCX_TYPES = {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}

MAX_FILE_BYTES = 8 * 1024 * 1024  # 8 MB — generous for a JD page or a phone screenshot
MIN_TEXT_CHARS = 40               # below this a PDF/DOCX is almost certainly scanned/empty

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
