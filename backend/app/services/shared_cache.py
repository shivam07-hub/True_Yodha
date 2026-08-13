"""Shared, stale-while-revalidate cache for expensive read-path computations.

ARCHITECTURE_READ_PATH.md S3: the per-process module-level dicts this replaces
(``_indexable_companies_cache``, ``_pulse_cache``, ``/public/stats``'s own
cache, and others) each answer "is my copy fresh" alone. On TTL expiry every
concurrent request across every replica misses at the same instant and all of
them recompute — the exact stampede that turned a 1h cache into repeated
9-12s spikes. And a NEW replica starts with an empty dict, so horizontal scale
made the stampede worse, not better.

Redis-backed when Redis exists (all deployed tiers, ADR-0008): the value and
its age are visible to every replica, so "is this fresh" has one answer, not
one per process. Without Redis it degrades to a per-process dict — the correct
approximation for local dev (one process), matching the same fallback
``app.services.background.debounce`` already uses.

The contract: a read path here never blocks on a miss it doesn't have to, and
never returns nothing because a refresh is in flight.

  fresh in cache   -> return it immediately, no compute.
  stale in cache   -> return the STALE value immediately, and kick a
                      single-flight background refresh. ``debounce.claim``
                      (already Redis-backed, already used for the onboarding
                      self-heal window) guards it, so at most one refresh runs
                      per key across every replica — every other caller in
                      that window gets the stale value with zero extra cost.
  nothing cached   -> one caller computes inline. Peers wait for a short,
                      bounded fill window and reuse the winner's value. If the
                      winner stalls or fails they compute directly, preserving
                      the cache's fail-open availability contract without
                      turning a cold burst into N identical database scans.

Redis errors fail open: compute() runs directly, uncached. A read path that
degrades to "as slow as before this module existed" beats one that raises
because its cache broke.

Values must be JSON-serializable — this stores {"computed_at": ..., "data":
...} as one Redis string, not a bespoke binary format, so any tier can inspect
a key by hand during an incident.
"""

from __future__ import annotations

import json
import hashlib
import logging
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any, TypeVar

from app.config import settings
from app.services.background import debounce

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Background refreshes share one small bounded pool. NOT one thread per
# refresh — that unbounded-creation shape is the run_concurrently defect
# named in ARCHITECTURE_READ_PATH.md's S3 section; a handful of concurrent
# stale-key refreshes is the expected load, not one per request.
_REFRESH_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="shared-cache-refresh")

# Local (per-process) fallback when Redis is absent. Same correctness story as
# debounce.py's _LOCAL_CLAIMS: correct for local dev (one process), not a
# substitute for Redis on any deployed tier.
_LOCAL_CACHE: dict[str, tuple[float, Any]] = {}

_CLAIM_TTL_SECONDS = 20  # generous headroom over any read this module fronts
_COLD_FILL_WAIT_SECONDS = 1.5
_COLD_FILL_POLL_SECONDS = 0.02


