"""What this person is aiming at — one answer, for every surface and the run.

There were five answers. The frontend reconstructed the target from raw columns
in nine places and no two chains agreed: Settings and the role chips fell back
to `target_roles`, Practice stopped at `target_role_title`, `/market` and
`/intel` read `target_roles` alone, the CV page and the setup nudge answered
"does this person need a target?" from `target_roles` being non-empty, and
Career Path answered it from the snapshot. The Career Ops run read the raw
column in seven more places — `jobs_workflow` three times (once naming it
`title_roles`), `candidate_pool`, `feed_warm`, `published_list`, `ranking`,
`agent_picks` — and derived the aspiration skills from it, so a blank scope
meant a run that had no idea what the person wanted and said nothing about it.

The fix is not a new store. It is a single **interface** over the two columns
that already exist, so no caller reconstructs meaning from a column again.

**Titles and families are one vocabulary, not two.** Since `e2676160` the role
picker writes the corpus family's name into BOTH `target_roles` and
`target_role_titles` — the family's own name IS the visible title, because the
modal job title named twenty families "Custom Software Engineer" (CONTEXT.md
§1023). Rows written before that, or through `save_target` with an explicit
family, may legitimately carry different strings in each. That divergence is
allowed and is NOT what this module exists to catch; 51 users are in it today
and all of their scope keys name real corpus families.

What it exists to catch is a direction that **cannot run**: titles with an
empty scope. The matcher scopes on families, so an empty scope returns nothing
and the surfaces then tell the user the market has nothing for them — the
failure this codebase has already shipped once, to 162 people. 29 users are in
that state now, left by the 2026-09-15 phantom repair, which emptied the scope
correctly and could not restore the family it did not own.

`scope_mode` is the whole point: a caller asks what kind of search it can
honestly run, and the answer is never silence.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

#: What a search can honestly promise.
#:
#: - ``targeted``    — a corpus scope; role-targeted matching runs
#: - ``skills_only`` — the person named the work but the scope is blank, so the
#:   run matches on skills alone. It must SAY so (Shivam, 2026-09-27): the run
#:   used to fall back to skill overlap in silence, which is how a broken
#:   direction stayed invisible for months.
#: - ``none``        — nothing to run; ask for a target
ScopeMode = Literal["targeted", "skills_only", "none"]


def _clean(value: Any) -> tuple[str, ...]:
    if not isinstance(value, (list, tuple)):
        return ()
    seen: list[str] = []
    for item in value:
        # `str(None)` is "None" — a null in the array would otherwise reach the
        # matcher as a literal scope key and silently match nothing.
        if item is None:
            continue
        text = str(item).strip()
        if text and text not in seen:
            seen.append(text)
    return tuple(seen)


@dataclass(frozen=True)
class Direction:
    """One person's direction. Built only by `of()`; never assembled by a caller."""

    #: What a human is shown.
    titles: tuple[str, ...]
    #: What the matcher scopes on. Corpus families.
    families: tuple[str, ...]

    @property
    def primary_title(self) -> str | None:
        return self.titles[0] if self.titles else None

    @property
    def is_set(self) -> bool:
        """The ONE answer to "does this person need a target?".

        Titles alone count. Someone who named the work has a direction even
        while its scope is blank — telling them to pick a target they can see
        on another screen is how a product reads as broken.
        """
        return bool(self.titles or self.families)

    @property
    def is_runnable(self) -> bool:
        """True when a role-targeted search will actually scope on something."""
        return bool(self.families)

    @property
    def scope_mode(self) -> ScopeMode:
        if self.families:
            return "targeted"
        return "skills_only" if self.titles else "none"

    def to_dict(self) -> dict[str, Any]:
        """The shape `/users/me` carries, so no surface rebuilds it."""
        return {
            "titles": list(self.titles),
            "families": list(self.families),
            "primary_title": self.primary_title,
            "is_set": self.is_set,
            "is_runnable": self.is_runnable,
            "scope_mode": self.scope_mode,
        }


def of(profile: dict[str, Any] | None) -> Direction:
    """A profile row → its direction. Pure: no database, no memory, no network.

    Purity is what lets `/users/me` carry this for free. That door is read by the
    shell on every authed page and was measured at 2,853ms; it already holds the
    profile, so the one answer costs nothing to add and a second endpoint would
    have cost a round trip on nine surfaces.

    `target_role_title` (the legacy singular) is read only when the list is
    empty — it is the same fact, written before the column was plural.
    """
    profile = profile or {}
    titles = _clean(profile.get("target_role_titles"))
    if not titles:
        single = str(profile.get("target_role_title") or "").strip()
        titles = (single,) if single else ()
    return Direction(titles=titles, families=_clean(profile.get("target_roles")))
