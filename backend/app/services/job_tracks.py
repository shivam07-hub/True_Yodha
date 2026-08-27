"""Job Tracks — one user, more than one job search, each with its own words.

"15-20 consulting and 15-20 marketing." Two intents, two CVs, two sets of
applications. `target_role_titles` flattens them into one ranked list and
nothing groups the result.

**Track 1 is the profile.** It has no row, no id, and no migration: its role
words are `user_profiles.target_role_titles` and its matches carry
`track_id IS NULL`. 88 of 106 users with a target set exactly one role title,
and of the 18 who set more, almost all are one intent said three ways
("Software Engineer / Full Stack Engineer / Frontend Engineer"). A second track
is a minority shape and must stay invisible to everyone who does not ask for it.

**A track is the user's own words, never a taxonomy key.** `role_family` cannot
carry this: 40 hand-verified matches for one candidate spread across 31 distinct
families, only 11 of them in the eight a human would call "consulting" or
"marketing" — a product-marketing role at a crypto exchange is filed
`Cryptocurrency`. What actually separates the tracks is reading titles and job
descriptions, which is what the triage brain already does.

**Tracks are earned, not offered.** A second search opens only once the first
has been run through to a tailored CV. Until someone has felt the loop close,
"open another search" is a setting; after, it is the obvious next move.
"""
from __future__ import annotations

from typing import Any

from app.repositories.job_tracks import JobTracksRepository

__all__ = [
    "MAX_TRACKS",
    "MAX_TRACK_ROLE_TITLES",
    "PROFILE_TRACK_POSITION",
    "Track",
    "can_open_another",
    "next_position",
    "normalise_role_titles",
    "tracks_for",
]

#: Including the profile. Three is the shape the CEO named from the MBA case —
#: marketing, consulting, product — and a fourth parallel search is a signal
#: someone has stopped choosing rather than a need the product should serve.
MAX_TRACKS = 3

#: Same cap as `SLOT_ARITY["target_role_titles"]`, because it is the same axis
#: said about a different search.
MAX_TRACK_ROLE_TITLES = 6

#: Track 1. Not a row — see the module docstring.
PROFILE_TRACK_POSITION = 1


class Track:
    """One search, whether it is the profile or a stored row.

    Callers must not care which: a surface that special-cases "the profile one"
    is a second implementation of track 1, and it will drift from this one.
    """

    __slots__ = ("id", "label", "role_titles", "position")

    def __init__(
        self, *, id: int | None, label: str, role_titles: list[str], position: int
    ) -> None:
        self.id = id
        self.label = label
        self.role_titles = role_titles
        self.position = position

    @property
    def is_profile(self) -> bool:
        """True for track 1, whose words live on `user_profiles`."""
        return self.id is None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "role_titles": list(self.role_titles),
            "position": self.position,
            "is_profile": self.is_profile,
        }


def normalise_role_titles(values: Any) -> list[str]:
    """Trimmed, de-duplicated case-insensitively, capped. Order is the user's."""
    if not isinstance(values, list):
        return []
    seen: list[str] = []
    lowered: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not text or text.casefold() in lowered:
            continue
        lowered.add(text.casefold())
        seen.append(text)
        if len(seen) >= MAX_TRACK_ROLE_TITLES:
            break
    return seen


def _profile_track(profile: dict[str, Any] | None) -> Track:
    """Track 1, built from the profile every user already has.

    Its label is the user's first role word rather than a fixed string: on a
    two-track screen "Consulting" beside "Marketing" reads as two searches,
    where "Your search" beside "Marketing" reads as one search and one
    exception. Falls back only when there is nothing to name it with.
    """
    p = profile or {}
    titles = normalise_role_titles(p.get("target_role_titles"))
    if not titles:
        single = str(p.get("target_role_title") or "").strip()
        titles = [single] if single else normalise_role_titles(p.get("target_roles"))
    return Track(
        id=None,
        label=titles[0] if titles else "Your search",
        role_titles=titles,
        position=PROFILE_TRACK_POSITION,
    )


def tracks_for(
    repo: JobTracksRepository, user_id: str, profile: dict[str, Any] | None
) -> list[Track]:
    """Every search this user has, track 1 first.

    One list, one shape. A caller that wants "the marketing one" filters this;
    it never reads the profile and the table separately and stitches them.
    """
    stored = [
        Track(
            id=int(row["id"]),
            label=str(row.get("label") or "").strip(),
            role_titles=normalise_role_titles(row.get("role_titles")),
            position=int(row.get("position") or PROFILE_TRACK_POSITION + 1),
        )
        for row in repo.list_for_user(user_id)
    ]
    return [_profile_track(profile), *sorted(stored, key=lambda t: t.position)]


def next_position(existing: list[Track]) -> int:
    """The lowest free position, so a closed track's slot is reusable.

    Returning `len + 1` would leak: close track 2 of 3 and the next open would
    ask for position 4, which the check constraint takes but the render order
    then shows as a gap the user never made.
    """
    taken = {track.position for track in existing}
    position = PROFILE_TRACK_POSITION + 1
    while position in taken:
        position += 1
    return position


def can_open_another(
    existing: list[Track], onboarding_state: dict[str, Any] | None
) -> tuple[bool, str | None]:
    """May this user open another search? `(allowed, why_not)`.

    The gate is `tailored_cv_created_at`: they have run a match, saved a
    credible job, and tailored a CV against it — the whole first-track loop.
    That milestone already exists; a track does not need one of its own.

    The reason string is for the caller to render. It is never "locked" — a
    lock explains nothing, and the honest answer is a next step the user can
    actually take.
    """
    if len(existing) >= MAX_TRACKS:
        return False, f"You can run {MAX_TRACKS} searches at once."
    if not (onboarding_state or {}).get("tailored_cv_created_at"):
        return False, "Tailor a CV for a job in this search first."
    return True, None