class SharedTTLMapping:
    """Compatibility bridge for legacy module-level TTL dictionaries.

    Values live in the same Redis namespace as ``get_or_compute``. Callers keep
    their existing ``(monotonic_timestamp, value)`` contract while age is
    derived from the shared wall clock, so replicas agree on freshness.
    New or expensive reads should use ``get_or_compute`` directly for SWR and
    single-flight; this class exists to remove replica-local state safely.
    """

    def __init__(self, namespace: str, *, ttl_seconds: int) -> None:
        self.namespace = namespace
        self.ttl_seconds = ttl_seconds

    def _key(self, identity: Any) -> str:
        def canonical(value: Any) -> Any:
            if isinstance(value, dict):
                return {str(key): canonical(item) for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))}
            if isinstance(value, (set, frozenset)):
                return sorted((canonical(item) for item in value), key=lambda item: json.dumps(item, sort_keys=True, default=str))
            if isinstance(value, (list, tuple)):
                return [canonical(item) for item in value]
            return value

        encoded = json.dumps(
            canonical(identity), sort_keys=True, default=str, separators=(",", ":")
        ).encode()
        digest = hashlib.sha256(encoded).hexdigest()[:24]
        return f"{self.namespace}:{digest}"

    def get(self, identity: Any, default: Any = None) -> Any:
        entry = _read(self._key(identity))
        if entry is None:
            return default
        computed_at, data = entry
        age = time.time() - computed_at
        if age >= self.ttl_seconds:
            return default
        return (time.monotonic() - age, data)

    def get_or_compute(self, identity: Any, compute: Callable[[], T]) -> T:
        """Populate one legacy namespace through the shared single-flight path.

        This is intentionally data-only (unlike ``get()``, which preserves the
        historical ``(monotonic_timestamp, data)`` shape). New callers should
        not need to reason about cache age themselves.
        """
        return get_or_compute(
            self._key(identity),
            compute,
            ttl_seconds=self.ttl_seconds,
        )

    def __setitem__(self, identity: Any, value: Any) -> None:
        data = value[1] if isinstance(value, tuple) and len(value) == 2 else value
        _write(self._key(identity), data, ttl_seconds=self.ttl_seconds, stale_seconds=0)

    def __contains__(self, identity: Any) -> bool:
        return self._fresh_data(identity) is not None

    def __getitem__(self, identity: Any) -> Any:
        data = self._fresh_data(identity)
        if data is None:
            raise KeyError(identity)
        return data

    def _fresh_data(self, identity: Any) -> Any | None:
        entry = _read(self._key(identity))
        if entry is None:
            return None
        computed_at, data = entry
        return data if time.time() - computed_at < self.ttl_seconds else None

    def pop(self, identity: Any, default: Any = None) -> Any:
        key = self._key(identity)
        entry = _read(key)
        invalidate(key)
        return default if entry is None else entry[1]

    def clear(self) -> None:
        invalidate_prefix(f"{self.namespace}:")


def _redis() -> Any | None:
    url = settings.redis_url.strip()
    if not url:
        return None
    try:
        from redis import Redis

        return Redis.from_url(url, decode_responses=True)
    except Exception as exc:  # noqa: BLE001 — a cache must never break its caller
        logger.warning("metric shared_cache.redis_unavailable exc=%s", exc.__class__.__name__)
        return None


def _read(key: str) -> tuple[float, Any] | None:
    conn = _redis()
    if conn is None:
        return _LOCAL_CACHE.get(key)
    try:
        raw = conn.get(f"sc:{key}")
    except Exception as exc:  # noqa: BLE001
        logger.warning("metric shared_cache.read_failed key=%s exc=%s", key, exc.__class__.__name__)
        return None
    if raw is None:
        return None
    try:
        payload = json.loads(raw)
        return float(payload["computed_at"]), payload["data"]
    except Exception:
        logger.warning("metric shared_cache.corrupt_entry key=%s", key)
        return None


