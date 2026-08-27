"""The ATS JSON probe: what it addresses, and what it refuses to conclude.

Every URL here is a real one from the 2026-08-27 shortlist incident, and every
expected verdict was confirmed against the live ATS on that date.
"""
import json

import pytest

from app.services.ats_probe import probe_for_url, read_probe

# Pulled on 2026-08-27; the HTML classifier called all three `seen_live`.
_WORKDAY_PULLED = (
    "https://adobe.wd5.myworkdayjobs.com/external_experienced"
    "/job/Bangalore/Marketing-Specialist_R169083/apply"
)
_WORKDAY_OPEN = (
    "https://browserstack.wd3.myworkdayjobs.com/External"
    "/job/Mumbai-Remote/SrLead-Manager---Growth_JR103574"
)


@pytest.mark.parametrize(
    ("url", "provider", "expected"),
    [
        (
            _WORKDAY_OPEN,
            "workday",
            "https://browserstack.wd3.myworkdayjobs.com/wday/cxs/browserstack/External/jobs",
        ),
        (
            "https://job-boards.greenhouse.io/razorpaysoftwareprivatelimited/jobs/4718620005",
            "greenhouse",
            "https://boards-api.greenhouse.io/v1/boards"
            "/razorpaysoftwareprivatelimited/jobs/4718620005",
        ),
        (
            "https://jobs.lever.co/hevodata/8d0ee4a7-1ecb-4129-af6b-14abc69b84e5",
            "lever",
            "https://api.lever.co/v0/postings/hevodata/8d0ee4a7-1ecb-4129-af6b-14abc69b84e5",
        ),
        (
            "https://jobs.ashbyhq.com/sarvam/ae56bf44-44fd-4966-afe0-eeaceb3bfb20/application",
            "ashby",
            "https://api.ashbyhq.com/posting-api/job-board/sarvam",
        ),
    ],
)
def test_probe_addresses_the_listing_the_apply_url_names(url, provider, expected):
    probe = probe_for_url(url, provider)
    assert probe is not None
    assert probe.url == expected


@pytest.mark.parametrize(
    ("url", "requisition", "slug"),
    [
        (_WORKDAY_OPEN, "JR103574", "SrLead-Manager---Growth_JR103574"),
        # The locale segment is routing, not identity, and `/apply` addresses the
        # form rather than the posting. Both are dropped before the slug is read.
        (_WORKDAY_PULLED, "R169083", "Marketing-Specialist_R169083"),
        (
            "https://unilever.wd3.myworkdayjobs.com/en-US/Unilever_Experienced_Professionals"
            "/job/Mumbai-HO/Assistant-Brand-Manager---Vaseline-Social_R-1180889/apply",
            "R-1180889",
            "Assistant-Brand-Manager---Vaseline-Social_R-1180889",
        ),
        # Workday's own dedupe suffix is part of the requisition, not noise.
        (
            "https://accenture.wd103.myworkdayjobs.com/AccentureCareers/job/Mumbai"
            "/GN--Strategy--M-A-and-Private-Equity---Senior-Manager_R00194553-28",
            "R00194553-28",
            "GN--Strategy--M-A-and-Private-Equity---Senior-Manager_R00194553-28",
        ),
    ],
)
def test_the_workday_probe_searches_for_the_requisition_in_the_slug(url, requisition, slug):
    probe = probe_for_url(url, "workday")
    assert probe.method == "POST"
    assert probe.payload["searchText"] == requisition
    assert probe.member_id == slug


def test_providers_without_a_public_read_api_get_no_probe():
    """Oracle carries 11.5k active listings and is deliberately not covered yet.

    A probe we have not tested against a real closed requisition would be a
    guess wearing the authority of an API call.
    """
    oracle = (
        "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210723685"
    )
    assert probe_for_url(oracle, "oracle") is None
    assert probe_for_url("https://careers.acme.com/jobs/7", "generic") is None


def test_a_workday_url_missing_its_site_segment_has_nothing_to_probe():
    """The defect that produced 1,832 false Accenture closures gets no probe either."""
    siteless = (
        "https://accenture.wd103.myworkdayjobs.com/job/Chennai/Custom-Software-Engineer_ATCI-1"
    )
    assert probe_for_url(siteless, "workday") is None


