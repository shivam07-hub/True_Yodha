"""Ask the ATS's own JSON API whether a listing is open, instead of reading its HTML.

The HTML classifier in `job_listing_verifier` reads the page a human would see.
On a client-rendered ATS that page is a lie: a **pulled** Workday requisition
answers HTTP 200 with a ~6.5KB shell whose only job-shaped content is the URL
echoed back, and the URL slug contains the role title. So `_title_is_present`
matches, `has_title and provider != "generic"` fires, and the verdict is
`seen_live`. Run the real classifier over four Workday pages and it cannot tell
them apart:

    BrowserStack JR102911 (pulled)  -> seen_live (medium)
    Adobe        R169083  (pulled)  -> seen_live (medium)
    Unilever     R-1180889 (pulled) -> seen_live (medium)
    BrowserStack JR103574 (open)    -> seen_live (medium)

That is how a shortlist built for one user on 2026-08-27 carried eight closed
listings the corpus still called `active`, one of them stamped
`last_verified_live_at` the same morning.

These ATSs all publish the answer as JSON, addressed by the same identifiers
already in the apply URL, and the JSON is authoritative in a way the HTML is
not. So probe the API first and only fall back to reading HTML when the probe
cannot conclude — an unrecognised host, a transport failure, or a shape we do
not parse.

Which endpoint matters. Workday's per-posting record answers **403** for a
pulled requisition *and* for a tenant that blocks us, so it can never separate
the two; its job-search endpoint answers 200 for both and reports the posting's
own path only while the posting is open. Ashby publishes no per-posting
endpoint without a key, so its probe reads the board and asks whether the id is
still on it. Greenhouse and Lever answer for the listing directly.

Coverage is the four providers whose public read APIs need no key: Workday
(12.6k active listings), Greenhouse (1.2k), Lever (0.6k), Ashby (0.3k). Oracle
carries another 11.5k and has an API of its own; it is deliberately not here
yet, because nothing in the incident implicated it and a probe we have not
tested against a real closed requisition is a guess.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

__all__ = ["ListingProbe", "ask_ats", "probe_for_url", "read_probe"]

#: Probe bodies must arrive whole — a board endpoint answers for every open
#: posting at once, so the payload is far larger than a listing page. Sarvam's
#: Ashby board is 701KB; truncated to the 500KB the HTML read uses it parsed as
#: nothing, and the probe silently gave up on every Ashby listing.
BODY_LIMIT = 4_000_000

_LOCALE_SEGMENT = re.compile(r"^[a-z]{2}(-[a-zA-Z]{2})?$")

_LIVE = "live"
_CLOSED = "closed"

#: How to read this provider's answer.
#:  record         — the response IS the listing; a 200 that parses proves it open.
#:  board_ids      — the response lists every open posting by id (Ashby).
#:  workday_search — the response is a search result; the listing is open iff a
#:                   returned `externalPath` still addresses it.
RECORD = "record"
BOARD_IDS = "board_ids"
WORKDAY_SEARCH = "workday_search"


@dataclass(frozen=True)
class ListingProbe:
    """One request that asks one ATS whether one listing is still open."""

    provider: str
    url: str
    shape: str
    method: str = "GET"
    payload: dict | None = None
    member_id: str | None = None


def _segments(url: str) -> list[str]:
    return [segment for segment in urlparse(url).path.split("/") if segment]


def _workday_probe(url: str) -> ListingProbe | None:
    """`<tenant>.<pod>.myworkdayjobs.com/[locale/]<site>/job/…` → the CXS job SEARCH.

    Not the per-posting CXS record, which looks like the obvious choice and is
    not usable: a **pulled** requisition answers that endpoint 403, and so does
    a tenant that blocks us wholesale (Sprinklr does). One status, two meanings,
    so it can never conclude — which is how the first cut of this module still
    let BrowserStack, Adobe and Unilever through as live.

    The search endpoint separates them. It answered 200 for every tenant tried,
    blocked ones included, with `total: 0` for a pulled requisition and the
    posting's own `externalPath` for an open one. The requisition id is the tail
    of the job slug after the last underscore.

    The site segment is what routes to a listing (see `ats_url_is_addressable`);
    without it there is nothing to probe. A trailing `/apply` addresses the form,
    not the posting, so it is dropped.
    """
    host = (urlparse(url).hostname or "").lower()
    tenant = host.split(".")[0]
    if not tenant:
        return None
    segments = _segments(url)
    if segments and _LOCALE_SEGMENT.match(segments[0]):
        segments = segments[1:]
    if len(segments) < 2 or segments[0] == "job":
        return None
    site, rest = segments[0], segments[1:]
    if rest[-1] == "apply":
        rest = rest[:-1]
    if not rest or rest[0] != "job":
        return None
    slug = rest[-1]
    requisition = slug.rsplit("_", 1)[-1]
    if not requisition:
        return None
    return ListingProbe(
        "workday",
        f"https://{host}/wday/cxs/{tenant}/{site}/jobs",
        WORKDAY_SEARCH,
        method="POST",
        payload={"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": requisition},
        member_id=slug,
    )


def _greenhouse_probe(url: str) -> ListingProbe | None:
    """`(job-)boards.greenhouse.io/<board>/jobs/<id>` → the boards API record.

    A `?gh_jid=` link on a company's own domain is not a greenhouse host, so it
    never reaches here — guessing a board token from a company name would be a
    probe against the wrong board, which is worse than no probe.
    """
    segments = _segments(url)
    if len(segments) < 3 or segments[1] != "jobs":
        return None
    board, job_id = segments[0], segments[2]
    return ListingProbe(
        "greenhouse",
        f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{job_id}",
        RECORD,
    )


def _lever_probe(url: str) -> ListingProbe | None:
    """`jobs.lever.co/<company>/<posting-id>` → the v0 postings record."""
    segments = _segments(url)
    if len(segments) < 2:
        return None
    company, posting = segments[0], segments[1]
    return ListingProbe(
        "lever", f"https://api.lever.co/v0/postings/{company}/{posting}", RECORD
    )


def _ashby_probe(url: str) -> ListingProbe | None:
    """`jobs.ashbyhq.com/<org>/<id>[/application]` → the org's public board.

    Ashby publishes no per-posting endpoint without a key, so the probe reads
    the board and asks whether this id is still on it. A pulled posting is
    simply absent — which is exactly the verdict we need.
    """
    segments = _segments(url)
    if len(segments) < 2:
        return None
    org, posting = segments[0], segments[1]
    return ListingProbe(
        "ashby",
        f"https://api.ashbyhq.com/posting-api/job-board/{org}",
        BOARD_IDS,
        member_id=posting,
    )


_PROBE_BUILDERS = {
    "workday": _workday_probe,
    "greenhouse": _greenhouse_probe,
    "lever": _lever_probe,
    "ashby": _ashby_probe,
}


def probe_for_url(url: str, provider: str) -> ListingProbe | None:
    """The JSON probe for this apply URL, or None when the provider has none."""
    builder = _PROBE_BUILDERS.get(provider)
    return builder(url) if builder else None


def _read_record(payload: object) -> str | None:
    """A 200 that carries the listing's own record proves it is open."""
    if isinstance(payload, dict) and payload.get("id") is not None:
        return _LIVE
    return None


