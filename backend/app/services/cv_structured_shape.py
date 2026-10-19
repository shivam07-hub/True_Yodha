"""The shape of `cv_versions.cv_structured` — one definition, no dependencies.

A CV row is read by parsers, routers, repositories and offline scripts. Each of
them used to carry its own idea of what the payload looks like, and the gap
between those ideas is where users lose their CV: a row holding `{"contact": …}`
and nothing else is truthy enough to pass every "do we have one?" check and short
of what every reader needs. Six users' CV page and download 500'd on every load
for a week because of that single-key row, with their parseable `body_text`
sitting untouched in the same column.

Two rules, and they are the whole module:

  `normalize_structured` — on the way OUT of storage. Any dict becomes the full
  contract; missing sections become empty, never absent. A reader can therefore
  never fail on the shape of what a past writer left behind.

  `has_content`         — the question everyone actually means by "do we have a
  CV?". Identity alone is not a CV, and normalizing makes every payload truthy,
  so truthiness stopped being able to answer it.

Deliberately dependency-free (stdlib only) so the repository layer can import it
without pulling the parser, the LLM chain or the taxonomy in behind it.
"""

from __future__ import annotations

import re
from typing import Any

CONTRACT_KEYS = frozenset(
    {"contact", "summary", "education", "experience", "projects", "skills_line", "certs"}
)

BLANK_CONTACT: dict[str, str] = {
    "name": "", "title": "", "email": "", "phone": "", "location": "", "linkedin": "",
}

# `contact` is excluded: a payload with only an identity block is what a failed or
# half-finished write looks like.
_CONTENT_SECTIONS = ("summary", "education", "experience", "projects", "skills_line", "certs")

_MAX_BULLET_CHARS = 300

# A list marker the parser copied from the CV with the line. The renderer draws
# its own bullet, so a copied one printed twice ("• ▪ Built…"); measured
# 2026-10-19 on 387 baseline bullets across ~25 people (•, ▪, ▸, –, §, -, ◦, ■
# and Word's Wingdings bullet U+F0B7). A dash or an asterisk counts only when a
# space follows it, so "–20% churn" and "*Nights* on call" keep their first
# character.
_LIST_MARKER = re.compile(
    "^(?:"
    "[\u2022\u2023\u2043\u00b7\u00a7\u25aa\u25ab\u25b8\u25b9\u25ba\u25b6"
    "\u25e6\u25cf\u25cb\u25a0\u25a1\u25c6\u25c7\u2756\u27a2\u27a4\u2713\u2714"
    "\uf0a7\uf0b7\uf076\uf0d8\uf0fc]"
    "|[-\u2013\u2014*](?=\\s)"
    ")\\s*"
)


def _without_marker(line: str) -> str:
    """The line with every leading copied list marker removed."""
    previous = None
    while previous != line:
        previous = line
        line = _LIST_MARKER.sub("", line, count=1).lstrip()
    return line


def has_content(structured: Any) -> bool:
    """True when a payload carries an actual CV, not just an identity header.

    This is the gate `if structured:` should always have been. Use it anywhere the
    question is "can this user's CV be rendered / edited / tailored?" — after
    normalization every payload is a full 7-key dict, so truthiness answers yes
    for a row that has nothing in it.
    """
    if not isinstance(structured, dict):
        return False
    return any(structured.get(k) for k in _CONTENT_SECTIONS)


def normalize_structured(raw: Any) -> dict | None:
    """Coerce any stored payload into the full contract, WITHOUT touching content.

    Structural only: fill missing sections, coerce a field to the type its
    contract declares, keep every character the user wrote. Reading a CV must
    never edit it — the ingest hygiene in `coerce_sections(ingest=True)` trims and
    caps bullets, and applying that on read would silently shorten a bullet the
    user typed themselves in the CV editor (which enforces no such cap).

    Returns None only for input that is not a dict at all (NULL column, junk).
    `contact` is preserved as stored — identity is parsed locally from the CV
    header, never asked of a model.
    """
    if not isinstance(raw, dict):
        return None
    out = coerce_sections(raw)
    stored = raw.get("contact")
    out["contact"] = {
        **BLANK_CONTACT,
        **({k: v for k, v in stored.items() if k in BLANK_CONTACT and isinstance(v, str)}
           if isinstance(stored, dict) else {}),
    }
    return out


def is_blank(value: object) -> bool:
    """A blank string is no content. Renderers and ingest share this."""
    return not str(value or "").strip()


def coerce_sections(raw: dict, *, ingest: bool = False) -> dict:
    """The six content sections, coerced to their contract types.

    `ingest=True` additionally applies the hygiene an LLM response needs — strip
    whitespace, drop a copied list marker from bullets and certs, cap a bullet at
    `_MAX_BULLET_CHARS`. That is a rule about what may
    ENTER the system, so it stays off by default: the same function reads rows
    back out, and a read may not rewrite what it read.

    Contact is excluded because its trust rules differ by caller: preserved when
    read back from storage, blanked when it came from a model that was never shown
    the header.
    """

    def _dicts(v: Any) -> list[dict]:
        return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []

    def _strs(v: Any) -> list[str]:
        if not isinstance(v, list):
            return []
        out = [str(x) for x in v if isinstance(x, (str, int, float))]
        return [s.strip() for s in out if s.strip()] if ingest else out

    def _items(v: Any) -> list[str]:
        """List entries — bullets, certs. On ingest, the copied list marker goes."""
        if not ingest:
            return _strs(v)
        return [line for line in (_without_marker(s) for s in _strs(v)) if line]

    def _bullets(v: Any) -> list[str]:
        return [b[:_MAX_BULLET_CHARS] for b in _items(v)] if ingest else _items(v)

    def _text(v: Any) -> str:
        if v is None:
            return ""
        return str(v).strip() if ingest else str(v)

    def _optional_text(v: Any) -> str | None:
        if not isinstance(v, str) or not v.strip():
            return None
        return v.strip() if ingest else v

    education = [
        {
            "institution": _text(row.get("institution")),
            "degree":      _text(row.get("degree")),
            "dates":       _text(row.get("dates")),
            "grade":       _text(row.get("grade")),
            "location":    _text(row.get("location")),
        }
        for row in _dicts(raw.get("education"))
    ]

    experience = [
        {
            "company":  _text(row.get("company")),
            "role":     _text(row.get("role")),
            "dates":    _text(row.get("dates")),
            "location": _text(row.get("location")),
            "bullets":  _bullets(row.get("bullets")),
        }
        for row in _dicts(raw.get("experience"))
    ]

    projects = [
        {
            "name":    _text(row.get("name")),
            "dates":   _text(row.get("dates")),
            "bullets": _bullets(row.get("bullets")),
        }
        for row in _dicts(raw.get("projects"))
    ]

    return {
        "summary":     _optional_text(raw.get("summary")),
        "education":   education,
        "experience":  experience,
        "projects":    projects,
        "skills_line": _optional_text(raw.get("skills_line")),
        "certs":       _items(raw.get("certs")),
    }