def test_a_pulled_workday_requisition_is_absent_from_its_own_search():
    """The search answers 200 either way; absence is the verdict.

    Confirmed against all three pulled requisitions on 2026-08-27, each of which
    returned `total: 0` while its HTML page still served a title-bearing shell.
    """
    probe = probe_for_url(_WORKDAY_PULLED, "workday")
    empty = json.dumps({"total": 0, "jobPostings": []})
    assert read_probe(probe, status_code=200, body=empty) == "closed"


def test_an_open_workday_requisition_still_has_a_path_that_addresses_it():
    probe = probe_for_url(_WORKDAY_OPEN, "workday")
    body = json.dumps({
        "total": 1,
        "jobPostings": [{
            "title": "Sr.Lead/Manager - Growth",
            "externalPath": "/job/Mumbai-Remote/SrLead-Manager---Growth_JR103574",
        }],
    })
    assert read_probe(probe, status_code=200, body=body) == "live"


def test_a_search_that_matched_some_other_requisition_does_not_prove_this_one_open():
    """`total > 0` is not the answer — the returned path has to address THIS slug."""
    probe = probe_for_url(_WORKDAY_OPEN, "workday")
    body = json.dumps({
        "total": 1,
        "jobPostings": [{
            "title": "Sr.Lead/Manager - Growth",
            "externalPath": "/job/Mumbai-Remote/SrLead-Manager---Growth_JR103576",
        }],
    })
    assert read_probe(probe, status_code=200, body=body) == "closed"


def test_a_workday_200_that_is_not_a_search_result_concludes_nothing():
    """The exact failure this module exists to fix, one layer down.

    A 200 whose body does not carry the search is not evidence either way.
    Answering `live` here would rebuild the shell false-positive inside the
    probe; answering `closed` would invent the opposite one.
    """
    probe = probe_for_url(_WORKDAY_OPEN, "workday")
    assert read_probe(probe, status_code=200, body=json.dumps({"total": 0})) is None
    assert read_probe(probe, status_code=200, body="<html>not json</html>") is None


@pytest.mark.parametrize("status", [401, 403, 429, 500, 503])
def test_a_probe_that_was_blocked_or_broke_concludes_nothing(status):
    """403 was the trap: Workday's per-posting record returns it BOTH for a pulled
    requisition and for a tenant that blocks us wholesale, so it can never
    separate them. That is why the probe asks the search endpoint instead — and
    why a non-200 here still concludes nothing.
    """
    probe = probe_for_url(_WORKDAY_OPEN, "workday")
    assert read_probe(probe, status_code=status, body="") is None


def test_greenhouse_and_lever_answer_with_the_record_itself():
    gh = probe_for_url("https://job-boards.greenhouse.io/inmobi/jobs/8076351", "greenhouse")
    assert read_probe(gh, status_code=200, body=json.dumps({"id": 8076351})) == "live"
    assert read_probe(gh, status_code=404, body='{"status":404}') == "closed"

    lever = probe_for_url("https://jobs.lever.co/meesho/abc-123", "lever")
    assert read_probe(lever, status_code=200, body=json.dumps({"id": "abc-123"})) == "live"
    assert read_probe(lever, status_code=404, body="") == "closed"


def test_ashby_answers_by_presence_on_the_board():
    """Ashby publishes no per-posting endpoint without a key, so absence is the verdict.

    Both ids are real: on 2026-08-27 Sarvam's board carried the first and had
    dropped the second.
    """
    live_id = "ae56bf44-44fd-4966-afe0-eeaceb3bfb20"
    pulled_id = "9ff0a6ad-9a30-403f-84d0-fb7a0914074b"
    board = json.dumps({"jobs": [{"id": live_id, "title": "Product Marketing Manager"}]})

    open_probe = probe_for_url(f"https://jobs.ashbyhq.com/sarvam/{live_id}", "ashby")
    pulled_probe = probe_for_url(f"https://jobs.ashbyhq.com/sarvam/{pulled_id}", "ashby")

    assert read_probe(open_probe, status_code=200, body=board) == "live"
    assert read_probe(pulled_probe, status_code=200, body=board) == "closed"


def test_an_empty_ashby_board_concludes_nothing():
    """A board with no jobs is as likely a bad org slug as a closed listing."""
    probe = probe_for_url("https://jobs.ashbyhq.com/typo-org/abc", "ashby")
    assert read_probe(probe, status_code=200, body=json.dumps({"jobs": []})) is None
    assert read_probe(probe, status_code=200, body=json.dumps({})) is None
