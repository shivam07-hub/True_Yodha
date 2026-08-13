import time
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock

from app.services import shared_cache


def setup_function() -> None:
    # Tests exercise the local-dict fallback (no REDIS_URL in the test env) —
    # start each test from a clean slate so entries/claims can't leak across.
    shared_cache._LOCAL_CACHE.clear()
    from app.services.background import debounce

    debounce._LOCAL_CLAIMS.clear()
    debounce._LOCAL_LEASES.clear()


def test_absent_computes_inline_and_caches() -> None:
    calls = []

    def compute():
        calls.append(1)
        return {"n": len(calls)}

    out = shared_cache.get_or_compute("k1", compute, ttl_seconds=60)
    assert out == {"n": 1}
    assert len(calls) == 1

    # Fresh — no recompute.
    out2 = shared_cache.get_or_compute("k1", compute, ttl_seconds=60)
    assert out2 == {"n": 1}
    assert len(calls) == 1


def test_concurrent_cold_hits_wait_for_one_fill() -> None:
    callers = 8
    barrier = Barrier(callers)
    calls = 0
    lock = Lock()

    def compute():
        nonlocal calls
        with lock:
            calls += 1
        time.sleep(0.08)
        return {"ready": True}

    def hit():
        barrier.wait()
        return shared_cache.get_or_compute("cold", compute, ttl_seconds=60)

    with ThreadPoolExecutor(max_workers=callers) as pool:
        results = list(pool.map(lambda _n: hit(), range(callers)))

    assert results == [{"ready": True}] * callers
    assert calls == 1


def test_cold_fill_wait_is_bounded_when_winner_never_publishes(monkeypatch) -> None:
    monkeypatch.setattr(shared_cache, "_COLD_FILL_WAIT_SECONDS", 0.03)
    monkeypatch.setattr(shared_cache, "_COLD_FILL_POLL_SECONDS", 0.005)
    monkeypatch.setattr(shared_cache.debounce, "acquire_lease", lambda *_a, **_k: None)

    started = time.monotonic()
    assert shared_cache.get_or_compute("stalled", lambda: "fallback", ttl_seconds=60) == "fallback"
    assert time.monotonic() - started < 0.2

def test_stale_returns_old_value_and_refreshes_in_background() -> None:
    calls = []

    def compute():
        calls.append(1)
        return {"n": len(calls)}

    # Populate, then age the entry past ttl but inside the stale window.
    shared_cache.get_or_compute("k2", compute, ttl_seconds=60, stale_seconds=300)
    assert len(calls) == 1
    key, (computed_at, data) = "k2", shared_cache._LOCAL_CACHE["k2"]
    shared_cache._LOCAL_CACHE[key] = (computed_at - 61, data)

    out = shared_cache.get_or_compute("k2", compute, ttl_seconds=60, stale_seconds=300)
    # The STALE value comes back immediately — never blocks on the refresh.
    assert out == {"n": 1}

    # The background refresh was submitted to the shared pool; wait for it.
    shared_cache._REFRESH_POOL.shutdown(wait=True)
    shared_cache._REFRESH_POOL = shared_cache.ThreadPoolExecutor(
        max_workers=4, thread_name_prefix="shared-cache-refresh"
    )
    assert len(calls) == 2
    refreshed_at, refreshed_data = shared_cache._LOCAL_CACHE["k2"]
    assert refreshed_data == {"n": 2}


def test_concurrent_stale_hits_refresh_at_most_once() -> None:
    calls = []

    def compute():
        calls.append(1)
        time.sleep(0.05)
        return {"n": len(calls)}

    shared_cache.get_or_compute("k3", compute, ttl_seconds=60, stale_seconds=300)
    computed_at, data = shared_cache._LOCAL_CACHE["k3"]
    shared_cache._LOCAL_CACHE["k3"] = (computed_at - 61, data)

    # Three callers hit the same stale key "simultaneously" — only one may
    # win the claim and submit a refresh; the others just get the stale value.
    for _ in range(3):
        out = shared_cache.get_or_compute("k3", compute, ttl_seconds=60, stale_seconds=300)
        assert out == data

    shared_cache._REFRESH_POOL.shutdown(wait=True)
    shared_cache._REFRESH_POOL = shared_cache.ThreadPoolExecutor(
        max_workers=4, thread_name_prefix="shared-cache-refresh"
    )
    # One initial compute + exactly one background refresh, not three.
    assert len(calls) == 2


def test_background_refresh_failure_is_logged_not_silent(monkeypatch, caplog) -> None:
    # A background refresh has no caller waiting on its Future — nothing ever
    # calls .result() on it, so an exception there would otherwise vanish.
    # The stale value must still be served, but the failure must be visible.
    shared_cache.get_or_compute("k5", lambda: {"n": 1}, ttl_seconds=60, stale_seconds=300)
    computed_at, data = shared_cache._LOCAL_CACHE["k5"]
    shared_cache._LOCAL_CACHE["k5"] = (computed_at - 61, data)

    def failing_compute():
        raise RuntimeError("boom")

    import logging

    with caplog.at_level(logging.WARNING, logger="app.services.shared_cache"):
        out = shared_cache.get_or_compute("k5", failing_compute, ttl_seconds=60, stale_seconds=300)
        assert out == data  # stale value, returned immediately, never raises

        shared_cache._REFRESH_POOL.shutdown(wait=True)
        shared_cache._REFRESH_POOL = shared_cache.ThreadPoolExecutor(
            max_workers=4, thread_name_prefix="shared-cache-refresh"
        )

    assert "shared_cache.background_refresh_failed" in caplog.text
    assert "key=k5" in caplog.text
    # The stale entry is untouched — a failed refresh must not corrupt it.
    assert shared_cache._LOCAL_CACHE["k5"] == (computed_at - 61, data)


