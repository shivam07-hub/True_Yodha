"""finlatics_match — which three Finlatics programmes this user's rooms argue for.

Design: `UNIFIED_PREP_V2.md` (repo root) — the rail's bottom block.

    Step 2 is where your rooms stall. These three cover the levels your live
    rooms keep asking for.

Before 2b the rail listed all eleven programmes, in catalogue order, identical
for every user — a banner. 2b shows THREE, and each one carries a `why` naming
the level it covers and the rooms that asked for it. The `why` is the product;
without it this is an ad.

**The catalogue itself stays in the frontend** (`lib/finlatics-programs.ts`):
it owns the titles, blurbs and the `utm_src`/`src` split in the outbound URL,
and the public landing renders it with no network call. This module owns only
the MATCH, and answers in `program_id`s that file already knows. One catalogue,
one URL builder, no duplication.

Matching is word-boundary, never substring. The taxonomy is Lightcast-shaped
and dense with lookalikes — a bare "portfolio" matches *Art Portfolio*, a bare
"securities" matches *Securities Fraud*. A `why` line that names the wrong
skill is worse than no `why` at all, so the terms below are deliberately narrow
and a programme that matches nothing simply carries no claim.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

#: program_id → the taxonomy terms that programme genuinely teaches.
#: ids match `FINLATICS_PROGRAMS` in `frontend/lib/finlatics-programs.ts`.
#: Verified against `skills.taxonomy_key` on 2026-09-06 with a `\m…\M` match.
PROGRAM_TERMS: dict[str, tuple[str, ...]] = {
    "fa": ("financial analysis", "valuation", "portfolio management", "private equity"),
    "ibep": ("investment banking", "venture capital", "mergers and acquisitions"),
    "actualBads": ("business analysis", "data analysis", "statistics"),
    "webdev": ("full stack", "web development", "react", "node.js"),
    "pm": (
        "product management",
        "product strategy",
        "product roadmap",
        "key performance indicators",
    ),
    "dmep": ("derivatives", "currency futures", "futures exchange"),
    "fm": ("asset allocation", "portfolio analysis", "portfolio management"),
    "da": ("microsoft excel", "power bi", "sales forecasting", "pricing"),
    "bads": ("data science", "python", "data analysis"),
    "mrp": ("market research", "marketing strategy"),
    "ml": ("machine learning", "deep learning", "supervised learning"),
}

#: Catalogue order — the tiebreak when two programmes cover the same ground.
PROGRAM_ORDER = tuple(PROGRAM_TERMS)

RAIL_SIZE = 3

#: At or above this many rooms the line counts rooms; below it, it names them.
#: Naming two companies is concrete; naming seven is a list nobody reads.
_NAME_ROOMS_BELOW = 3


@dataclass(frozen=True)
class SkillGap:
    """One levelled ask a live room makes that the user has not met."""

    taxonomy_key: str
    required_level: int
    company: str | None
    has_drill: bool


@dataclass(frozen=True)
class ProgramMatch:
    program_id: str
    why: str | None
    matched: bool


def _pattern(term: str) -> re.Pattern[str]:
    return re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE)


_COMPILED = {
    program: tuple(_pattern(term) for term in terms)
    for program, terms in PROGRAM_TERMS.items()
}


def covers(program_id: str, taxonomy_key: str) -> bool:
    """Does this programme teach this skill? Word-boundary, never substring."""
    return any(p.search(taxonomy_key) for p in _COMPILED.get(program_id, ()))


def _display(taxonomy_key: str) -> str:
    """`Key Performance Indicators (KPIs)` → `Key Performance Indicators`.

    The taxonomy carries disambiguating parentheticals the reader never needs;
    the rail row is 11px and one line.
    """
    return re.sub(r"\s*\([^)]*\)\s*$", "", taxonomy_key).strip()


def _companies(gaps: list[SkillGap]) -> list[str]:
    seen: list[str] = []
    for gap in gaps:
        name = (gap.company or "").strip()
        if name and name not in seen:
            seen.append(name)
    return seen


def why_line(gaps: list[SkillGap]) -> str | None:
    """The one claim a card is allowed to make, built from the rooms themselves.

    Three shapes, all of them checkable against the user's own board:

        no drill  Covers reporting · the one level with no drill yet
        many      Covers KPI governance · the L3 ask in 7 of your rooms
        few       Covers Analysis L2 · asked by 3M and OpenAI
    """
    if not gaps:
        return None
    key = gaps[0].taxonomy_key
    same = [gap for gap in gaps if gap.taxonomy_key == key]
    skill = _display(key)
    level = max(gap.required_level for gap in same)

    if not same[0].has_drill:
        return f"Covers {skill} · the one level with no drill yet"

    rooms = len(same)
    if rooms >= _NAME_ROOMS_BELOW:
        return f"Covers {skill} · the L{level} ask in {rooms} of your rooms"

    names = _companies(same)
    if len(names) >= 2:
        return f"Covers {skill} L{level} · asked by {names[0]} and {names[1]}"
    if names:
        return f"Covers {skill} L{level} · asked by {names[0]}"
    return f"Covers {skill} · the L{level} ask in {rooms} of your rooms"


def _rank(gaps: list[SkillGap]) -> tuple[int, int, int]:
    """Sort key for one programme's matched gaps. Higher sorts first.

    Rooms first (the ask the board repeats), then a level with no drill at all
    — /practice cannot serve that one, so a programme is the ONLY answer we
    have — then the depth of the ask.
    """
    if not gaps:
        return (0, 0, 0)
    rooms = len(gaps)
    no_drill = 0 if all(gap.has_drill for gap in gaps) else 1
    return (rooms, no_drill, max(gap.required_level for gap in gaps))


def select(gaps: list[SkillGap], *, size: int = RAIL_SIZE) -> list[ProgramMatch]:
    """The three cards, strongest claim first.

    Programmes that answer nothing on this board still fill the rail — the
    block is the partner's shelf, not a recommendation engine — but they carry
    NO `why`, so an unmatched card never implies a match it cannot show.
    """
    by_program: dict[str, list[SkillGap]] = {}
    for gap in gaps:
        for program_id in PROGRAM_ORDER:
            if covers(program_id, gap.taxonomy_key):
                by_program.setdefault(program_id, []).append(gap)

    for program_gaps in by_program.values():
        program_gaps.sort(
            key=lambda g: (
                sum(1 for other in program_gaps if other.taxonomy_key == g.taxonomy_key),
                0 if g.has_drill else 1,
                g.required_level,
            ),
            reverse=True,
        )

    ranked = sorted(
        by_program.items(),
        key=lambda item: (_rank(item[1]), -PROGRAM_ORDER.index(item[0])),
        reverse=True,
    )

    out = [
        ProgramMatch(program_id=pid, why=why_line(pgaps), matched=True)
        for pid, pgaps in ranked[:size]
    ]
    for program_id in PROGRAM_ORDER:
        if len(out) >= size:
            break
        if program_id not in {match.program_id for match in out}:
            out.append(ProgramMatch(program_id=program_id, why=None, matched=False))
    return out


def rail_note(*, has_gaps: bool, bottleneck_step: int) -> str:
    """The line above the three cards.

    Only claims step 2 is the bottleneck when it actually is — the design's
    copy assumes it, and on a board stalled at evidence that sentence would be
    a decoration pointing the reader at the wrong step.
    """
    if not has_gaps:
        return "Nothing in your live rooms is short a level right now."
    prefix = "Step 2 is where your rooms stall. " if bottleneck_step == 2 else ""
    return f"{prefix}These three cover the levels your live rooms keep asking for."
