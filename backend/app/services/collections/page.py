"""Which Collection entry is this page? — the extension's one question on open.

CONTEXT.md → Collection Record → Page Entry. The extension used to keep its own
copy of the answer in `chrome.storage` (job id + title, keyed by its own URL
rule), so it never knew a job's stage, never saw a job saved from Myro's list,
and on a return visit held too little to act on. The answer now comes from the
user's own applications, staged by the same resolver as the Collections surface.

Page identity is decided here and nowhere else:

  · host is case-folded and loses `www.`; the fragment never counts
  · tracking parameters (`utm_*`, LinkedIn's `src`, Greenhouse's `gh_src`, …)
    never count — the same posting reached from two boards is one page
  · a stored URL's remaining parameters must all be on the page (ATS boards
    carry the job id in the query: `?gh_jid=42` is not `?gh_jid=99`)
  · the ATS's apply step is the same job: `/job/R123/apply/applyManually` is
    the posting at `/job/R123`. Any other deeper path is a different page — a
    careers index must not claim every job under it.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Iterable, NamedTuple
from urllib.parse import parse_qsl, urlsplit

from app.schemas import PageEntry

from .resolve import STAGE_ORDER, resolve_collection

_TRACKING_PARAM = re.compile(
    r"^(utm_.*|src|source|ref|refid|trk|trackingid|gh_src|lever-source|lever-origin"
    r"|ccuid|campaign|codes|iis|iisn|jobpipeline|share|shared_from)$"
)
_APPLY_STEP = re.compile(r"^/(apply|application)(/|$)")


class PageKey(NamedTuple):
    host: str
    path: str
    params: frozenset[tuple[str, str]]


def page_key(url: str | None) -> PageKey | None:
    """The identity of a job page, or None for anything that is not a web URL."""
    raw = (url or "").strip()
    if not raw:
        return None
    try:
        parts = urlsplit(raw)
    except ValueError:
        return None
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        return None
    host = parts.netloc.lower().removeprefix("www.")
    path = re.sub(r"/+$", "", parts.path).lower()
    params = frozenset(
        (key.lower(), value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if not _TRACKING_PARAM.match(key.lower())
    )
    return PageKey(host, path, params)


def same_page(page_url: str | None, stored_url: str | None) -> bool:
    """Is the page the user is on the posting stored at `stored_url`?"""
    page, stored = page_key(page_url), page_key(stored_url)
    if page is None or stored is None or page.host != stored.host:
        return False
    if not stored.params <= page.params:
        return False
    if page.path == stored.path:
        return True
    return page.path.startswith(stored.path + "/") and bool(
        _APPLY_STEP.match(page.path[len(stored.path):])
    )


def applications_on_page(page_url: str, applications: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """The user's application rows whose posting is this page."""
    found: list[dict[str, Any]] = []
    for row in applications:
        job = row.get("jobs") or {}
        if same_page(page_url, job.get("apply_url")) or same_page(page_url, job.get("source_url")):
            found.append(row)
    return found


def entry_for_page(
    *,
    applications: list[dict[str, Any]],
    tailored_by_job: dict[str, dict[str, Any]],
    pending_intent_job_ids: set[str],
    batch_week: date,
) -> PageEntry | None:
    """Stage the page's application rows through the Collection resolver and
    return the furthest one. `applications` is already narrowed to this page.

    Two rows can share a page (a corpus job and an older extension import of the
    same posting); the one furthest along is the one the user is working on.
    """
    if not applications:
        return None
    collection = resolve_collection(
        applications=applications,
        match_rows=[],
        dismissed_job_ids=set(),
        tailored_by_job=tailored_by_job,
        pending_intent_job_ids=pending_intent_job_ids,
        batch_week=batch_week,
    )
    if not collection.entries:
        return None
    best = max(collection.entries, key=lambda e: STAGE_ORDER.index(e.stage))
    return PageEntry(
        job_id=best.job_id,
        stage=best.stage,
        title=best.job.title,
        company=best.job.company,
        liveness=best.liveness,
        pending_apply=best.pending_apply,
    )
