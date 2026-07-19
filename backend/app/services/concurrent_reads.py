"""Small shared primitive for latency-bounded independent repository reads."""

from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor
from typing import Any


def run_concurrently(sections: Mapping[str, Callable[[], Any]]) -> dict[str, Any]:
    """Return named read results with wall time bounded by the slowest read.

    Exceptions intentionally propagate from ``Future.result`` so bundled BFF
    endpoints keep the same failure semantics as their canonical handlers.
    """
    if not sections:
        return {}
    with ThreadPoolExecutor(max_workers=len(sections)) as pool:
        futures = {key: pool.submit(read) for key, read in sections.items()}
        return {key: future.result() for key, future in futures.items()}
