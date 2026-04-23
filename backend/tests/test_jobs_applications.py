from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.routers import jobs


class _DeleteQuery:
    def __init__(self, table_name: str) -> None:
        self.table_name = table_name
        self.filters: list[tuple[str, str]] = []

    def eq(self, column: str, value: str) -> "_DeleteQuery":
        self.filters.append((column, value))
        return self

    def execute(self) -> object:
        return object()


class _TableQuery:
    def __init__(self, delete_query: _DeleteQuery) -> None:
        self.delete_query = delete_query

    def delete(self) -> _DeleteQuery:
        return self.delete_query


class _FakeDb:
    def __init__(self) -> None:
        self.deletes: list[_DeleteQuery] = []

    def table(self, table_name: str) -> _TableQuery:
        delete_query = _DeleteQuery(table_name)
        self.deletes.append(delete_query)
        return _TableQuery(delete_query)


def test_remove_tracker_job_deletes_current_users_application_and_match(monkeypatch) -> None:
    db = _FakeDb()

    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": "user-123",
        "token": "token-123",
    }
    monkeypatch.setattr(jobs, "get_supabase_for_token", lambda token: db)

    try:
        with TestClient(app) as client:
            response = client.delete("/jobs/tracker/job-456")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204
    assert [(delete.table_name, delete.filters) for delete in db.deletes] == [
        ("job_applications", [("user_id", "user-123"), ("job_id", "job-456")]),
        ("user_job_matches", [("user_id", "user-123"), ("job_id", "job-456")]),
    ]
