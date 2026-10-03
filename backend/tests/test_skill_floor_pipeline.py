from __future__ import annotations

from typing import Any

import pytest

from app.services import skill_floor, skill_floor_pipeline


@pytest.mark.asyncio
async def test_worker_drains_stage_a_under_the_scrape_run_id(monkeypatch) -> None:
    db = object()
    drained: list[Any] = []

    monkeypatch.setattr(skill_floor_pipeline, "get_supabase_admin_batch", lambda: db)
    monkeypatch.setattr(
        skill_floor,
        "drain_skill_floor_queue",
        lambda actual, owner=None: drained.append((actual, owner))
        or {"jobs_seen": 12, "jobs_written": 10, "jobs_empty": 2},
    )

    await skill_floor_pipeline._drain_handler({"run_id": "run-1"}, allow_retry=True)

    # The scrape run id owns the leases, so RQ's retry of this same job can
    # take back a batch it was killed in without waiting out the lease.
    assert drained == [(db, "run-1")]


def test_enqueue_uses_the_long_running_bulk_lane(monkeypatch) -> None:
    captured: dict[str, Any] = {}

    monkeypatch.setattr(
        skill_floor_pipeline.background,
        "enqueue",
        lambda lane, job_type, **kwargs: captured.update(
            lane=lane,
            job_type=job_type,
            **kwargs,
        ),
    )

    assert skill_floor_pipeline.enqueue_drain("feed-123") is True
    assert captured == {
        "lane": "bulk",
        "job_type": "skill_floor_drain",
        "payload": {"run_id": "feed-123"},
        "correlation_id": "scrape:feed-123",
        "job_timeout_seconds": skill_floor_pipeline.JOB_TIMEOUT_SECONDS,
    }


@pytest.mark.asyncio
async def test_a_finished_drain_does_not_rescan_the_corpus(monkeypatch) -> None:
    """The post-drain gap count 57014'd under ingest load and marked a finished
    drain as crashed (2026-10-01). The empty claim that ends the loop is the proof."""
    monkeypatch.setattr(skill_floor_pipeline, "get_supabase_admin_batch", object)
    monkeypatch.setattr(
        skill_floor,
        "drain_skill_floor_queue",
        lambda _db, owner=None: {"jobs_seen": 0, "jobs_written": 0, "jobs_empty": 0},
    )

    def _no_count(_db: Any) -> skill_floor.FloorGap:
        raise AssertionError("the drain must not re-count the gap")

    monkeypatch.setattr(skill_floor, "count_missing_floor", _no_count)

    await skill_floor_pipeline._drain_handler({"run_id": "run-2"}, allow_retry=True)
