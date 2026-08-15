"""Provisional score while the user reviews skills (latency P0.3)."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import onboarding_service


class _CVRepo:
    def __init__(self, baseline: dict[str, Any] | None) -> None:
        self.baseline = baseline

    def find(self, _baseline_id: int, _user_id: str) -> dict[str, Any] | None:
        return self.baseline


class _ScoresRepo:
    def __init__(self, *, mirror: bool = False) -> None:
        self.mirror = mirror
        self.recorded: list[Any] = []

    def mirror_score_exists(self, _user_id: str) -> bool:
        return self.mirror


class _UsersRepo:
    def get_profile(self, _user_id: str) -> dict[str, Any]:
        return {}

    def update_profile(self, *_args: Any, **_kwargs: Any) -> None:
        return None


def test_seed_provisional_skips_when_already_confirmed(monkeypatch: pytest.MonkeyPatch) -> None:
    baseline = {
        "id": 3,
        "skills_confirmed_at": "2026-08-15T00:00:00+00:00",
        "skills_detected": [{"taxonomy_key": "Python (Programming Language)"}],
    }
    monkeypatch.setattr(onboarding_service, "CVVersionsRepository", lambda _db: _CVRepo(baseline))
    monkeypatch.setattr(
        onboarding_service.scoring,
        "record_cv_score",
        lambda *_a, **_k: pytest.fail("confirmed baseline must not provisional-score"),
    )

    assert onboarding_service.seed_provisional_baseline_score(object(), "u1", 3) is False


def test_seed_provisional_records_score_from_detected_skills(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    baseline = {
        "id": 3,
        "skills_confirmed_at": None,
        "skills_detected": [
            {
                "taxonomy_key": "Python (Programming Language)",
                "signal_type": "project",
                "evidence": "Built a service",
            }
        ],
    }
    scores = _ScoresRepo()
    recorded: list[str] = []

    monkeypatch.setattr(onboarding_service, "CVVersionsRepository", lambda _db: _CVRepo(baseline))
    monkeypatch.setattr(onboarding_service, "ScoresRepository", lambda _db: scores)
    monkeypatch.setattr(onboarding_service, "UsersRepository", lambda _db: _UsersRepo())
    monkeypatch.setattr(
        onboarding_service.scoring,
        "record_cv_score",
        lambda *_a, **_k: recorded.append("scored") or {"total_score": 40.0},
    )

    assert onboarding_service.seed_provisional_baseline_score(object(), "u1", 3) is True
    assert recorded == ["scored"]


def test_enqueue_provisional_is_fail_soft(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        onboarding_service.background,
        "enqueue",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("queue down")),
    )
    assert onboarding_service.enqueue_provisional_baseline_score("u1", 3) is False
