import pytest

from app.services.job_listing_verifier import (
    VerificationTarget,
    ats_url_is_addressable,
    classify_listing_response,
    provider_for_url,
)

# The exact URL shape that produced 1,832 strong-closed Accenture verdicts in the
# 2026-08-08 batch: a Workday path starting at /job/, with no tenant site segment.
_SITELESS = (
    "https://accenture.wd103.myworkdayjobs.com"
    "/job/Chennai/Custom-Software-Engineer_ATCI-5436291-S1978254-1"
)
_ADDRESSED = (
    "https://accenture.wd103.myworkdayjobs.com"
    "/AccentureCareers/job/Chennai/Custom-Software-Engineer_ATCI-5436291-S1978254-1"
)


@pytest.mark.parametrize(
    ("url", "addressable"),
    [
        (_SITELESS, False),
        (_ADDRESSED, True),
        ("https://acme.wd5.myworkdayjobs.com/en-US/jobs/job/123", True),
        ("https://acme.wd5.myworkdayjobs.com/en-US/job/Pune/Role", False),
        ("https://acme.wd5.myworkdayjobs.com/job", False),
        # Only Workday has a registered shape; nothing else may be pre-judged.
        ("https://jobs.lever.co/job/123", True),
        ("https://careers.acme.com/job/123", True),
    ],
)
def test_workday_urls_need_a_tenant_site_segment_to_address_a_listing(
    url: str, addressable: bool
) -> None:
    assert ats_url_is_addressable(url) is addressable


def test_a_url_that_cannot_reach_the_listing_never_closes_it() -> None:
    """A blanket 404 from a tenant router is a data defect, not a dead role."""
    result = classify_listing_response(
        VerificationTarget("job-1", _SITELESS, "Custom Software Engineer"),
        status_code=404,
        final_url=_SITELESS,
        body="Not found",
    )

    assert result.result == "unroutable"
    assert result.strength == "weak"
    assert result.evidence["reason"] == "ats_site_segment_missing"


def test_the_same_workday_url_with_its_site_segment_still_closes_on_404() -> None:
    """The gate narrows the closed verdict; it must not remove it."""
    result = classify_listing_response(
        VerificationTarget("job-1", _ADDRESSED, "Custom Software Engineer"),
        status_code=404,
        final_url=_ADDRESSED,
        body="Not found",
    )

    assert result.result == "closed"
    assert result.strength == "strong"


def test_an_unaddressable_url_reaches_no_verdict_at_any_status() -> None:
    """Not just 404 — nothing this URL returns describes the listing."""
    for status in (200, 403, 500):
        result = classify_listing_response(
            VerificationTarget("job-1", _SITELESS, "Custom Software Engineer"),
            status_code=status,
            final_url=_SITELESS,
            body='{"@type":"JobPosting","title":"Custom Software Engineer"} Apply now',
        )

        assert result.result == "unroutable"


@pytest.mark.parametrize(
    ("url", "provider"),
    [
        ("https://acme.wd5.myworkdayjobs.com/en-US/jobs/job/123", "workday"),
        ("https://boards.greenhouse.io/acme/jobs/123", "greenhouse"),
        ("https://jobs.lever.co/acme/123", "lever"),
        ("https://jobs.smartrecruiters.com/Acme/123", "smartrecruiters"),
        ("https://careers.acme.com/jobs/123", "generic"),
    ],
)
def test_provider_detection(url: str, provider: str) -> None:
    assert provider_for_url(url) == provider


def test_authoritative_not_found_is_strong_closed_evidence() -> None:
    result = classify_listing_response(
        VerificationTarget("job-1", "https://jobs.lever.co/acme/123", "Data Analyst"),
        status_code=404,
        final_url="https://jobs.lever.co/acme/123",
        body="Not found",
    )

    assert result.result == "closed"
    assert result.strength == "strong"


def test_workday_shell_without_role_evidence_is_not_marked_live() -> None:
    result = classify_listing_response(
        VerificationTarget(
            "job-1",
            "https://acme.wd5.myworkdayjobs.com/en-US/jobs/job/123",
            "Data Analyst",
        ),
        status_code=200,
        final_url="https://acme.wd5.myworkdayjobs.com/en-US/jobs/job/123",
        body="<html><div id='app'></div><script>workday</script></html>",
    )

    assert result.result == "error"
    assert result.strength == "weak"


def test_jobposting_with_title_and_apply_action_is_live() -> None:
    result = classify_listing_response(
        VerificationTarget("job-1", "https://careers.acme.com/jobs/123", "Data Analyst"),
        status_code=200,
        final_url="https://careers.acme.com/jobs/123",
        body='{"@type":"JobPosting","title":"Data Analyst"} Apply now',
    )

    assert result.result == "seen_live"
    assert result.strength == "strong"


