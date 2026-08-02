"""Company page existence contract: a company with real job listings but zero
reviews/comments must render (trust is a page OUTPUT, not an existence gate),
and only a company with none of jobs/reviews/notes should 404."""

from fastapi.testclient import TestClient

from app.main import app
import app.routers.companies as companies_router


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, data):
        self._data = data

    def select(self, *a, **k):
        return self

    def ilike(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return _FakeResult(self._data)


class _FakeDB:
    def __init__(self, table_data: dict[str, list]):
        self._table_data = table_data

    def table(self, name: str):
        return _FakeQuery(self._table_data.get(name, []))


def _get_company(monkeypatch, table_data: dict[str, list]):
    fake_db = _FakeDB(table_data)
    monkeypatch.setattr(companies_router, "get_supabase_admin", lambda: fake_db)
    with TestClient(app) as client:
        return client.get("/companies/Costco")


def test_company_with_only_job_listings_renders_not_404(monkeypatch) -> None:
    response = _get_company(
        monkeypatch,
        {
            "application_reviews": [],
            "jobs": [{"job_id": "j1", "job_title": "Store Manager"}],
            "comments": [],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["review_count"] == 0
    assert body["posting_notes"] == []


def test_company_with_nothing_at_all_is_404(monkeypatch) -> None:
    response = _get_company(
        monkeypatch,
        {"application_reviews": [], "jobs": [], "comments": []},
    )
    assert response.status_code == 404


def test_company_with_only_reviews_still_renders(monkeypatch) -> None:
    response = _get_company(
        monkeypatch,
        {
            "application_reviews": [
                {
                    "star_rating": 4,
                    "last_stage": "interviewing",
                    "outcome": "moved_forward",
                    "written_note": None,
                    "created_at": "2026-07-01T00:00:00+00:00",
                }
            ],
            "jobs": [],
            "comments": [],
        },
    )
    assert response.status_code == 200
    assert response.json()["review_count"] == 1


def test_company_with_jobs_and_comments_returns_posting_notes(monkeypatch) -> None:
    response = _get_company(
        monkeypatch,
        {
            "application_reviews": [],
            "jobs": [{"job_id": "j1", "job_title": "Store Manager"}],
            "comments": [
                {
                    "entity_id": "j1",
                    "body": "Interview was quick",
                    "user_id": "u1",
                    "created_at": "2026-07-01T00:00:00+00:00",
                }
            ],
            "user_profiles": [{"id": "u1", "ninja_name": "silent-fox-9k2"}],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["posting_note_count"] == 1
    assert body["posting_notes"][0]["author_ninja_name"] == "silent-fox-9k2"


class _RecordingQuery(_FakeQuery):
    """Fake query that remembers whether the caller bounded the read."""

    def __init__(self, data, calls: dict):
        super().__init__(data)
        self._calls = calls

    def limit(self, n, *a, **k):
        self._calls["limit"] = n
        return self

    def order(self, column, *a, **k):
        self._calls.setdefault("order", column)
        return self


class _RecordingDB(_FakeDB):
    def __init__(self, table_data: dict[str, list]):
        super().__init__(table_data)
        self.calls: dict[str, dict] = {}

    def table(self, name: str):
        calls = self.calls.setdefault(name, {})
        return _RecordingQuery(self._table_data.get(name, []), calls)


def test_company_job_read_is_bounded(monkeypatch) -> None:
    """The notes/existence read must never pull a company's whole job history.

    Unbounded, this read pulled every row a big company had ever posted and fed
    all of those ids into one `comments.in_(...)` filter — the pair outran the
    8s PostgREST ceiling and the public company page 500'd (Google, CRED,
    Elastic, Aon, L.E.K. Consulting all confirmed in prod). Deleting the
    `.limit()` reintroduces exactly that failure, so it is asserted here.
    """
    db = _RecordingDB(
        {
            "application_reviews": [],
            "jobs": [{"job_id": "j1", "job_title": "Store Manager"}],
            "comments": [],
        }
    )
    monkeypatch.setattr(companies_router, "get_supabase_admin", lambda: db)
    with TestClient(app) as client:
        response = client.get("/companies/Accenture")

    assert response.status_code == 200
    jobs_calls = db.calls["jobs"]
    assert jobs_calls.get("limit") == companies_router._NOTE_JOB_WINDOW
    assert jobs_calls.get("order") == "first_seen"