def _read_board_ids(probe: ListingProbe, payload: object) -> str | None:
    """A board that lists every open posting answers by presence or absence."""
    if not isinstance(payload, dict):
        return None
    jobs = payload.get("jobs")
    if not isinstance(jobs, list):
        return None
    ids = {str(job.get("id")) for job in jobs if isinstance(job, dict)}
    if not ids:
        # An empty board is as likely to be a bad org slug as a closed listing.
        return None
    return _LIVE if str(probe.member_id) in ids else _CLOSED


def _read_workday_search(probe: ListingProbe, payload: object) -> str | None:
    """Open iff the search still returns a path that addresses this requisition.

    `total` alone is not the answer — a requisition id can match a neighbouring
    posting — so the slug has to appear in an `externalPath`. A payload without
    `jobPostings` is not a search result and concludes nothing.
    """
    if not isinstance(payload, dict):
        return None
    postings = payload.get("jobPostings")
    if not isinstance(postings, list):
        return None
    slug = str(probe.member_id)
    for posting in postings:
        if isinstance(posting, dict) and slug in str(posting.get("externalPath") or ""):
            return _LIVE
    return _CLOSED


def read_probe(probe: ListingProbe, *, status_code: int, body: str) -> str | None:
    """`live` / `closed` from a probe response, or None when it cannot conclude.

    None is the honest answer for a block, a rate-limit, a server error, or a
    payload we do not recognise — the caller then reads the HTML as before. A
    probe that guesses would reintroduce the bug it exists to fix, one layer
    down.
    """
    if status_code in {404, 410}:
        return _CLOSED
    if status_code != 200:
        return None
    try:
        payload = json.loads(body)
    except (ValueError, TypeError):
        return None
    if probe.shape == WORKDAY_SEARCH:
        return _read_workday_search(probe, payload)
    if probe.shape == BOARD_IDS:
        return _read_board_ids(probe, payload)
    return _read_record(payload)


async def ask_ats(
    apply_url: str, provider: str, client: httpx.AsyncClient
) -> tuple[str, httpx.Response] | None:
    """`(verdict, response)` from the ATS's own API, or None when it cannot answer.

    None covers every way this can decline to conclude — no probe for the
    provider, a transport failure, a truncated body, a shape we do not parse —
    and the caller reads the HTML instead, exactly as it did before.
    """
    probe = probe_for_url(apply_url, provider)
    if probe is None:
        return None
    try:
        response = await client.request(
            probe.method,
            probe.url,
            json=probe.payload,
            follow_redirects=True,
            headers={
                "User-Agent": "MyroListingVerifier/1.0",
                "Accept": "application/json",
            },
        )
    except (httpx.TimeoutException, httpx.RequestError):
        return None

    body = response.text
    if len(body) > BODY_LIMIT:
        return None
    verdict = read_probe(probe, status_code=response.status_code, body=body)
    return None if verdict is None else (verdict, response)
