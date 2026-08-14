from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx


_CLOSED_MARKERS = (
    "job is no longer available",
    "position is no longer available",
    "position has been filled",
    "job has been filled",
    "no longer accepting applications",
    "job not found",
    "vacancy is closed",
)
_APPLY_MARKERS = ("apply now", "apply for this job", "submit application")
_ATS_HOSTS = {
    "workday": ("myworkdayjobs.com", "workday.com"),
    "greenhouse": ("greenhouse.io",),
    "lever": ("lever.co",),
    "smartrecruiters": ("smartrecruiters.com",),
    "oracle": ("oraclecloud.com",),
    "successfactors": ("successfactors.com",),
}
_LOCALE_SEGMENT = re.compile(r"^[a-z]{2}(-[a-zA-Z]{2})?$")


@dataclass(frozen=True)
class VerificationTarget:
    job_id: str
    apply_url: str
    job_title: str
    current_confidence: str = "uncertain"
    verification_priority: str = "corpus"


@dataclass(frozen=True)
class VerificationResult:
    job_id: str
    result: str
    strength: str
    provider: str
    status_code: int | None = None
    final_url: str | None = None
    evidence: dict[str, object] = field(default_factory=dict)


def provider_for_url(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    for provider, suffixes in _ATS_HOSTS.items():
        if any(host == suffix or host.endswith(f".{suffix}") for suffix in suffixes):
            return provider
    return "generic"


def _workday_site_is_addressed(url: str) -> bool:
    """True when a Workday URL names the tenant *site* that routes to a listing.

    Canonical shape is ``<tenant>.<pod>.myworkdayjobs.com/[locale/]<site>/job/…``
    — e.g. ``/AccentureCareers/job/Chennai/Custom-Software-Engineer_ATCI-…``.
    Drop ``<site>`` and the path starts at ``/job/``, which no longer addresses a
    listing on any site; the tenant router answers 404 for it unconditionally.
    """
    segments = [segment for segment in urlparse(url).path.split("/") if segment]
    if segments and _LOCALE_SEGMENT.match(segments[0]):
        segments = segments[1:]
    return len(segments) >= 2 and segments[0] != "job"


_ADDRESSABILITY_CHECKS = {"workday": _workday_site_is_addressed}


def ats_url_is_addressable(url: str, provider: str | None = None) -> bool:
    """False only when the URL provably cannot reach a listing on this ATS.

    A response is evidence about a job only if the request could have reached
    that job. A malformed apply URL fails identically for every row that carries
    it, so the ATS's uniform 404 gets read as a per-job death certificate — the
    company-shaped clustering is just the shape of the defect. That is how one
    batch produced 3,222 strong-closed Workday verdicts across 41 companies,
    1,832 of them Accenture, every one on a URL missing its site segment. Restore
    the segment and the same URLs answer 200.

    Providers with no registered check stay addressable: this gate fires on a
    defect we can demonstrate, never on a shape we merely do not recognise.
    """
    check = _ADDRESSABILITY_CHECKS.get(provider or provider_for_url(url))
    return check is None or check(url)


def classify_listing_response(
    target: VerificationTarget,
    *,
    status_code: int,
    final_url: str,
    body: str,
) -> VerificationResult:
    provider = provider_for_url(target.apply_url)
    evidence = {"status_code": status_code, "final_url": final_url}
    if not ats_url_is_addressable(target.apply_url, provider):
        # Gate the whole classifier, not just the 404 branch: nothing this URL
        # returns describes the listing, so no status code may reach a verdict.
        evidence["reason"] = "ats_site_segment_missing"
        return _result(target, "unroutable", "weak", provider, evidence)
    if status_code in {401, 403, 429}:
        return _result(target, "blocked", "weak", provider, evidence)
    if status_code in {404, 410}:
        strength = "strong" if provider != "generic" else "medium"
        return _result(target, "closed", strength, provider, evidence)
    if status_code >= 500:
        return _result(target, "error", "weak", provider, evidence)
    if status_code < 200 or status_code >= 400:
        return _result(target, "error", "weak", provider, evidence)

    normalized_body = _normalize(body)
    if any(marker in normalized_body for marker in _CLOSED_MARKERS):
        return _result(target, "closed", "strong", provider, evidence)

    has_jobposting = bool(
        re.search(r'"@type"\s*:\s*"jobposting"', body, flags=re.IGNORECASE)
    )
    has_title = _title_is_present(target.job_title, normalized_body)
    has_apply = any(marker in normalized_body for marker in _APPLY_MARKERS)
    if has_title and has_apply and (has_jobposting or provider != "generic"):
        evidence.update({"title_match": True, "apply_action": True})
        return _result(target, "seen_live", "strong", provider, evidence)
    if has_jobposting and has_title:
        evidence.update({"title_match": True, "jobposting": True})
        return _result(target, "seen_live", "strong", provider, evidence)
    if _looks_like_homepage_redirect(target.apply_url, final_url):
        return _result(target, "redirected", "medium", provider, evidence)
    if has_title and has_apply:
        return _result(target, "seen_live", "medium", provider, evidence)
    if has_title and provider != "generic":
        # A named ATS serving a job-specific URL, with this role's title in the
        # body, is a live posting — even with no apply marker and no JSON-LD.
        # Workday and Ashby render the form client-side, so none of the three
        # literal markers ("apply now", "apply for this job", "submit
        # application") appear in the HTML we fetch, and the JSON-LD block is
        # served inconsistently. Requiring a second signal they do not emit is
        # why `page_loaded_without_role_evidence` was the last observation on
        # 5,999 of the 11,204 listings the corpus called active — 54% of them.
        #
        # Safe because the branches above already claim the dead cases: a pulled
        # listing on these hosts answers 404/410, or carries a closed marker.
        # Medium strength — the title is one signal, not two.
        evidence.update({"title_match": True, "ats_job_url": True})
        return _result(target, "seen_live", "medium", provider, evidence)
    evidence["reason"] = "page_loaded_without_role_evidence"
    return _result(target, "error", "weak", provider, evidence)


async def verify_listing(
    target: VerificationTarget,
    client: httpx.AsyncClient,
) -> VerificationResult:
    try:
        response = await client.get(
            target.apply_url,
            follow_redirects=True,
            headers={"User-Agent": "MyroListingVerifier/1.0"},
        )
    except httpx.TimeoutException:
        return VerificationResult(
            target.job_id,
            "timeout",
            "weak",
            provider_for_url(target.apply_url),
            evidence={"verification_priority": target.verification_priority},
        )
    except httpx.RequestError as exc:
        return VerificationResult(
            target.job_id,
            "error",
            "weak",
            provider_for_url(target.apply_url),
            evidence={
                "error_type": type(exc).__name__,
                "verification_priority": target.verification_priority,
            },
        )
    return classify_listing_response(
        target,
        status_code=response.status_code,
        final_url=str(response.url),
        body=response.text[:500_000],
    )


def _result(
    target: VerificationTarget,
    result: str,
    strength: str,
    provider: str,
    evidence: dict[str, object],
) -> VerificationResult:
    evidence["verification_priority"] = target.verification_priority
    return VerificationResult(
        target.job_id,
        result,
        strength,
        provider,
        int(evidence["status_code"]),
        str(evidence["final_url"]),
        evidence,
    )


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def _title_is_present(title: str, normalized_body: str) -> bool:
    words = re.findall(r"[a-z0-9]+", title.lower())
    meaningful = [word for word in words if len(word) > 2]
    return len(meaningful) >= 2 and all(word in normalized_body for word in meaningful[:4])


def _looks_like_homepage_redirect(source_url: str, final_url: str) -> bool:
    final = urlparse(final_url)
    final_path = final.path.rstrip("/").lower()
    return source_url != final_url and final_path in {"", "/jobs", "/careers"}
