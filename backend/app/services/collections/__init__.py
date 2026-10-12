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
from .page import applications_on_page, entry_for_page, same_page

__all__ = [
    "LIVENESS_DOWN",
    "PENDING_INTENT_AFTER",
    "PENDING_INTENT_FOR",
    "STAGE_ORDER",
    "resolve_collection",
    "applications_on_page",
    "entry_for_page",
    "same_page",
]
