"""Tests for the durable Background-Work seam (ADR-0008)."""

from __future__ import annotations

import asyncio

import pytest

from app.services import background
from app.services.background import dispatch


def _clear_handler(job_type: str):
    dispatch._HANDLERS.pop(job_type, None)


def test_enqueue_inline_runs_handler_when_no_redis(monkeypatch):
    monkeypatch.setattr(dispatch.settings, "redis_url", "")
    seen: list[tuple[dict, bool]] = []

    @background.handler("t_inline")
    async def _h(payload, allow_retry):
        seen.append((payload, allow_retry))

    async def run():
        background.enqueue(background.LANE_FAST, "t_inline", payload={"x": 1})
        await asyncio.sleep(0)  # let the created task run
        await asyncio.sleep(0)

    try:
        asyncio.run(run())
        assert seen == [({"x": 1}, False)]  # inline path → allow_retry False
    finally:
        _clear_handler("t_inline")


def test_enqueue_durable_routes_to_rq(monkeypatch):
    monkeypatch.setattr(dispatch.settings, "redis_url", "redis://fake:6379/0")
    captured: dict = {}

    def _fake_rq(lane, job_type, payload, correlation_id):
        captured.update(lane=lane, job_type=job_type, payload=payload, cid=correlation_id)

    monkeypatch.setattr(dispatch, "_enqueue_rq", _fake_rq)

    @background.handler("t_durable")
    async def _h(payload, allow_retry):  # pragma: no cover — not run in durable test
        pass

    try:
        background.enqueue(
            background.LANE_BULK, "t_durable", payload={"y": 2}, correlation_id="abc"
        )
        assert captured == {"lane": "bulk", "job_type": "t_durable", "payload": {"y": 2}, "cid": "abc"}
    finally:
        _clear_handler("t_durable")


def test_enqueue_durable_stays_queued_when_no_worker_is_active(monkeypatch):
    monkeypatch.setattr(dispatch.settings, "redis_url", "redis://fake:6379/0")
    captured: dict = {}
    monkeypatch.setattr(
        dispatch,
        "_enqueue_rq",
        lambda lane, job_type, payload, correlation_id: captured.update(
            lane=lane, job_type=job_type, payload=payload, cid=correlation_id
        ),
    )

    @background.handler("t_durable_no_worker")
    async def _h(_payload, _allow_retry):  # pragma: no cover — queued, not run inline
        pytest.fail("durable work must not run in the web process")

    try:
        background.enqueue(
            background.LANE_FAST,
            "t_durable_no_worker",
            payload={"x": 3},
            correlation_id="job-3",
        )
        assert captured == {
            "lane": "fast",
            "job_type": "t_durable_no_worker",
            "payload": {"x": 3},
            "cid": "job-3",
        }
    finally:
        _clear_handler("t_durable_no_worker")


def test_enqueue_rejects_unknown_lane(monkeypatch):
    monkeypatch.setattr(dispatch.settings, "redis_url", "")

    @background.handler("t_lane")
    async def _h(payload, allow_retry):  # pragma: no cover
        pass

    try:
        with pytest.raises(ValueError, match="Work Lane"):
            background.enqueue("middle", "t_lane", payload={})
    finally:
        _clear_handler("t_lane")


def test_enqueue_rejects_unregistered_job_type(monkeypatch):
    monkeypatch.setattr(dispatch.settings, "redis_url", "")
    with pytest.raises(ValueError, match="no handler"):
        background.enqueue(background.LANE_FAST, "never_registered", payload={})


def test_run_job_sync_propagates_transient_for_rq_retry():
    @background.handler("t_transient")
    async def _h(payload, allow_retry):
        raise background.TransientJobError("provider_down")

    try:
        with pytest.raises(background.TransientJobError):
            dispatch.run_job_sync("t_transient", {})
    finally:
        _clear_handler("t_transient")


def test_run_job_sync_does_not_raise_on_terminal_handler():
    # A handler that returns normally (e.g. permanent failure handled internally)
    # is terminal — RQ must NOT retry it.
    ran: list[bool] = []

    @background.handler("t_terminal")
    async def _h(payload, allow_retry):
        ran.append(allow_retry)  # allow_retry True on the RQ path

    try:
        dispatch.run_job_sync("t_terminal", {})
        assert ran == [True]
    finally:
        _clear_handler("t_terminal")


def _clear_failure(job_type: str):
    dispatch._FAILURE_HANDLERS.pop(job_type, None)


class _FakeJob:
    def __init__(self, args):
        self.args = args
        self.id = "job:x"


def test_run_failure_sync_invokes_registered_failure_handler():
    """ADR-0008 instant-refund: on RQ retry exhaustion the failure handler fires
    with the job payload."""
    refunded: list[dict] = []

    @background.failure_handler("t_fail")
    async def _f(payload):
        refunded.append(payload)

    try:
        job = _FakeJob(["t_fail", {"job_id": "j1", "user_id": "u1"}])
        dispatch.run_failure_sync(job, None, None, None, None)
        # `_abandoned` distinguishes "the worker vanished" from "the retry ladder
        # ran out" — RQ routes both here and only the second is a provider fault.
        assert refunded == [{"job_id": "j1", "user_id": "u1", "_abandoned": False}]
    finally:
        _clear_failure("t_fail")


def test_run_failure_sync_no_handler_is_noop():
    job = _FakeJob(["t_unregistered", {"x": 1}])
    dispatch.run_failure_sync(job, None, None, None, None)  # must not raise


def test_run_failure_sync_swallows_handler_crash():
    @background.failure_handler("t_boom")
    async def _f(_payload):
        raise RuntimeError("boom")

    try:
        job = _FakeJob(["t_boom", {}])
        dispatch.run_failure_sync(job, None, None, None, None)  # swallowed, no raise
    finally:
        _clear_failure("t_boom")
