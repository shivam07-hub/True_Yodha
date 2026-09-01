"""Section order for a Company CV Thread projection.

Identity (name/contact) is pinned. Every other block can move. The living
master's outline does not change — this list lives on the job's CV Version,
same grain as hidden_items.
"""
from __future__ import annotations

from typing import Iterable

SECTION_KEYS: tuple[str, ...] = (
    "summary",
    "experience",
    "projects",
    "skills_line",
    "education",
    "certs",
)


def normalize_section_order(order: Iterable[str] | None) -> list[str]:
    """Known keys, first-seen order, then any missing defaults. Unknown dropped."""
    seen: list[str] = []
    for key in order or []:
        if key in SECTION_KEYS and key not in seen:
            seen.append(key)
    for key in SECTION_KEYS:
        if key not in seen:
            seen.append(key)
    return seen
