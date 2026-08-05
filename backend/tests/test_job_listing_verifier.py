import pytest

from app.services.job_listing_verifier import (
    VerificationTarget,
    classify_listing_response,
    provider_for_url,
)


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
