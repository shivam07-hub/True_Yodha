"""Section order and section headings for a CV.

Identity (name/contact) is pinned. Every other block can move. The living
master's outline does not change — the order lives on the job's CV Version,
same grain as hidden_items.

Headings are the person's own, on their profile (`cv_section_titles`): renamed
once, the same on every CV they render. An absent key is the default heading.
`frontend/lib/cv/section-titles.ts` mirrors the defaults and the rules.
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


DEFAULT_SECTION_TITLES: dict[str, str] = {
    "summary": "Summary",
    "experience": "Experience",
    "projects": "Projects",
    "skills_line": "Skills",
    "education": "Education",
    "certs": "Certifications",
}

#: Long enough for "Projects and Agentic Pursuits", short enough to stay one line
#: on the sheet at 375px.
MAX_SECTION_TITLE = 40


def normalize_section_titles(titles: dict[str, object] | None) -> dict[str, str]:
    """Known keys only, whitespace collapsed, capped. A title that is empty or
    the default is dropped — renaming back IS resetting, and a stored default
    would outlive a later change to it."""
    out: dict[str, str] = {}
    for key, raw in (titles or {}).items():
        if key not in DEFAULT_SECTION_TITLES:
            continue
        text = " ".join(str(raw or "").split())[:MAX_SECTION_TITLE].strip()
        if text and text.casefold() != DEFAULT_SECTION_TITLES[key].casefold():
            out[key] = text
    return out


def section_title(key: str, titles: dict[str, str] | None) -> str:
    """The heading this person sees for `key`."""
    return (titles or {}).get(key) or DEFAULT_SECTION_TITLES[key]
