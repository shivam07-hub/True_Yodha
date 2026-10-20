"""Reading a pasted job link — Myro's corpus, then the page's JobPosting, then a model.

FD1, 2026-10-20. Of the 18 hosts with the most live jobs, five gave the old
reader nothing: Workday, Oracle Cloud (Kotak, the largest) and Infosys draw the
posting with JavaScript, so the fetched page had no text and the paste failed.
89.8% of live corpus jobs carry their own id in the link, and Workday pages
carry a schema.org JobPosting — neither needs a model.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from app.services import job_file_parser as jfp
from app.services import job_link_reader as reader
from app.services.job_file_parser import JobUrlFetchError


def test_ids_come_out_of_the_link_however_the_ats_spells_them():
    cases = {
        "https://www.amazon.jobs/en/jobs/10583131/intelligence-analyst-isaac": "10583131",
        "https://axisbank.ripplehire.com/candidate/candidatejobdetail?jobSeq=771128&source=CAREERSITE&token=WIX": "771128",
        "https://hcbt.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/270652": "270652",
        "https://career.infosys.com/jobdesc?referenceCode=INFSYS-EXTERNAL-253182": "INFSYS-EXTERNAL-253182",
        "https://genpact.wd108.myworkdayjobs.com/External_Careers/job/Mumbai/Developer---JAVA-S-4A_JR10022480": "JR10022480",
        "https://jobs.lever.co/paytm/7ed7b781-45fa-443c-aeb5-9f713568bfc9": "7ed7b781-45fa-443c-aeb5-9f713568bfc9",
    }
    for url, job_id in cases.items():
        assert job_id in reader.link_candidates(url), url


def test_a_link_with_no_id_in_it_asks_the_corpus_nothing():
    assert reader.link_candidates("https://careers.example.com/jobs/product-manager") == []
    assert reader.link_candidates("not a link") == []
    assert len(reader.link_candidates("https://x.com/" + "/".join(f"a{i}" for i in range(60)))) <= reader.MAX_CANDIDATES


# ── JobPosting ────────────────────────────────────────────────────────────────

def _page(*blocks: object) -> str:
    scripts = "".join(
        f'<script type="application/ld+json">{b if isinstance(b, str) else json.dumps(b)}</script>'
        for b in blocks
    )
    return f"<html><head>{scripts}</head><body><div id=app></div></body></html>"


POSTING = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": "Custom Software Engineer",
    "hiringOrganization": {"@type": "Organization", "name": "Accenture"},
    "jobLocation": [{"@type": "Place", "address": {
        "addressLocality": "Hyderabad", "addressRegion": "Telangana",
        "addressCountry": {"@type": "Country", "name": "India"},
    }}],
    "description": "&lt;p&gt;Design, build and configure applications to meet business needs.&lt;/p&gt;"
                   "&lt;ul&gt;&lt;li&gt;Work with Java and Spring&lt;/li&gt;&lt;/ul&gt;",
}


def test_a_jobposting_gives_every_field_without_a_model():
    fields = reader.jobposting_fields(_page({"@graph": [{"@type": "WebPage"}, POSTING]}))
    assert fields == {
        "role": "Custom Software Engineer",
        "company": "Accenture",
        "location": "Hyderabad, Telangana, India",
        "job_description": "Design, build and configure applications to meet business needs.\nWork with Java and Spring",
    }


def test_a_jobposting_in_a_list_or_with_a_type_list_is_still_found():
    as_list = dict(POSTING, **{"@type": ["JobPosting"]})
    assert reader.jobposting_fields(_page("{ not json", [{"@type": "Organization"}, as_list]))["company"] == "Accenture"


def test_a_remote_posting_says_remote_and_a_string_employer_is_kept():
    remote = dict(POSTING, jobLocation=None, jobLocationType="TELECOMMUTE", hiringOrganization="Lever Inc")
    fields = reader.jobposting_fields(_page(remote))
    assert fields["location"] == "Remote"
    assert fields["company"] == "Lever Inc"


def test_a_jobposting_without_a_usable_title_or_body_is_not_used():
    assert reader.jobposting_fields(_page(dict(POSTING, title=""))) is None
    assert reader.jobposting_fields(_page(dict(POSTING, description="<p>Apply</p>"))) is None
    assert reader.jobposting_fields(_page({"@type": "Organization", "name": "X"})) is None
    assert reader.jobposting_fields("<html><body>no data</body></html>") is None


# ── the order: corpus, then JobPosting, then the model ─────────────────────────

class _Repo:
    def __init__(self, rows: list[dict] | None = None) -> None:
        self.rows = rows or []
        self.asked: list[list[str]] = []

    def listings_for_link(self, job_ids: list[str]) -> list[dict]:
        self.asked.append(list(job_ids))
        return [r for r in self.rows if r["job_id"] in job_ids]


class _Provider:
    def __init__(self) -> None:
        self.calls = 0

    async def complete(self, messages, max_tokens=None, temperature=None):
        self.calls += 1
        return json.dumps({"company": "Acme", "role": "Analyst", "location": "Pune",
                           "job_description": "Own the weekly analysis for the business team."})


LINK = "https://hcbt.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/270652"
KOTAK_JD = (
    "Own the digital banking analytics for Kotak 811: define the product funnels, "
    "build the weekly business review, size the opportunities in onboarding and "
    "activation, and work with product, risk and operations teams to turn the "
    "findings into decisions. You will write SQL against large datasets, build "
    "self-serve dashboards, and present to the leadership team every month."
)
LISTING = {
    "job_id": "270652", "job_title": "Business Analyst", "company_name": "Kotak Mahindra Bank",
    "location": "Mumbai", "job_description": KOTAK_JD,
    "apply_url": LINK,
}


def _no_fetch(monkeypatch):
    async def _boom(url):
        raise AssertionError("the corpus answered; the page must not be fetched")
    monkeypatch.setattr(jfp, "fetch_posting_html", _boom)


def test_a_link_to_a_listing_myro_holds_is_that_listing(monkeypatch):
    _no_fetch(monkeypatch)
    provider = _Provider()
    fields, source = asyncio.run(reader.read_link(LINK + "?utm_source=x", _Repo([LISTING]), provider))
    assert source == "corpus"
    assert fields == {
        "role": "Business Analyst", "company": "Kotak Mahindra Bank", "location": "Mumbai",
        "job_description": KOTAK_JD, "listing_job_id": "270652",
    }
    assert provider.calls == 0


def test_an_id_that_belongs_to_another_page_is_not_a_match(monkeypatch):
    other = dict(LISTING, apply_url="https://other-bank.example.com/job/270652")

    async def _html(url):
        return _page(POSTING)

    monkeypatch.setattr(jfp, "fetch_posting_html", _html)
    fields, source = asyncio.run(reader.read_link(LINK, _Repo([other]), _Provider()))
    assert source == "jobposting"
    assert fields["listing_job_id"] is None


def test_a_jobposting_answers_before_the_model(monkeypatch):
    async def _html(url):
        return _page(POSTING)

    monkeypatch.setattr(jfp, "fetch_posting_html", _html)
    provider = _Provider()
    fields, source = asyncio.run(reader.read_link(
        "https://accenture.wd103.myworkdayjobs.com/AccentureCareers/job/Hyderabad/X_ATCI-5436680",
        _Repo(), provider,
    ))
    assert (source, fields["role"], provider.calls) == ("jobposting", "Custom Software Engineer", 0)


def test_the_model_reads_a_plain_page_last(monkeypatch):
    async def _html(url):
        return "<html><body><h1>Analyst</h1><p>" + "Own the weekly analysis for the business team. " * 3 + "</p></body></html>"

    monkeypatch.setattr(jfp, "fetch_posting_html", _html)
    provider = _Provider()
    fields, source = asyncio.run(reader.read_link("https://careers.example.com/jobs/42001", _Repo(), provider))
    assert (source, fields["role"], fields["listing_job_id"], provider.calls) == ("model", "Analyst", None, 1)


def test_a_page_drawn_by_javascript_with_no_data_still_says_so(monkeypatch):
    async def _html(url):
        return "<html><body><div id=root></div><script>render()</script></body></html>"

    monkeypatch.setattr(jfp, "fetch_posting_html", _html)
    with pytest.raises(JobUrlFetchError):
        asyncio.run(reader.read_link("https://careers.example.com/jobs/42001", _Repo(), _Provider()))


def test_every_read_names_its_reader(monkeypatch, caplog):
    _no_fetch(monkeypatch)
    with caplog.at_level("INFO", logger="myro.job_link_reader"):
        asyncio.run(reader.read_link(LINK, _Repo([LISTING]), _Provider()))
    assert any("metric job_import.read source=corpus" in r.getMessage() for r in caplog.records)


def test_an_office_code_is_not_an_employer_or_a_place():
    """Accenture's Workday JobPosting, 2026-10-20: hiringOrganization "8126 ASOL-
    Hyderabad 3" and region "HDC3C". The review asks for the company instead."""
    # The live page's shape: the office code shares the locality string.
    coded = dict(POSTING, hiringOrganization={"name": "8126 ASOL- Hyderabad 3 SEZ Company"}, jobLocation={
        "address": {"addressLocality": "Hyderabad, HDC3C", "addressCountry": "India"},
    })
    fields = reader.jobposting_fields(_page(coded))
    assert fields["company"] == ""
    assert fields["location"] == "Hyderabad, India"


def test_a_listing_without_a_real_description_is_not_the_answer(monkeypatch):
    """4,279 live listings carry the scraper's stub, measured 2026-10-20. A
    paste that lands on one must not hand the tailor a JD that says there is
    no JD — the page is read instead (and an unreadable page says so)."""
    stub = dict(LISTING, job_description=(
        "No JD provided on the company page. Matching and skill extraction are "
        "unavailable for this role until a job description is published."
    ))

    async def _html(url):
        return _page(POSTING)

    monkeypatch.setattr(jfp, "fetch_posting_html", _html)
    fields, source = asyncio.run(reader.read_link(LINK, _Repo([stub]), _Provider()))
    assert source == "jobposting"
    assert fields["listing_job_id"] is None
