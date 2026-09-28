"""The Collection Record — one entry per job, one stage, resolved once.

CONTEXT.md → Collection Record.
"""

from .resolve import (
    LIVENESS_DOWN,
    PENDING_INTENT_AFTER,
    PENDING_INTENT_FOR,
    STAGE_ORDER,
    resolve_collection,
)

__all__ = [
    "LIVENESS_DOWN",
    "PENDING_INTENT_AFTER",
    "PENDING_INTENT_FOR",
    "STAGE_ORDER",
    "resolve_collection",
]