def _write(key: str, data: Any, *, ttl_seconds: int, stale_seconds: int) -> float:
    computed_at = time.time()
    conn = _redis()
    if conn is None:
        _LOCAL_CACHE[key] = (computed_at, data)
        return computed_at
    try:
        conn.set(
            f"sc:{key}",
            json.dumps({"computed_at": computed_at, "data": data}),
            ex=ttl_seconds + stale_seconds,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("metric shared_cache.write_failed key=%s exc=%s", key, exc.__class__.__name__)
        _LOCAL_CACHE[key] = (computed_at, data)  # at least serve this process
    return computed_at


def invalidate(key: str) -> None:
    """Remove one shared entry after its underlying truth is explicitly written."""
    _LOCAL_CACHE.pop(key, None)
    conn = _redis()
    if conn is None:
        return
    try:
        conn.delete(f"sc:{key}")
    except Exception as exc:  # noqa: BLE001 — invalidation must not break the writer
        logger.warning("metric shared_cache.invalidate_failed key=%s exc=%s", key, exc.__class__.__name__)


def invalidate_prefix(prefix: str) -> None:
    """Invalidate a bounded cache namespace after a corpus snapshot write."""
    for key in [candidate for candidate in _LOCAL_CACHE if candidate.startswith(prefix)]:
        _LOCAL_CACHE.pop(key, None)
    conn = _redis()
    if conn is None:
        return
    try:
        redis_keys = list(conn.scan_iter(match=f"sc:{prefix}*", count=100))
        if redis_keys:
            conn.delete(*redis_keys)
    except Exception as exc:  # noqa: BLE001 — invalidation must not break the writer
        logger.warning(
            "metric shared_cache.invalidate_prefix_failed prefix=%s exc=%s",
            prefix,
            exc.__class__.__name__,
        )


def _refresh_now(
    key: str, compute: Callable[[], T], *, ttl_seconds: int, stale_seconds: int
) -> T:
    data = compute()
    _write(key, data, ttl_seconds=ttl_seconds, stale_seconds=stale_seconds)
    return data


def _background_refresh(
    key: str, compute: Callable[[], T], *, ttl_seconds: int, stale_seconds: int
) -> None:
    """Wraps _refresh_now for the fire-and-forget pool submission ONLY. The
    synchronous (cold-miss) call path stays exception-transparent — its caller
    is already the one thing seeing this compute(), and must still get the
    error to decide its own fallback. A background refresh has no such
    caller: nothing ever calls .result() on the submitted future, so an
    unlogged exception here would vanish — the exact silent-degradation
    pattern this codebase's fail-soft paths are built to avoid. The stale
    value already being served is untouched either way; this only decides
    whether the failure is visible."""
    try:
        _refresh_now(key, compute, ttl_seconds=ttl_seconds, stale_seconds=stale_seconds)
    except Exception as exc:  # noqa: BLE001 — see docstring
        logger.warning(
            "metric shared_cache.background_refresh_failed key=%s exc=%s",
            key, exc.__class__.__name__,
        )


def get_or_compute(
    key: str,
    compute: Callable[[], T],
    *,
    ttl_seconds: int,
    stale_seconds: int = 0,
) -> T:
    """See module docstring for the fresh/stale/absent contract.

    ``key`` is the full cache identity — callers that vary by argument (e.g.
    a company set) must fold those into the key themselves, the same way a
    Redis key would be built by hand.
    """
    entry = _read(key)
    now = time.time()

    if entry is not None:
        computed_at, data = entry
        age = now - computed_at
        if age < ttl_seconds:
            return data
        if age < ttl_seconds + stale_seconds:
            if debounce.claim(f"shared_cache_refresh:{key}", ttl_seconds=_CLAIM_TTL_SECONDS):
                _REFRESH_POOL.submit(
                    _background_refresh, key, compute, ttl_seconds=ttl_seconds, stale_seconds=stale_seconds
                )
            return data
        # Older than ttl + stale_seconds: Redis should have expired this key
        # itself, but a local-dict fallback (no TTL enforcement) can still
        # hold a genuinely dead entry — fall through to a real compute.

    if debounce.claim(f"shared_cache_fill:{key}", ttl_seconds=_CLAIM_TTL_SECONDS):
        return _refresh_now(key, compute, ttl_seconds=ttl_seconds, stale_seconds=stale_seconds)
    # Someone else is filling this key. Poll only for a bounded interval: the
    # common path reuses the winner's result, while a dead/stalled winner cannot
    # hold this request indefinitely. This wait is deliberately shorter than
    # the PostgREST request timeout and the claim TTL.
    deadline = time.monotonic() + _COLD_FILL_WAIT_SECONDS
    while time.monotonic() < deadline:
        time.sleep(_COLD_FILL_POLL_SECONDS)
        filled = _read(key)
        if filled is not None:
            return filled[1]
    logger.warning("metric shared_cache.cold_fill_wait_expired key=%s", key)
    return compute()
