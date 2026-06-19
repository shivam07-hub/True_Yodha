from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.deps import Principal
from app.routers.cv.versions import (
    CVVersionStructuredEditRequest,
    edit_cv_version_structured,
)


def _cv() -> dict:
    return {
        "contact": {"name": "Ada Lovelace", "email": "ada@example.com"},
        "summary": "Engineer",
        "education": [],
        "experience": [],
        "projects": [],
        "skills_line": "Python",
        "certs": [],
    }


class _Repo:
    def __init__(self, parent: dict | None) -> None:
        self.parent = parent
        self.spec = None

    def find(self, version_id: int, user_id: str):  # noqa: ANN201
        return self.parent

    def next_user_version_number(self, user_id: str) -> int:
        return 12

    def create(self, user_id: str, spec):  # noqa: ANN001, ANN201
        self.spec = spec
        return {
            "id": 88,
            "user_version_number": 12,
            "kind": spec.kind,
            "job_id": spec.job_id,
            "parent_version_id": spec.parent_version_id,
            "baseline_version_id": 2,
            "title": spec.title,
            "hidden_items": spec.hidden_items,
            "edited_items": {},
            "cv_structured": spec.cv_structured,
            "body_text": spec.body_text,
            "polished_text": spec.polished_text,
            "ai_polished": False,
            "created_at": datetime(2026, 6, 19, tzinfo=timezone.utc),
        }


def _principal() -> Principal:
    return Principal(id="user-1", email="ada@example.com", claims={})


def test_structured_edit_appends_job_scoped_child() -> None:
    repo = _Repo({
        "id": 55,
        "job_id": "job-1",
        "hidden_items": ["summary:0:abc"],
    })
    body = CVVersionStructuredEditRequest(cv=_cv())

    response = edit_cv_version_structured(55, body, _principal(), repo)  # type: ignore[arg-type]

    assert response.parent_version_id == 55
    assert response.job_id == "job-1"
    assert response.kind == "edited"
    assert response.cv_structured["contact"]["email"] == "ada@example.com"
    assert repo.spec.hidden_items == ["summary:0:abc"]
    assert "Ada Lovelace" in repo.spec.body_text


def test_structured_edit_rejects_main_cv_parent() -> None:
    repo = _Repo({"id": 2, "job_id": None, "hidden_items": []})

    with pytest.raises(HTTPException) as exc:
        edit_cv_version_structured(
            2,
            CVVersionStructuredEditRequest(cv=_cv()),
            _principal(),
            repo,  # type: ignore[arg-type]
        )

    assert exc.value.status_code == 400
