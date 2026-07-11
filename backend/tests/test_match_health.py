"""compute_match_health — the Career-Ops vetting trust signal.

Covers the five states + the two that must NEVER false-alarm: an exhausted feed
(no overlapping jobs) is `empty`, not `failed`; a just-finished upload is still
`computing`, not `failed`.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.services import jobs_workflow


class _FakeRepo:
    def __init__(
        self,
        *,
        computed: bool = False,
        skill_keys: list[str] | None = None,
        candidate_ids: list[str] | None = None,
    ) -> None:
        self._computed = computed
        self._skill_keys = skill_keys or []
        self._candidate_ids = candidate_ids or []

    def has_computed_matches(self, user_id: str) -> bool:
        return self._computed

    def get_user_skill_rows(self, user_id: str) -> list[dict]:
        return [{"skills": {"taxonomy_key": k}} for k in self._skill_keys]

    def get_candidate_job_ids_for_skills(self, keys, *, target_location_countries=None):
        return list(self._candidate_ids)


def _row(*, vetted: bool) -> dict:
    return {"job_id": "j1", "overall_score": 4.2 if vetted else None}


def _health(repo, rows, *, upload=None, now=None, monkeypatch):
    monkeypatch.setattr(
        "app.repositories.cv_upload_jobs.get_latest_status",
        lambda user_id: upload,
    )
    # targeting.for_ranking is only reached in the failed/exhausted probe; stub it.
    class _Brief:
        def ranking_profile(self):
            return {}
    monkeypatch.setattr(jobs_workflow.targeting, "for_ranking", lambda repo, uid: _Brief())
    return jobs_workflow.compute_match_health(repo, "u1", rows, now=now)


def test_vetted_when_any_row_has_eval(monkeypatch) -> None:
    rows = [_row(vetted=False), _row(vetted=True)]
    assert _health(_FakeRepo(), rows, monkeypatch=monkeypatch) == "vetted"


def test_overlap_only_when_no_row_vetted(monkeypatch) -> None:
    # Matches exist but the brain vetted NONE — the silent-degradation case.
    rows = [_row(vetted=False), _row(vetted=False)]
    assert _health(_FakeRepo(), rows, monkeypatch=monkeypatch) == "overlap_only"


def test_empty_when_no_skills(monkeypatch) -> None:
    assert _health(_FakeRepo(skill_keys=[]), [], monkeypatch=monkeypatch) == "empty"


def test_empty_when_already_matched_before(monkeypatch) -> None:
    # Matched before, none now (dismissed all) → not a failure.
    repo = _FakeRepo(computed=True, skill_keys=["python"])
    assert _health(repo, [], monkeypatch=monkeypatch) == "empty"


def test_computing_while_upload_processing(monkeypatch) -> None:
    repo = _FakeRepo(skill_keys=["python"], candidate_ids=["j9"])
    upload = {"status": "processing", "created_at": "2026-07-11T10:00:00+00:00"}
    assert _health(repo, [], upload=upload, monkeypatch=monkeypatch) == "computing"


def test_computing_within_grace_after_upload_done(monkeypatch) -> None:
    now = datetime(2026, 7, 11, 10, 0, 30, tzinfo=timezone.utc)  # 30s after finish
    repo = _FakeRepo(skill_keys=["python"], candidate_ids=["j9"])
    upload = {"status": "done", "finished_at": "2026-07-11T10:00:00+00:00"}
    assert _health(repo, [], upload=upload, now=now, monkeypatch=monkeypatch) == "computing"


def test_failed_when_pool_exists_but_nothing_matched(monkeypatch) -> None:
    now = datetime(2026, 7, 11, 10, 5, 0, tzinfo=timezone.utc)  # well past grace
    repo = _FakeRepo(skill_keys=["python"], candidate_ids=["j9"])  # pool NOT empty
    upload = {"status": "done", "finished_at": "2026-07-11T10:00:00+00:00"}
    assert _health(repo, [], upload=upload, now=now, monkeypatch=monkeypatch) == "failed"


def test_exhausted_pool_is_empty_not_failed(monkeypatch) -> None:
    # Skilled, upload long done, but the market has NO overlapping job → genuine
    # empty. Must NOT be "failed" (a retry would loop with zero results).
    now = datetime(2026, 7, 11, 10, 5, 0, tzinfo=timezone.utc)
    repo = _FakeRepo(skill_keys=["cobol"], candidate_ids=[])  # empty pool
    upload = {"status": "done", "finished_at": "2026-07-11T10:00:00+00:00"}
    assert _health(repo, [], upload=upload, now=now, monkeypatch=monkeypatch) == "empty"
