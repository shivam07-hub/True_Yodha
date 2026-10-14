"""The Return door (#55 S3): what a present person's list is owed, decided
without a model call, enqueued at most once per change."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from app.services import onboarding_service
from app.services.matching import feed_warm, list_reread

NOW = datetime(2026, 10, 13, 12, 0, tzinfo=timezone.utc)
_DIRECTION = {"target_role_title": "Data Analyst", "target_roles": ["Analytics"],
              "target_seniority": "mid", "target_location": "Pune"}


def _row(**keys: Any) -> dict[str, Any]:
    return {"job_id": "j1", "overall_score": 4.2, "recommendation": "Apply", **keys}


class _Repo:
    _db = None

    def __init__(self, *, latest: int = 7, age: timedelta = timedelta(hours=2),
                 verdicts_on: set[int] | None = None, shown: list[dict[str, Any]] | None = None,
                 profile: dict[str, Any] | None = None) -> None:
        self._latest = {"id": latest, "created_at": (NOW - age).isoformat()}
        self._on = verdicts_on if verdicts_on is not None else {latest}
        self._shown = shown or []
        self._profile = _DIRECTION if profile is None else profile

    def get_latest_baseline_stamp(self, _uid: str) -> dict[str, Any]:
        return self._latest

    def get_list_columns(self, _uid: str) -> dict[str, Any]:
        return dict(self._profile)

    def has_verdict(self, _uid: str, *, baseline_version_id: int | None = None) -> bool:
        return bool(self._on) if baseline_version_id is None else baseline_version_id in self._on

    def get_shown_verdict_keys(self, _uid: str, *, floor: float) -> list[dict[str, Any]]:
        return self._shown


@pytest.fixture
def lane(monkeypatch: pytest.MonkeyPatch) -> dict[str, list[Any]]:
    seen: dict[str, list[Any]] = {"jobs": [], "warms": []}
    monkeypatch.setattr(list_reread.background, "enqueue",
                        lambda _lane, job, **kw: seen["jobs"].append((job, kw["payload"])))
    monkeypatch.setattr(feed_warm, "enqueue_feed_warm",
                        lambda uid, **kw: seen["warms"].append((uid, kw)) or True)
    from app.services.job_refresh import _dispatch

    monkeypatch.setattr(_dispatch, "user_has_live_refresh", lambda _uid: False)
    return seen


def _uid() -> str:
    return str(uuid.uuid4())


def _keys(baseline: int) -> tuple[str, str]:
    profile = {**_DIRECTION, "baseline_version_id": baseline}
    return onboarding_service.eval_context_key(profile), onboarding_service.context_key(profile)


def test_a_cv_no_run_has_read_gets_one_run(lane: dict[str, list[Any]]) -> None:
    """A Main CV edit wrote CV 7 and never asked for a match; the list sits on CV 6."""
    uid = _uid()
    repo = _Repo(verdicts_on={6})
    assert list_reread.check(repo, uid, now=NOW) == "cv_run"
    assert lane["jobs"] == [("initial_match", {"user_id": uid, "force_context_refresh": True})]
    assert list_reread.check(repo, uid, now=NOW) == "claimed"
    assert len(lane["jobs"]) == 1


def test_a_cv_inside_the_grace_is_left_to_its_own_run(lane: dict[str, list[Any]]) -> None:
    uid = _uid()
    assert list_reread.check(_Repo(verdicts_on={6}, age=timedelta(minutes=5)), uid, now=NOW) == "cv_settling"
    assert lane["jobs"] == []
    # The grace passing is not spent by the early look.
    assert list_reread.check(_Repo(verdicts_on={6}), uid, now=NOW) == "cv_run"


def test_someone_never_matched_is_not_this_doors(lane: dict[str, list[Any]]) -> None:
    assert list_reread.check(_Repo(verdicts_on=set()), _uid(), now=NOW) == "never_matched"
    assert lane["jobs"] == [] and lane["warms"] == []


def test_stale_cards_on_the_list_are_reread_once_per_change(lane: dict[str, list[Any]]) -> None:
    uid = _uid()
    _, direction_key = _keys(7)
    repo = _Repo(shown=[_row(eval_context_hash="an-older-prompt", target_context_hash=direction_key)])
    assert list_reread.check(repo, uid, now=NOW) == "reread"
    assert lane["warms"] == [(uid, {"announce": True})]
    assert list_reread.check(repo, uid, now=NOW) == "claimed"
    assert len(lane["warms"]) == 1


def test_a_current_list_costs_nothing(lane: dict[str, list[Any]]) -> None:
    eval_key, direction_key = _keys(7)
    other_eval, other_direction = _keys(6)
    repo = _Repo(shown=[
        _row(eval_context_hash=eval_key, target_context_hash=direction_key),
        # Another CV's verdict is foreign: not a re-read, and not shown.
        _row(job_id="j2", eval_context_hash=other_eval, target_context_hash=other_direction),
        # Stale but not worth showing is not on the list.
        _row(job_id="j3", recommendation="Skip", eval_context_hash="old", target_context_hash=direction_key),
    ])
    assert list_reread.check(repo, _uid(), now=NOW) == "current"
    assert lane["jobs"] == [] and lane["warms"] == []


def test_no_direction_no_cv(lane: dict[str, list[Any]]) -> None:
    assert list_reread.check(_Repo(profile={}), _uid(), now=NOW) == "no_direction"

    class _NoCv(_Repo):
        def get_latest_baseline_stamp(self, _uid: str) -> None:
            return None

    assert list_reread.check(_NoCv(), _uid(), now=NOW) == "no_cv"


def test_the_door_claims_and_enqueues_only(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import background, forward_pass

    enqueued: list[tuple[str, dict[str, Any]]] = []
    monkeypatch.setattr(background, "enqueue", lambda _lane, job, **kw: enqueued.append((job, kw["payload"])))
    uid = _uid()
    assert forward_pass.reread_list(uid) is True
    assert forward_pass.reread_list(uid) is False  # inside the window
    assert enqueued == [("list_reread", {"user_id": uid})]


def test_a_direction_inside_its_grace_is_not_reread(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import forward_pass

    calls: list[str] = []
    monkeypatch.setattr(forward_pass, "reread_list", lambda uid: calls.append(uid) or True)
    just_now = datetime.now(timezone.utc).isoformat()
    forward_pass.on_profile_read(_uid(), {**_DIRECTION, "target_updated_at": just_now})
    assert calls == []
    forward_pass.on_profile_read("u-covered", {**_DIRECTION, "target_updated_at": "2026-10-01T00:00:00+00:00",
                                               "last_match_run_at": "2026-10-01T00:05:00+00:00"})
    assert calls == ["u-covered"]


class _Clicks:
    def __init__(self, clicked: set[str], saved: set[str], dismissed: set[str]) -> None:
        self._clicked, self._saved, self._dismissed = clicked, saved, dismissed
        self.filed: list[tuple[str, dict[str, Any]]] = []

    def get_pending_apply_intent_job_ids(self, _uid: str, *, older_than: datetime, newer_than: datetime) -> set[str]:
        return set(self._clicked)

    def get_dismissed_job_card_ids(self, _uid: str) -> list[str]:
        return list(self._dismissed)

    def get_application_with_job(self, _uid: str, job_id: str) -> dict[str, Any] | None:
        return {"job_id": job_id} if job_id in self._saved else None

    def upsert_application(self, _uid: str, job_id: str, updates: dict[str, Any]) -> None:
        self.filed.append((job_id, updates))


def test_an_apply_click_from_before_a_click_saved_is_filed_saved() -> None:
    """S5: "Did you apply?" asks on a save. Clicks before 3ff55125 have none."""
    repo = _Clicks(clicked={"orphan", "already-saved", "dismissed-since"},
                   saved={"already-saved"}, dismissed={"dismissed-since"})
    uid = _uid()
    assert list_reread.file_apply_clicks(repo, uid, now=NOW) == 1
    assert repo.filed == [("orphan", {"status": "saved", "source": "user_discovery"})]
    # Weekly per person, not on every look.
    assert list_reread.file_apply_clicks(repo, uid, now=NOW) == 0