def test_closed_copy_overrides_http_200() -> None:
    result = classify_listing_response(
        VerificationTarget("job-1", "https://careers.acme.com/jobs/123", "Data Analyst"),
        status_code=200,
        final_url="https://careers.acme.com/jobs/123",
        body="This position has been filled and is no longer accepting applications.",
    )

    assert result.result == "closed"
    assert result.strength == "strong"


def test_blocked_response_never_closes_listing() -> None:
    result = classify_listing_response(
        VerificationTarget("job-1", "https://careers.acme.com/jobs/123", "Data Analyst"),
        status_code=403,
        final_url="https://careers.acme.com/jobs/123",
        body="Access denied",
    )

    assert result.result == "blocked"
    assert result.strength == "weak"


def test_ats_job_page_with_the_role_title_is_live_without_an_apply_marker() -> None:
    """Workday/Oracle/Lever render the apply form client-side.

    None of the three literal apply markers ("apply now", "apply for this job",
    "submit application") appear in the HTML we fetch, and the JSON-LD block is
    served inconsistently — so a page that plainly names the role fell through
    to `page_loaded_without_role_evidence`. That verdict was the last
    observation on 5,999 of the 11,204 listings the corpus called active, and
    because a failed check also re-stamped freshness, it kept those stale
    `active` claims alive indefinitely.
    """
    result = classify_listing_response(
        VerificationTarget(
            "job-1",
            "https://citi.wd5.myworkdayjobs.com/2/job/Bangalore/Business-Analytics-Analyst_26975804/apply",
            "Business Analytics Analyst-SAS/Python",
        ),
        status_code=200,
        final_url="https://citi.wd5.myworkdayjobs.com/2/job/Bangalore/Business-Analytics-Analyst_26975804/apply",
        body="<html><body>Business Analytics Analyst SAS Python — Bangalore</body></html>",
    )

    assert result.result == "seen_live"
    # One signal, not two — the title alone never earns "strong".
    assert result.strength == "medium"
    assert result.evidence["ats_job_url"] is True


def test_a_generic_host_still_needs_a_second_signal() -> None:
    """The relaxation is deliberately scoped to named ATS job URLs.

    A company careers search page is a generic host and can easily contain a
    role title while listing many jobs, so a title match there is not evidence
    that this particular listing is open.
    """
    result = classify_listing_response(
        VerificationTarget("job-1", "https://careers.wipro.com/search?q=data", "Data Analyst"),
        status_code=200,
        final_url="https://careers.wipro.com/search?q=data",
        body="<html><body>Data Analyst and 40 other roles</body></html>",
    )

    assert result.result == "error"
    assert result.evidence["reason"] == "page_loaded_without_role_evidence"


def test_a_dead_ats_listing_is_still_closed() -> None:
    """The relaxation must not reach the dead cases — they are claimed earlier."""
    gone = classify_listing_response(
        VerificationTarget("job-1", "https://job-boards.greenhouse.io/x/jobs/1", "Data Analyst"),
        status_code=404,
        final_url="https://job-boards.greenhouse.io/x/jobs/1",
        body="",
    )
    assert gone.result == "closed"
    assert gone.strength == "strong"

    pulled = classify_listing_response(
        VerificationTarget("job-1", "https://jobs.lever.co/x/abc", "Data Analyst"),
        status_code=200,
        final_url="https://jobs.lever.co/x/abc",
        body="<html>Data Analyst — this job is no longer available</html>",
    )
    assert pulled.result == "closed"
    assert pulled.strength == "strong"


def test_the_filled_phrasing_every_portal_shares_closes_the_listing() -> None:
    """Godrej says it in a clause neither narrow marker matched.

    Five Godrej listings on the 2026-08-27 shortlist read as `active` through
    this gap — two of them stamped verified-live within a week of being filled.
    """
    result = classify_listing_response(
        VerificationTarget(
            "job-1",
            "https://careers.godrejindustries.com/in/en/job/GGXGGZINP100671ENIN",
            "Manager Strategic Initiatives",
        ),
        status_code=200,
        final_url="https://careers.godrejindustries.com/in/en/job/GGXGGZINP100671ENIN",
        body=(
            "<html><body>Manager Strategic Initiatives. We're sorry… the job you "
            "are trying to apply for has been filled.</body></html>"
        ),
    )

    assert result.result == "closed"
    assert result.strength == "strong"


