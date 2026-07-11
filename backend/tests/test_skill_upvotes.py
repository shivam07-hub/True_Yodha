"""Skill upvotes — the per-(skill, job) learning-intent toggle behind the job
drawer's "Skills to build" rows. Count semantics: a skill's count = how many of
the user's jobs it was upvoted from. An upvote also lands the skill in the
practice queue (source "job_upvote") so Forge always shows it; un-upvoting the
last job removes only that auto-created row.
"""
from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.users import get_token_users_repository


class _FakeUpvotesRepo:
    def __init__(self) -> None:
        self.upvotes: list[dict] = []
        self.practice_saves: list[dict] = []

    # ── skill upvotes ──
    def list_skill_upvotes(self, _user_id: str) -> list[dict]:
        return list(self.upvotes)

    def add_skill_upvote(self, _user_id: str, skill_key: str, display_name: str, job_id: str) -> None:
        if any(r["skill_key"] == skill_key and r["job_id"] == job_id for r in self.upvotes):
            return
        self.upvotes.append(
            {"skill_key": skill_key, "display_name": display_name, "job_id": job_id, "created_at": "now"}
        )

    def remove_skill_upvote(self, _user_id: str, skill_key: str, job_id: str) -> None:
        self.upvotes = [
            r for r in self.upvotes if not (r["skill_key"] == skill_key and r["job_id"] == job_id)
        ]

    # ── practice saves (the Forge queue link) ──
    def add_practice_save(self, _user_id: str, skill_key: str, display_name: str, source: str) -> None:
        if any(r["skill_key"] == skill_key for r in self.practice_saves):
            return
        self.practice_saves.append(
            {"skill_key": skill_key, "display_name": display_name, "source": source}
        )

    def remove_practice_save_if_source(self, _user_id: str, skill_key: str, source: str) -> None:
        self.practice_saves = [
            r
            for r in self.practice_saves
            if not (r["skill_key"] == skill_key and r["source"] == source)
        ]


def _client(repo: _FakeUpvotesRepo) -> TestClient:
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1")
    app.dependency_overrides[get_token_users_repository] = lambda: repo
    return TestClient(app)


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_toggle_on_counts_and_queues_for_practice() -> None:
    repo = _FakeUpvotesRepo()
    with _client(repo) as client:
        res = client.post(
            "/users/me/skill-upvotes/toggle",
            json={"skill_key": "Data Science", "display_name": "Data Science", "job_id": "j1"},
        )
    assert res.status_code == 200
    assert res.json() == {"skill_key": "Data Science", "upvoted": True, "count": 1}
    assert repo.practice_saves == [
        {"skill_key": "Data Science", "display_name": "Data Science", "source": "job_upvote"}
    ]


def test_count_accumulates_across_jobs() -> None:
    repo = _FakeUpvotesRepo()
    with _client(repo) as client:
        client.post("/users/me/skill-upvotes/toggle", json={"skill_key": "SQL", "job_id": "j1"})
        res = client.post("/users/me/skill-upvotes/toggle", json={"skill_key": "SQL", "job_id": "j2"})
        listed = client.get("/users/me/skill-upvotes")
    assert res.json()["count"] == 2
    skills = listed.json()["skills"]
    assert skills == [{"skill_key": "SQL", "display_name": "SQL", "count": 2, "job_ids": ["j1", "j2"]}]


def test_toggle_off_last_job_clears_auto_practice_save_only() -> None:
    repo = _FakeUpvotesRepo()
    # A save the user curated themselves must survive the un-upvote.
    repo.practice_saves.append({"skill_key": "SQL", "display_name": "SQL", "source": "manual"})
    with _client(repo) as client:
        client.post("/users/me/skill-upvotes/toggle", json={"skill_key": "SQL", "job_id": "j1"})
        res = client.post("/users/me/skill-upvotes/toggle", json={"skill_key": "SQL", "job_id": "j1"})
    assert res.json() == {"skill_key": "SQL", "upvoted": False, "count": 0}
    assert repo.upvotes == []
    assert repo.practice_saves == [{"skill_key": "SQL", "display_name": "SQL", "source": "manual"}]


def test_toggle_off_one_of_many_keeps_queue_row() -> None:
    repo = _FakeUpvotesRepo()
    with _client(repo) as client:
        client.post("/users/me/skill-upvotes/toggle", json={"skill_key": "SQL", "job_id": "j1"})
        client.post("/users/me/skill-upvotes/toggle", json={"skill_key": "SQL", "job_id": "j2"})
        res = client.post("/users/me/skill-upvotes/toggle", json={"skill_key": "SQL", "job_id": "j1"})
    assert res.json() == {"skill_key": "SQL", "upvoted": False, "count": 1}
    assert [r["source"] for r in repo.practice_saves] == ["job_upvote"]


def test_blank_ids_rejected() -> None:
    repo = _FakeUpvotesRepo()
    with _client(repo) as client:
        res = client.post("/users/me/skill-upvotes/toggle", json={"skill_key": "  ", "job_id": "j1"})
    assert res.status_code == 400