def test_redis_reachable_but_erroring_falls_back_to_direct_compute(monkeypatch) -> None:
    # The realistic failure: Redis.from_url succeeds (a connection object
    # exists) but the operation itself raises (connection refused, timeout).
    # _read/_write catch around exactly this, not around _redis() itself —
    # _redis() is specifically built to never raise to its callers.
    class _BrokenConn:
        def get(self, *_a, **_k):
            raise ConnectionError("down")

        def set(self, *_a, **_k):
            raise ConnectionError("down")

    monkeypatch.setattr(shared_cache, "_redis", lambda: _BrokenConn())
    calls = []

    def compute():
        calls.append(1)
        return "ok"

    out = shared_cache.get_or_compute("k4", compute, ttl_seconds=60)
    assert out == "ok"
    assert len(calls) == 1


def test_shared_ttl_mapping_preserves_legacy_value_shapes() -> None:
    mapping = shared_cache.SharedTTLMapping("test.mapping", ttl_seconds=60)

    mapping["timed"] = (time.monotonic(), {"n": 1})
    mapping["plain"] = 7

    assert mapping.get("timed")[1] == {"n": 1}
    assert "plain" in mapping
    assert mapping["plain"] == 7
    mapping.pop("plain")
    assert "plain" not in mapping


def test_shared_ttl_mapping_get_or_compute_uses_namespaced_singleflight() -> None:
    mapping = shared_cache.SharedTTLMapping("test.mapping", ttl_seconds=60)
    calls: list[int] = []

    assert mapping.get_or_compute("one", lambda: calls.append(1) or {"n": 1}) == {"n": 1}
    assert mapping.get_or_compute("one", lambda: calls.append(2) or {"n": 2}) == {"n": 1}
    assert calls == [1]


def test_shared_ttl_mapping_key_is_stable_for_unordered_sets() -> None:
    mapping = shared_cache.SharedTTLMapping("test.mapping", ttl_seconds=60)

    assert mapping._key((frozenset({"b", "a"}),)) == mapping._key(
        (frozenset({"a", "b"}),)
    )


def test_invalidate_prefix_clears_local_entries() -> None:
    shared_cache._LOCAL_CACHE.update(
        {
            "jobs.analytics:a": (1.0, {"a": 1}),
            "jobs.analytics:b": (1.0, {"b": 2}),
            "jobs.feed:c": (1.0, {"c": 3}),
        }
    )

    shared_cache.invalidate_prefix("jobs.analytics:")

    assert "jobs.feed:c" in shared_cache._LOCAL_CACHE
    assert not any(key.startswith("jobs.analytics:") for key in shared_cache._LOCAL_CACHE)


# ── a completed fill must not orphan its single-flight lease ───────────────
# The original order-dependent feed failure came from a debounce claim living
# for 20 seconds after a millisecond-scale fill. The lease now ends when the
# result is published, and ownership prevents a late filler from deleting a
# successor's lock after TTL expiry.

def test_completed_fill_releases_its_lease_before_invalidation() -> None:
    from app.services.background import debounce

    shared_cache.get_or_compute("k9", lambda: {"n": 1}, ttl_seconds=60)
    assert "k9" in shared_cache._LOCAL_CACHE
    assert "shared_cache_fill:k9" not in debounce._LOCAL_LEASES

    shared_cache.invalidate("k9")
    assert "k9" not in shared_cache._LOCAL_CACHE


def test_old_lease_owner_cannot_release_its_successor() -> None:
    from app.services.background import debounce

    old_token = debounce.acquire_lease("replaceable", ttl_seconds=60)
    assert old_token is not None
    # Model TTL expiry plus a successor acquisition without sleeping.
    debounce._LOCAL_LEASES["replaceable"] = (time.monotonic() + 60, "new-owner")

    debounce.release_lease("replaceable", old_token)
    assert debounce._LOCAL_LEASES["replaceable"][1] == "new-owner"


def test_a_cleared_cache_refills_in_one_compute_not_one_per_caller() -> None:
    """The behaviour the feed test was really asserting: after an invalidation
    the next read recomputes ONCE, rather than every caller stalling and then
    computing its own."""
    calls: list[int] = []

    def compute():
        calls.append(1)
        return {"n": len(calls)}

    shared_cache.get_or_compute("k10", compute, ttl_seconds=60)
    shared_cache.invalidate("k10")

    shared_cache.get_or_compute("k10", compute, ttl_seconds=60)
    shared_cache.get_or_compute("k10", compute, ttl_seconds=60)
    assert len(calls) == 2, "refill after invalidate must be single-flight, not per-caller"
