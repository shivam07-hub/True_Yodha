from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.scores import ScoreRecomputeInputs
from app.routers import scores


class _FakeScoresRepository:
    def __init__(
        self,
        score_row: dict[str, Any] | None = None,
        recompute_inputs: ScoreRecomputeInputs | None = None,
    ) -> None:
        self.score_row = score_row
        self.recompute_inputs = recompute_inputs or ScoreRecomputeInputs({}, [])

    def get_mirror_score(self, _user_id: str) -> dict[str, Any] | None:
        return self.score_row

    def get_recompute_inputs(self, _user_id: str) -> ScoreRecomputeInputs:
        return self.recompute_inputs


def _score_row(total_score: float = 72.5) -> dict[str, Any]:
    return {
        "total_score": total_score,
        "domain_scores": {"IT": total_score},
        "gap_skills": [],
        "skills_assessed": 2,
        "computed_at": datetime.now(timezone.utc),
        "rank_tier": "Expert",
    }


def test_get_my_score_reads_through_scores_repository() -> None:
    repo = _FakeScoresRepository(score_row=_score_row())
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[scores.get_token_scores_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.get("/scores/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["total_score"] == 72.5
    assert "rank_tier" not in response.json()


def test_get_my_score_returns_404_when_missing() -> None:
    repo = _FakeScoresRepository(score_row=None)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[scores.get_token_scores_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.get("/scores/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


def test_recompute_score_uses_repository_inputs(monkeypatch) -> None:
    repo = _FakeScoresRepository(
        recompute_inputs=ScoreRecomputeInputs(
            skill_level_map={"Python": 3},
            target_roles=["Data Analyst"],
        )
    )
    seen: dict[str, Any] = {}

    def fake_recompute(repo_arg: object, user_id: str) -> dict[str, Any]:
        seen["repo"] = repo_arg
        seen["user_id"] = user_id
        return _score_row(80.0)

    monkeypatch.setattr(scores.scoring, "recompute_score", fake_recompute)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[scores.get_token_scores_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.post("/scores/compute")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["score"]["total_score"] == 80.0
    assert seen == {
        "repo": repo,
        "user_id": "u1",
    }


def test_recompute_score_returns_404_without_skills() -> None:
    repo = _FakeScoresRepository(recompute_inputs=ScoreRecomputeInputs({}, []))
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[scores.get_token_scores_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.post("/scores/compute")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404

