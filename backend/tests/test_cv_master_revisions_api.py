from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.deps import Principal
from app.routers.cv.structured import list_master_revisions, restore_master_revision


def _principal() -> Principal:
    return Principal(id="user-1", email="ada@example.com", claims={})


class _Repo:
    def __init__(self) -> None:
        self.updated = None

    def list_master_revisions(self, user_id: str):  # noqa: ANN201
        return [{
            "id": 7,
            "master_version_id": 2,
            "revision_number": 4,
            "created_at": datetime(2026, 6, 19, tzinfo=timezone.utc),
            "cv_structured": {"summary": "Earlier"},
        }]

    def find_master_revision(self, revision_id: int, user_id: str):  # noqa: ANN201
        if revision_id != 7:
            return None
        return {
            "id": 7,
            "cv_structured": {
                "contact": {"name": "Ada Lovelace"},
                "summary": "Earlier",
                "education": [],
                "experience": [],
                "projects": [],
                "skills_line": None,
                "certs": [],
            },
        }

    def update_master(self, user_id: str, **payload):  # noqa: ANN201
        self.updated = payload
        return {"id": 2, "user_version_number": 9}


def test_lists_master_revision_metadata() -> None:
    response = list_master_revisions(_principal(), _Repo())  # type: ignore[arg-type]
    assert response.revisions[0].revision_number == 4


def test_restore_is_non_destructive_master_update(monkeypatch) -> None:  # noqa: ANN001
    repo = _Repo()
    monkeypatch.setattr("app.routers.cv.structured.background.enqueue", lambda *args, **kwargs: None)
    response = restore_master_revision(7, _principal(), repo)  # type: ignore[arg-type]
    assert response.baseline_id == 2
    assert repo.updated["cv_structured"]["contact"]["name"] == "Ada Lovelace"


def test_restore_rejects_unknown_revision() -> None:
    with pytest.raises(HTTPException) as exc:
        restore_master_revision(99, _principal(), _Repo())  # type: ignore[arg-type]
    assert exc.value.status_code == 404