def test_a_pulled_workday_requisition_is_closed_despite_matching_its_own_title() -> None:
    """The shell answers 200, carries no closed marker, and echoes the apply URL.

    The slug in that URL contains the role title, so `_title_is_present` matched
    and the ATS-title branch called it live. Adobe R169083 was stamped
    `last_verified_live_at` on the morning of 2026-08-27 by exactly this path,
    while the page said the posting did not exist.
    """
    url = (
        "https://adobe.wd5.myworkdayjobs.com/external_experienced"
        "/job/Bangalore/Marketing-Specialist_R169083/apply"
    )
    result = classify_listing_response(
        VerificationTarget("job-1", url, "Marketing Specialist"),
        status_code=200,
        final_url=url,
        body=(
            '<html><head><link rel="canonical" href="' + url + '"></head>'
            "<body>Skip to main content. The page you are looking for doesn't exist."
            "</body></html>"
        ),
    )

    assert result.result == "closed"
    assert result.strength == "strong"
    assert result.evidence["reason"] == "ats_not_found_shell"


def test_a_generic_hosts_not_found_copy_is_not_a_listing_verdict() -> None:
    """Routing evidence only counts where a job URL has one meaning.

    On a company's own site that sentence can come from a stray widget or a
    site-wide handler; on a named ATS tenant it means the requisition is gone.
    """
    result = classify_listing_response(
        VerificationTarget("job-1", "https://careers.acme.com/roles/7", "Data Analyst"),
        status_code=200,
        final_url="https://careers.acme.com/roles/7",
        body="<html><body>Data Analyst — apply now. The page you are looking for moved.</body></html>",
    )

    assert result.result == "seen_live"


@pytest.mark.asyncio
async def test_verify_listing_trusts_the_json_probe_over_the_html() -> None:
    """The probe is asked first, and its verdict ends the check.

    The HTML handler here serves the exact shell that fooled the classifier —
    if the probe were skipped, or its answer discarded, this returns seen_live.
    """
    import httpx

    from app.services.job_listing_verifier import verify_listing

    url = (
        "https://adobe.wd5.myworkdayjobs.com/external_experienced"
        "/job/Bangalore/Marketing-Specialist_R169083/apply"
    )
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        if "/wday/cxs/" in str(request.url):
            # What the tenant actually returns for a pulled requisition: a
            # perfectly ordinary 200 with nothing in it.
            return httpx.Response(200, json={"total": 0, "jobPostings": []})
        return httpx.Response(
            200, text="<html>Marketing Specialist " + url + "</html>"
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await verify_listing(
            VerificationTarget("job-1", url, "Marketing Specialist"), client
        )

    assert result.result == "closed"
    assert result.strength == "strong"
    assert result.evidence["source"] == "ats_json_probe"
    # The HTML was never fetched: the probe concluded.
    assert seen == [
        "https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/external_experienced/jobs"
    ]


@pytest.mark.asyncio
async def test_an_inconclusive_probe_falls_back_to_reading_the_html() -> None:
    """A blocked probe must cost nothing — the check proceeds exactly as before."""
    import httpx

    from app.services.job_listing_verifier import verify_listing

    url = "https://jobs.lever.co/acme/abc-123"

    def handler(request: httpx.Request) -> httpx.Response:
        if "api.lever.co" in str(request.url):
            return httpx.Response(403)
        return httpx.Response(200, text="<html>Data Engineer — apply now</html>")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await verify_listing(
            VerificationTarget("job-1", url, "Data Engineer"), client
        )

    assert result.result == "seen_live"
    assert result.evidence.get("source") != "ats_json_probe"


@pytest.mark.asyncio
async def test_a_board_probe_larger_than_the_html_cap_still_parses() -> None:
    """Ashby answers for the whole board, so the payload dwarfs a listing page.

    Sarvam's board is 701KB. Truncated to the 500KB the HTML read uses, it
    parsed as nothing, the probe concluded nothing, and every Ashby listing fell
    back to the classifier this whole change exists to stop trusting.
    """
    import json as _json

    import httpx

    from app.services.job_listing_verifier import verify_listing

    pulled = "9ff0a6ad-9a30-403f-84d0-fb7a0914074b"
    board = {
        "jobs": [
            {"id": f"filler-{n}", "title": "Padding", "descriptionPlain": "x" * 700}
            for n in range(900)
        ]
    }
    assert len(_json.dumps(board)) > 500_000

    def handler(request: httpx.Request) -> httpx.Response:
        if "api.ashbyhq.com" in str(request.url):
            return httpx.Response(200, json=board)
        return httpx.Response(200, text="<html>Product Marketing Manager — apply now</html>")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await verify_listing(
            VerificationTarget(
                "job-1",
                f"https://jobs.ashbyhq.com/sarvam/{pulled}/application",
                "Product Marketing Manager",
            ),
            client,
        )

    assert result.result == "closed"
    assert result.evidence["source"] == "ats_json_probe"
