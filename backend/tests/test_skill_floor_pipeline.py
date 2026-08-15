from __future__ import annotations

from typing import Any

import pytest

from app.services import skill_floor, skill_floor_pipeline


@pytest.mark.asyncio
async def test_worker_drains_stage_a_and_asserts_the_queue_is_clear(monkeypatch) -> None:
    db = object()
    drained: list[Any] = []

    monkeypatch.setattr(skill_floor_pipeline, "get_supabase_admin_batch", lambda: db)
    monkeypatch.setattr(
        skill_floor,
        "drain_skill_floor_queue",
        lambda actual: drained.append(actual)
        or {"jobs_seen": 12, "jobs_written": 10, "jobs_empty": 2},
    )
    monkeypatch.setattr(
        skill_floor,
        "count_missing_floor",
        lambda actual: skill_floor.FloorGap(total=22, recommendable=4, awaiting_stage_a=0),
    )

    await skill_floor_pipeline._drain_handler({"run_id": "run-1"}, allow_retry=True)

    assert drained == [db]


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
async def test_worker_retries_when_stage_a_work_remains(monkeypatch) -> None:
    monkeypatch.setattr(skill_floor_pipeline, "get_supabase_admin_batch", object)
    monkeypatch.setattr(
        skill_floor,
        "drain_skill_floor_queue",
        lambda _db: {"jobs_seen": 0, "jobs_written": 0, "jobs_empty": 0},
    )
    monkeypatch.setattr(
        skill_floor,
        "count_missing_floor",
        lambda _db: skill_floor.FloorGap(total=105, recommendable=90, awaiting_stage_a=105),
    )

    with pytest.raises(skill_floor_pipeline.TransientJobError):
        await skill_floor_pipeline._drain_handler({"run_id": "run-2"}, allow_retry=True)
