"""Read a pasted job link — Myro's corpus first, then the page's JobPosting, then a model.

FD1 (2026-10-20). One reader per answer, cheapest first:

  corpus      the link names a listing Myro already holds. 89.8% of live corpus
              jobs carry their own id in the link (`job_id` is the ATS's
              requisition id), so the ids in the pasted link are a primary-key
              lookup, and `collections.page.same_page` confirms the page. No
              fetch, no model — and the import saves that listing instead of an
              `ext_` copy, so it keeps its skills, its verdict and its liveness.
  jobposting  the page's schema.org JobPosting (Workday, Lever, Qualcomm…). No
              model. Workday draws its posting with JavaScript, so the page's
              text is empty and this is the only thing on it to read.
  model       `job_file_parser.extract_job_from_text` over the page's text.

Measured on the 18 hosts with the most live jobs: 5 gave the old model-only
reader nothing (Workday ×2, Oracle Cloud ×2 — Kotak, the largest — and Infosys),
so the paste failed. Every read logs which reader answered.
"""
from __future__ import annotations

import html as html_lib
import json
import logging
import re
import time
from typing import Any
from urllib.parse import parse_qsl, unquote, urlsplit

from app.services import job_file_parser as jfp
from app.services.collections.page import same_page
from app.services.job_extract_backstop import is_valid_company, is_valid_location, is_valid_role
from app.services.llm_provider import LLMProvider

logger = logging.getLogger("myro.job_link_reader")

#: More ids than this in one link is not a job link; the lookup stays one query.
MAX_CANDIDATES = 30

#: A listing's description shorter than this is not one. 4,279 live listings
#: carry the scraper's "No JD provided on the company page…" stub (133 chars),
#: measured 2026-10-20; tailoring against it is tailoring against nothing.
MIN_LISTING_JD_CHARS = 300

_LD_BLOCK = re.compile(r"<script[^>]+application/ld\+json[^>]*>(.*?)</script>", re.I | re.S)
_SEGMENT_TAIL_ID = re.compile(r"([A-Za-z]*\d[\w]*)$")


# ── corpus ────────────────────────────────────────────────────────────────────

def link_candidates(url: str) -> list[str]:
    """Strings in the link that could be a listing's `job_id`: whole path
    segments and query values, their parts split on `_ - .`, and an id glued
    to the end of a slug. Only strings with a digit and 4+ characters."""
    try:
        parts = urlsplit((url or "").strip())
    except ValueError:
        return []
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        return []
    pieces = [unquote(s) for s in parts.path.split("/") if s]
    pieces += [unquote(v) for _, v in parse_qsl(parts.query) if v]
    out: list[str] = []
    for piece in pieces:
        out.append(piece)
        out.extend(re.split(r"[_\-.]", piece))
        tail = _SEGMENT_TAIL_ID.search(piece)
        if tail:
            out.append(tail.group(1))
    keep = [c for c in dict.fromkeys(out) if len(c) >= 4 and any(ch.isdigit() for ch in c)]
    return keep[:MAX_CANDIDATES]


def corpus_fields(url: str, jobs_repo: Any) -> dict[str, Any] | None:
    """The live listing this link is, if Myro holds it."""
    ids = link_candidates(url)
    if not ids:
        return None
    for row in jobs_repo.listings_for_link(ids):
        if not same_page(url, row.get("apply_url")):
            continue
        role = str(row.get("job_title") or "").strip()
        jd = str(row.get("job_description") or "").strip()
        if not role or len(jd) < MIN_LISTING_JD_CHARS:
            continue
        return {
            "role": role,
            "company": str(row.get("company_name") or "").strip(),
            "location": str(row.get("location") or "").strip(),
            "job_description": jd,
            "listing_job_id": str(row["job_id"]),
        }
    return None


# ── the page's own JobPosting ─────────────────────────────────────────────────

def _items(node: Any) -> list[dict[str, Any]]:
    if isinstance(node, list):
        return [x for item in node for x in _items(item)]
    if not isinstance(node, dict):
        return []
    return [node, *_items(node.get("@graph"))]


def _is_posting(item: dict[str, Any]) -> bool:
    kind = item.get("@type")
    kinds = kind if isinstance(kind, list) else [kind]
    return "JobPosting" in kinds


def _name(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get("name")
    return " ".join(str(value or "").split())


def _coded(value: str) -> bool:
    """An ATS's internal code, not a name or a place: Workday sends
    "8126 ASOL- Hyderabad 3" as the employer and "HDC3C" as the region."""
    return any(ch.isdigit() for ch in value)


def _location(item: dict[str, Any]) -> str:
    places = item.get("jobLocation")
    places = places if isinstance(places, list) else [places]
    for place in places:
        address = place.get("address") if isinstance(place, dict) else None
        if isinstance(address, dict):
            # A part can hold a place and a code together ("Hyderabad, HDC3C").
            parts = [
                piece.strip()
                for key in ("addressLocality", "addressRegion", "addressCountry")
                for piece in _name(address.get(key)).split(",")
            ]
            parts = [p for p in parts if p and not _coded(p)]
            text = ", ".join(dict.fromkeys(p for p in parts if p))
            if text:
                return text
    if str(item.get("jobLocationType") or "").upper() == "TELECOMMUTE":
        return "Remote"
    return ""


def jobposting_fields(raw_html: str) -> dict[str, str] | None:
    """Fields from the page's schema.org JobPosting, or None when it has no
    usable one (a title that passes the role check and a real description)."""
    for block in _LD_BLOCK.findall(raw_html or ""):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        for item in _items(data):
            if not _is_posting(item):
                continue
            role = _name(item.get("title"))
            # Descriptions arrive as HTML, often entity-escaped once more.
            jd = jfp.html_to_text(html_lib.unescape(str(item.get("description") or "")))
            if not is_valid_role(role) or len(jd) < jfp.MIN_TEXT_CHARS:
                continue
            company = _name(item.get("hiringOrganization"))
            company = "" if _coded(company) else company
            location = _location(item)
            return {
                "role": role,
                "company": company if is_valid_company(company) else "",
                "location": location if is_valid_location(location) else "",
                "job_description": jd,
            }
    return None


# ── the order ─────────────────────────────────────────────────────────────────

async def read_link(url: str, jobs_repo: Any, provider: LLMProvider) -> tuple[dict[str, Any], str]:
    """(fields, which reader answered). Fields always carry `listing_job_id` —
    the listing's id on a corpus answer, None otherwise. Raises
    `JobFileParseError` (incl. `JobUrlFetchError`) when nothing can be read."""
    link = (url or "").strip()
    started = time.monotonic()
    host = urlsplit(link).netloc.lower() if link else ""

    def done(fields: dict[str, Any], source: str) -> tuple[dict[str, Any], str]:
        # WARNING, like every `metric` line: the app namespace has no INFO
        # handler, so an INFO metric never reaches the logs (main.py).
        logger.warning(
            "metric job_import.read source=%s ms=%d host=%s",
            source, int((time.monotonic() - started) * 1000), host,
        )
        return fields, source

    found = corpus_fields(link, jobs_repo)
    if found:
        return done(found, "corpus")

    raw_html = await jfp.fetch_posting_html(link)
    posting = jobposting_fields(raw_html)
    if posting:
        return done({**posting, "listing_job_id": None}, "jobposting")

    text = jfp.html_to_text(raw_html)
    if len(text) < jfp.MIN_TEXT_CHARS:
        raise jfp.JobUrlFetchError("Couldn't read a job posting at that link — paste the text instead.")
    parsed = await jfp.extract_job_from_text(text, provider)
    return done({**parsed, "listing_job_id": None}, "model")
