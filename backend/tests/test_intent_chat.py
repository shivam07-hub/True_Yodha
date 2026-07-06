"""Delta-4 intent chat — the LLM proposes, apply routes through the setters."""
from __future__ import annotations

import pytest

from app.services import intent_chat_service, onboarding_service


class _FakeProvider:
    def __init__(self, raw: str):
        self._raw = raw

    async def complete(self, _messages, max_tokens=0):
        return self._raw


@pytest.mark.asyncio
async def test_converse_returns_question_when_no_diff() -> None:
    provider = _FakeProvider('{"reply": "Remote only, or hybrid too?", "proposed_diff": null}')
    out = await intent_chat_service.converse(
        {"target_role_titles": ["Data Analyst"]},
        [{"role": "user", "content": "not seeing good roles"}],
        provider,
    )
    assert out["reply"] == "Remote only, or hybrid too?"
    assert out["proposed_diff"] is None


@pytest.mark.asyncio
async def test_converse_coerces_diff_and_drops_empty() -> None:
    raw = '{"reply": "Adding Product roles + remote. Apply?", "proposed_diff": {"add_roles": ["Product Manager"], "work_mode": "remote", "seniority": "banana"}}'
    out = await intent_chat_service.converse({}, [{"role": "user", "content": "hi"}], _FakeProvider(raw))
    diff = out["proposed_diff"]
    assert diff["add_roles"] == ["Product Manager"]
    assert diff["work_mode"] == "remote"
    assert diff["seniority"] is None  # invalid enum dropped


@pytest.mark.asyncio
async def test_converse_fallback_on_bad_json() -> None:
    out = await intent_chat_service.converse({}, [{"role": "user", "content": "hi"}], _FakeProvider("not json"))
    assert out["proposed_diff"] is None
    assert "role" in out["reply"].lower() or "missing" in out["reply"].lower()


class _FakeUsersRepo:
    def __init__(self, profile):
        self.profile = profile
        self.updates = {}

    def get_profile(self, _uid):
        return self.profile

    def update_profile(self, _uid, updates):
        self.updates = updates


class _FakeMem:
    def __init__(self):
        self.added = []

    def add(self, _uid, *, kind, text, source="authored", **_k):
        self.added.append((kind, text, source))


def test_apply_diff_adds_role_via_save_target(monkeypatch) -> None:
    users = _FakeUsersRepo({"target_role_titles": ["Data Analyst"]})
    mem = _FakeMem()
    calls = {}
    monkeypatch.setattr(intent_chat_service, "UsersRepository", lambda _db: users)
    monkeypatch.setattr(intent_chat_service, "UserMemoryRepository", lambda _db: mem)
    monkeypatch.setattr(
        onboarding_service, "save_target",
        lambda _db, _uid, **kw: calls.update(kw),
    )

    changed = intent_chat_service.apply_diff(
        object(), "u1",
        {"add_roles": ["Product Manager"], "remove_roles": [], "locations": ["Remote"],
         "seniority": None, "work_mode": "remote", "salary": "20 LPA+"},
    )

    # role union goes through save_target (recompute-wired)
    assert calls["role_titles"] == ["Data Analyst", "Product Manager"]
    assert changed["roles"] == ["Data Analyst", "Product Manager"]
    # location writes through profile
    assert users.updates["target_locations"] == ["Remote"]
    # non-columnized prefs land in memory as distilled facts
    kinds = {k for k, _t, _s in mem.added}
    assert kinds == {"work_mode", "salary"}
    assert all(s == "distilled" for _k, _t, s in mem.added)


def test_apply_diff_removal_keeps_at_least_one_role(monkeypatch) -> None:
    users = _FakeUsersRepo({"target_role_titles": ["Data Analyst"]})
    calls = {}
    monkeypatch.setattr(intent_chat_service, "UsersRepository", lambda _db: users)
    monkeypatch.setattr(intent_chat_service, "UserMemoryRepository", lambda _db: _FakeMem())
    monkeypatch.setattr(onboarding_service, "save_target", lambda _db, _uid, **kw: calls.update(kw))

    # removing the only role must not empty the target (save_target falls back)
    intent_chat_service.apply_diff(object(), "u1", {"remove_roles": ["Data Analyst"], "add_roles": ["Data Scientist"]})
    assert calls["role_titles"] == ["Data Scientist"]
