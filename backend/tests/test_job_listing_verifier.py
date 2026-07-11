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
