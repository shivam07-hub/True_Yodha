"""Page Entry — "which of my jobs is this page?", the extension's read on open.

CONTEXT.md → Collection Record → Page Entry. Page identity and the staging of
the matched row are tested here; the stage ladder itself is
test_collection_record.py's.
"""
from datetime import date

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.cv import get_token_cv_repository
from app.repositories.jobs import get_token_jobs_repository
from app.services.collections import applications_on_page, entry_for_page, same_page

BATCH_WEEK = date(2026, 10, 5)
WORKDAY = "https://dbs.wd3.myworkdayjobs.com/en-US/DBS/job/Hyderabad/Analyst_R123"


def application(job_id="j1", status="saved", apply_url=WORKDAY, **job_over):
    job = {
        "job_title": "Analyst",
        "company_name": "DBS",
        "apply_url": apply_url,
        "source_url": None,
        "is_active": True,
        "listing_confidence": "active",
    }
    job.update(job_over)
    return {
        "id": 10,
        "job_id": job_id,
        "status": status,
        "source": "user_discovery",
        "created_at": "2026-10-01T08:00:00+00:00",
        "jobs": job,
    }


# ── page identity ────────────────────────────────────────────────────────────

def test_tracking_params_fragment_and_case_are_not_identity():
    """The screenshot's page: Microsoft careers reached from LinkedIn (`&src=`)."""
    stored = "https://jobs.careers.microsoft.com/global/en/job/1789?lang=en_us"
    page = "https://Jobs.Careers.Microsoft.com/global/en/job/1789/?lang=en_us&src=LinkedIn#apply"
    assert same_page(page, stored)


def test_the_ats_job_id_in_the_query_is_identity():
    stored = "https://boards.greenhouse.io/acme/jobs?gh_jid=42"
    assert same_page("https://boards.greenhouse.io/acme/jobs?gh_jid=42&gh_src=li", stored)
    assert not same_page("https://boards.greenhouse.io/acme/jobs?gh_jid=99", stored)


def test_the_apply_step_is_the_same_posting():
    assert same_page(WORKDAY + "/apply/applyManually", WORKDAY)
    assert same_page("https://jobs.lever.co/acme/5f1e/apply", "https://jobs.lever.co/acme/5f1e")


def test_a_careers_index_does_not_claim_every_job_under_it():
    assert not same_page("https://careers.acme.com/jobs/123", "https://careers.acme.com/jobs")
    assert not same_page("https://careers.acme.com/jobs/123", "https://careers.acme.com")


def test_other_hosts_and_non_urls_never_match():
    assert not same_page("https://evil.example/en-US/DBS/job/Hyderabad/Analyst_R123", WORKDAY)
    assert not same_page("", WORKDAY)
    assert not same_page("chrome://extensions", "chrome://extensions")
    assert not same_page(WORKDAY, None)


def test_the_extension_imports_source_url_matches_too():
    row = application("ext_1", apply_url=None, source_url="https://jobs.example.com/r/7?src=LinkedIn")
    assert applications_on_page("https://jobs.example.com/r/7", [row]) == [row]


# ── staging the matched row ──────────────────────────────────────────────────

def _entry(rows, **over):
    kwargs = dict(applications=rows, tailored_by_job={}, pending_intent_job_ids=set(), batch_week=BATCH_WEEK)
    kwargs.update(over)
    return entry_for_page(**kwargs)


def test_no_row_is_no_entry():
    assert _entry([]) is None


def test_the_stage_comes_from_the_collection_resolver():
    tailored = {"j1": {"id": 5, "kind": "deterministic"}}
    assert _entry([application()]).stage == "saved"
    assert _entry([application()], tailored_by_job=tailored).stage == "tailored"
    assert _entry([application(status="applied")], tailored_by_job=tailored).stage == "applied"


def test_a_dead_listing_is_not_an_entry():
    assert _entry([application(listing_confidence="closed")]) is None


def test_two_rows_on_one_page_answer_with_the_furthest():
    """A corpus job the user tailored and an older extension import of the same
    posting: the popup must show the one they are working on."""
    rows = [application("ext_old"), application("corpus_1")]
    entry = _entry(rows, tailored_by_job={"corpus_1": {"id": 5, "kind": "deterministic"}})
    assert entry.job_id == "corpus_1"
    assert entry.stage == "tailored"
    assert entry.title == "Analyst" and entry.company == "DBS"


def test_an_unanswered_apply_click_rides_along():
    assert _entry([application()], pending_intent_job_ids={"j1"}).pending_apply is True


# ── the route ────────────────────────────────────────────────────────────────

class _Repo:
    def __init__(self, rows):
        self.rows = rows

    def get_user_application_pages(self, _uid):
        return self.rows

    def get_pending_apply_intent_job_ids(self, _uid, *, older_than, newer_than):
        return set()


class _CVRepo:
    def __init__(self):
        self.asked: list = []

    def latest_for_jobs(self, _uid, job_ids=None):
        self.asked.append(job_ids)
        return {"j1": {"id": 5, "kind": "deterministic"}}


def _client(rows, cv_repo):
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="n@example.com")
    app.dependency_overrides[get_token_jobs_repository] = lambda: _Repo(rows)
    app.dependency_overrides[get_token_cv_repository] = lambda: cv_repo
    return TestClient(app)


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_route_returns_the_staged_entry_and_scopes_the_cv_read():
    cv_repo = _CVRepo()
    resp = _client([application(), application("j2", apply_url="https://x.com/j/2")], cv_repo).post(
        "/jobs/collections/page", json={"url": WORKDAY + "/apply"}
    )
    assert resp.status_code == 200
    assert resp.json()["entry"] == {
        "job_id": "j1", "stage": "tailored", "title": "Analyst", "company": "DBS",
        "liveness": "live", "pending_apply": False,
    }
    assert cv_repo.asked == [["j1"]]


def test_route_unknown_page_is_null_and_reads_no_cvs():
    cv_repo = _CVRepo()
    resp = _client([application()], cv_repo).post("/jobs/collections/page", json={"url": "https://other.com/j/1"})
    assert resp.status_code == 200
    assert resp.json() == {"entry": None}
    assert cv_repo.asked == []
