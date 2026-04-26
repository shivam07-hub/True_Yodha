from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.repositories.cv import get_token_cv_repository
from app.routers.cv import upload as cv_upload


class _FakeCVRepository:
    def __init__(self) -> None:
        self.client = object()

    def update_cv_profile(self, _user_id: str, _payload: dict) -> None:  # pragma: no cover
        raise AssertionError("update_cv_profile should not be called when scoring fails")

    def insert_cv_history(self, _payload: dict) -> None:  # pragma: no cover
        raise AssertionError("insert_cv_history should not be called when scoring fails")

    def next_version_number(self, _user_id: str) -> int:
        return 1


def test_upload_cv_returns_422_when_no_skills_can_be_persisted(monkeypatch) -> None:
    repo = _FakeCVRepository()
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[get_token_cv_repository] = lambda: repo
    monkeypatch.setattr(cv_upload, "assert_not_rate_limited", lambda *_args, **_kwargs: None)

    async def _fake_parse_cv(_file_bytes: bytes, _file_type: str) -> dict:
        return {
            "skills_detected": [{"taxonomy_key": "Django", "signal_type": "impact", "xp_awarded": 350, "evidence": "Built APIs"}],
            "raw_text": "Built APIs with Django and scaled backend systems.",
        }

    def _fail_scoring(*_args, **_kwargs) -> dict:
        raise ValueError("No valid skills could be persisted for this user.")

    monkeypatch.setattr(cv_upload.cv_parser, "parse_cv", _fake_parse_cv)
    monkeypatch.setattr(cv_upload.scoring_engine, "compute_and_persist_score", _fail_scoring)

    try:
        with TestClient(app) as client:
            response = client.post(
                "/cv/upload",
                files={"file": ("cv.pdf", b"%PDF-1.4 test cv", "application/pdf")},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert "could not be mapped" in response.json()["detail"]


def test_submit_cv_text_returns_422_when_no_skills_can_be_persisted(monkeypatch) -> None:
    repo = _FakeCVRepository()
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[get_token_cv_repository] = lambda: repo
    monkeypatch.setattr(cv_upload, "assert_not_rate_limited", lambda *_args, **_kwargs: None)

    async def _fake_parse_cv_text(_raw_text: str) -> dict:
        return {
            "skills_detected": [{"taxonomy_key": "SQL (Programming Language)", "signal_type": "project", "xp_awarded": 150, "evidence": "Built reports"}],
            "raw_text": _raw_text,
        }

    def _fail_scoring(*_args, **_kwargs) -> dict:
        raise ValueError("No valid skills could be persisted for this user.")

    monkeypatch.setattr(cv_upload.cv_parser, "parse_cv_text", _fake_parse_cv_text)
    monkeypatch.setattr(cv_upload.scoring_engine, "compute_and_persist_score", _fail_scoring)

    try:
        with TestClient(app) as client:
            response = client.post(
                "/cv/text",
                json={"text": "I built production data dashboards with SQL and analytics tooling across projects."},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    assert "could not be mapped" in response.json()["detail"]
