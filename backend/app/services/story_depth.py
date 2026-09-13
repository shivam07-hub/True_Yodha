"""How completely a Career Story is told, and whether its bullet is whole.

The upload bridge (`a191350a`) mints a story from every line of an uploaded CV.
A CV bullet is a summary of a summary, so those stories arrive thin — and a thin
story that scores well on cosine used to be able to mark a JD requirement
`covered`, which removes it from the weave interview forever. The bridge would
then have silenced the one capture door measurably proven to work.

Both judgements here are deterministic. Nothing is inferred by a model, and
nothing new is stored: depth is already in the data because `parse_extraction`
drops empty narrative keys, so a CV bullet arrives as `{result}` and a told story
fills all four of situation / task / action / result.

"Whole" is the house standard the extractor already writes to — the Google XYZ
formula in `story_extractor._STATIC_STYLE` ("Accomplished X, measured by Y, by
doing Z") and its POINTER rule: 18-30 words, strong past-tense verb, the best
metric woven in. ADR-0016 forbids inventing the number a bullet is missing, so
an incomplete bullet is always a question for the user, never a rewrite.

Depth is DERIVED, never tagged by source: a rushed gap answer is thin too, and a
CV that happens to carry a full STAR paragraph is not.
"""
from __future__ import annotations

import re
from typing import Any

STAR_FIELDS = ("situation", "task", "action", "result")

# Three of the four STAR fields is a story someone actually told. Two is a
# fleshed-out bullet. The line sits at 3 because `result` plus one other is what
# a well-written CV bullet already implies, and that must not read as "told".
TOLD_MIN_FIELDS = 3

# story_extractor's POINTER rule. A bullet outside the band is either a fragment
# or a paragraph; neither is a CV line.
POINTER_MIN_WORDS = 18
POINTER_MAX_WORDS = 30

_HAS_DIGIT = re.compile(r"\d")


def filled_star_fields(story: dict[str, Any]) -> int:
    narrative = story.get("narrative") or {}
    if not isinstance(narrative, dict):
        return 0
    return sum(1 for f in STAR_FIELDS if str(narrative.get(f) or "").strip())


def depth_of(story: dict[str, Any]) -> str:
    """'told' | 'thin'. A told story may close a requirement; a thin one may
    only evidence it."""
    return "told" if filled_star_fields(story) >= TOLD_MIN_FIELDS else "thin"


def is_told(story: dict[str, Any]) -> bool:
    return depth_of(story) == "told"


def missing_from_pointer(text: str, metrics: list[dict[str, Any]] | None) -> list[str]:
    """What this bullet still needs to be whole, in the user's terms. Empty means
    it already reads like a strong CV line.

    The measure check accepts a number anywhere in the bullet OR a recorded
    metric on the story: the extractor weaves the metric into the pointer, but a
    user's own phrasing may carry it as words the story also holds structurally.
    """
    bullet = " ".join((text or "").split())
    gaps: list[str] = []
    if not bullet:
        return ["the bullet itself"]
    words = len(bullet.split())
    if not (_HAS_DIGIT.search(bullet) or metrics):
        gaps.append("a number — how big, how much, how many")
    if words < POINTER_MIN_WORDS:
        gaps.append("what you actually did to get there")
    elif words > POINTER_MAX_WORDS:
        gaps.append("tightening — it runs longer than a CV line")
    return gaps


def pointer_is_whole(text: str, metrics: list[dict[str, Any]] | None) -> bool:
    return not missing_from_pointer(text, metrics)
