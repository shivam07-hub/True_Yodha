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
