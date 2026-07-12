"""Reservoir intake — pure file-classification + text-extraction for dumps.

One place decides what a dropped file IS: career text for the story extractor,
a LinkedIn Connections.csv (→ warm-intro store), or account telemetry noise
that never deserves an LLM pass. No DB, no network — the router stays a thin
orchestrator over these.
"""
from __future__ import annotations

import io
import zipfile

from app.services import cv_parser
from app.services.connections_import import looks_like_connections_csv, parse_connections_csv
from app.services.story_extractor import linkedin_csv_kind, render_linkedin_csv

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_ZIP_MEMBERS = 60

# LinkedIn-export account telemetry: no career signal, never worth an LLM pass.
# Basenames normalized lower + underscores→spaces; numeric suffixes stripped.
_LINKEDIN_NOISE = {
    "ad targeting", "ads clicked", "comments", "company follows", "courses",
    "email addresses", "endorsement given info", "endorsement received info",
    "events", "hashtag follows", "importedcontacts", "imported contacts",
    "inferences about you", "instantreposts", "invitations",
    "job applicant saved screening question responses", "lan ads engagement",
    "learning", "learningcoachmessages", "learning coach messages",
    "learning role play messages", "logins", "member follows", "messages",
    "phonenumbers", "phone numbers", "private identity asset", "reactions",
    "receipts v2", "registration", "rich media", "savedjobalerts",
    "saved items", "searchqueries", "search queries", "security challenges",
    "testscores", "test scores", "votes", "whatsapp phone numbers",
    "guide messages",
}


def is_linkedin_noise(filename: str) -> bool:
    """True for LinkedIn telemetry CSVs (Logins.csv, Ads Clicked.csv, …)."""
    stem = filename.rsplit("/", 1)[-1].rsplit(".", 1)[0].lower().replace("_", " ")
    stem = " ".join(p for p in stem.split() if not p.isdigit())  # Comments_622594202 → comments
    return stem in _LINKEDIN_NOISE


def is_recommendations_given(filename: str) -> bool:
    """Recommendations the USER wrote about others — praise of someone else,
    never their own story material."""
    return "recommendations_given" in filename.rsplit("/", 1)[-1].lower().replace(" ", "_")


def read_linkedin_zip(raw: bytes) -> tuple[str, int, list[dict]]:
    """LinkedIn export zip → (combined career-text render, CSVs used,
    connections rows found inside)."""
    blocks: list[str] = []
    connections: list[dict] = []
    used = 0
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        csv_names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
        for name in csv_names[:MAX_ZIP_MEMBERS]:
            data = zf.read(name)[:MAX_FILE_BYTES]
            if looks_like_connections_csv(data):
                connections = parse_connections_csv(data) or connections
                continue
            if is_recommendations_given(name):
                continue
            kind = linkedin_csv_kind(data)
            if kind:
                block = render_linkedin_csv(kind, data)
                if block:
                    blocks.append(block)
                    used += 1
    return "\n\n".join(blocks), used, connections


def extract_file_text(filename: str, raw: bytes) -> tuple[str, str]:
    """(text, entry_kind) for one uploaded file. Raises ValueError with a
    user-facing reason when the file can't yield career text."""
    lower = filename.lower()
    if lower.endswith(".zip"):
        try:
            text, used, _ = read_linkedin_zip(raw)
        except zipfile.BadZipFile as exc:
            raise ValueError("Not a readable zip") from exc
        if not used:
            raise ValueError("No LinkedIn CSVs found in the zip")
        return text, "linkedin"
    if lower.endswith(".csv"):
        kind = linkedin_csv_kind(raw)
        if kind:
            return render_linkedin_csv(kind, raw), "linkedin"
        return raw.decode("utf-8-sig", errors="replace"), "file"
    if lower.endswith(".pdf"):
        return cv_parser.extract_raw_text(raw, "pdf"), "file"
    if lower.endswith(".docx"):
        return cv_parser.extract_raw_text(raw, "docx"), "file"
    if lower.endswith((".txt", ".md")):
        return raw.decode("utf-8", errors="replace"), "file"
    raise ValueError("Unsupported file type")
