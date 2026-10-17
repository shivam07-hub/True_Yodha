"""Two notes after the application is confirmed (ADR-0026 step 8, ADR-0018).

The pass after a person applies is two notes and then it stops. Both come from
the person's own connections export, never from a stranger:

  1. Someone they have actually written to. Myro cannot read a message history
     from the export, so it offers the connections at that company and the
     person marks the one. (The locked read: the export has names and titles,
     not "written to".)
  2. The connection whose seat is the motion the role hires for — matched
     deterministically against the reach function, even when that thread is cold.

The person sends both. Myro drafts and orders; it never sends, and it never
names anyone outside the export (ADR-0018).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping

_WORD = re.compile(r"[a-z0-9]+")
# Function words that carry no seat signal — matching on them would tie every
# connection, so they do not count toward a motion match.
_STOP = {
    "the", "and", "of", "for", "to", "in", "at", "a", "an",
    "senior", "sr", "junior", "jr", "lead", "head", "manager", "director",
    "vp", "chief", "officer", "executive", "associate", "principal", "staff",
}


@dataclass(frozen=True)
class NoteCandidate:
    full_name: str
    position: str


def _tokens(text: str) -> set[str]:
    return {w for w in _WORD.findall((text or "").casefold()) if w not in _STOP and len(w) > 1}


def _candidate(row: Mapping[str, Any]) -> NoteCandidate | None:
    name = str(row.get("full_name") or "").strip()
    if not name:
        return None
    return NoteCandidate(full_name=name, position=str(row.get("position") or "").strip())


def written_to_choices(connections: list[Mapping[str, Any]]) -> list[NoteCandidate]:
    """Every connection at the company, for the person to mark the one they wrote to."""
    out: list[NoteCandidate] = []
    for row in connections:
        candidate = _candidate(row)
        if candidate is not None:
            out.append(candidate)
    return out


def motion_match(
    connections: list[Mapping[str, Any]],
    *,
    function: str,
    target_titles: list[str],
) -> NoteCandidate | None:
    """The connection whose title best overlaps the role's motion, or None.

    Deterministic: the score is how many motion words appear in the position.
    Highest wins; a tie keeps the first in the export order. Zero overlap for
    everyone means no match — Myro does not force one.
    """
    motion = _tokens(function)
    for title in target_titles:
        motion |= _tokens(title)
    if not motion:
        return None
    best: NoteCandidate | None = None
    best_score = 0
    for row in connections:
        candidate = _candidate(row)
        if candidate is None:
            continue
        score = len(_tokens(candidate.position) & motion)
        if score > best_score:
            best_score = score
            best = candidate
    return best
