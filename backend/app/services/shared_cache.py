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
  nothing cached   -> compute happens inline (there's nothing else to serve),
                      but still single-flight-guarded, so a cold-start burst
                      of first callers does not all pay full compute cost —
                      only the winner does; the rest fall through to computing
                      too (never block waiting on another process), but that
                      redundancy is a one-time cost at population, not a
                      steady-state one.

Redis errors fail open: compute() runs directly, uncached. A read path that
degrades to "as slow as before this module existed" beats one that raises
because its cache broke.

Values must be JSON-serializable — this stores {"computed_at": ..., "data":
...} as one Redis string, not a bespoke binary format, so any tier can inspect
a key by hand during an incident.
"""

from __future__ import annotations

import json
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
    # Someone else is already filling this key. Computing again here is
    # redundant but correct — a read path never blocks waiting on another
    # process, and this only happens during the first population of a key.
    return compute()
