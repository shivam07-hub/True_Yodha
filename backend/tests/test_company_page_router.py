"""Company page existence contract: a company with real job listings but zero
reviews must render, and only a company with neither jobs nor reviews 404s.
A written review note carries the author's ninja name, never their user id."""

from types import SimpleNamespace

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


class _FakeRpc:
    """One RPC call, resolved from the same table_data the .table() fake serves."""

    def __init__(self, rows: list, calls: dict | None = None, params: dict | None = None):
        self._rows = rows
        if calls is not None:
            calls["rpc_params"] = params

    def execute(self):
        return SimpleNamespace(data=self._rows, count=len(self._rows))


class _FakeDB:
    def __init__(self, table_data: dict[str, list]):
        self._table_data = table_data

    def table(self, name: str):
        return _FakeQuery(self._table_data.get(name, []))

    def rpc(self, name: str, params: dict):
        # The company reads go through RPCs so the query can say
        # `lower(company_name) =` — the expression the fast index needs and the
        # one PostgREST cannot express. Both read `jobs`.
        rows = self._table_data.get("jobs", [])
        if name == "company_jobs_for_notes":
            rows = rows[: params.get("p_limit") or len(rows)]
        return _FakeRpc(rows)


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
    assert body["reviews"] == []


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


def test_written_note_names_the_author(monkeypatch) -> None:
    response = _get_company(
        monkeypatch,
        {
            "application_reviews": [
                {
                    "user_id": "u1",
                    "star_rating": 3,
                    "last_stage": "applied",
                    "outcome": "ghosted",
                    "written_note": "Took the assignment. No reply after the second round.",
                    "created_at": "2026-07-01T00:00:00+00:00",
                }
            ],
            "jobs": [{"job_id": "j1", "job_title": "Store Manager"}],
            "user_profiles": [{"id": "u1", "ninja_name": "quiet-kite"}],
        },
    )
    assert response.status_code == 200
    review = response.json()["reviews"][0]
    assert review["author_ninja_name"] == "quiet-kite"
    assert review["last_stage"] == "applied"
    assert "user_id" not in review


def test_review_without_a_note_has_no_author(monkeypatch) -> None:
    response = _get_company(
        monkeypatch,
        {
            "application_reviews": [
                {
                    "user_id": "u1",
                    "star_rating": 4,
                    "last_stage": "interviewing",
                    "outcome": "moved_forward",
                    "written_note": "   ",
                    "created_at": "2026-07-01T00:00:00+00:00",
                }
            ],
            "jobs": [],
            "user_profiles": [{"id": "u1", "ninja_name": "quiet-kite"}],
        },
    )
    assert response.status_code == 200
    assert response.json()["reviews"][0]["author_ninja_name"] is None


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

    def rpc(self, name: str, params: dict):
        calls = self.calls.setdefault(name, {})
        rows = self._table_data.get("jobs", [])
        if name == "company_jobs_for_notes":
            rows = rows[: params.get("p_limit") or len(rows)]
        return _FakeRpc(rows, calls, params)


def test_company_job_read_is_one_row(monkeypatch) -> None:
    """Existence is one listing, not a company's job history.

    This read used to pull every row a big company had posted and feed those
    ids into one comments filter. The comments table is gone. Raising the
    limit reopens that scan, so the bound stays at one row.
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
    # The bound moved from `.limit()` to the RPC's p_limit when this read became
    # `company_jobs_for_notes` (the .ilike() it replaced was the platform's #3
    # database consumer). The GUARANTEE is unchanged and still asserted: this read
    # never pulls a company's whole job history.
    params = db.calls["company_jobs_for_notes"]["rpc_params"]
    assert params["p_limit"] == companies_router._JOB_EXISTS_LIMIT
    assert params["p_company"] == "Accenture"
