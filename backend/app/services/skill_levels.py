"""What a Myro level MEANS — the one definition, in front of two audiences.

This started as a private dict inside the question generator, where it was the
calibration brief: "write questions for someone at level 3". It is now also the
sentence on a user's CV, in front of an employer who has never heard of Myro.

Those two uses cannot be allowed to drift apart. If the certificate describes a
bar the questions were not written to, the certificate is a claim we did not
test — which is the no-fabrication rule broken on the one artifact where it
matters most. So the standard lives here, once, and both sides import it.

That shared definition is also what makes the claim checkable. "Level 3 of 5"
alone tells a recruiter nothing — it has no scale and no meaning.

But the two audiences need two SENTENCES about the same bar, and conflating them
is how the certificate came to overclaim. The generator is aimed at a *person*
("someone who applies this independently on real projects"). The certificate may
only report what the *assessment* showed ("independent problem-solving on typical
cases"). Ten multiple-choice questions cannot establish a work history, and until
2026-08-31 the CV line said they could — measured at the time: levels 4 and 5
had a 100% pass rate across five users, while claiming the holder "architects and
mentors others".

One standard, two renderings, written side by side so they cannot describe
different bars.

The proficiency NAMES the product uses elsewhere (Scout, Trailblazer, Excavator,
Cartographer, Legend) are deliberately not here. They are internal game texture;
on a CV they would puzzle a reader rather than inform them.
"""

from __future__ import annotations

from dataclasses import dataclass

MIN_LEVEL = 1
MAX_LEVEL = 5


@dataclass(frozen=True)
class LevelStandard:
    level: int
    #: Short name for the bar itself. Internal-facing.
    name: str
    #: WHO this level targets. The calibration brief — a person description, used
    #: to aim question generation. Never shown outside Myro.
    targets: str
    #: WHAT THE ASSESSMENT DEMONSTRATED. This is the only thing a certificate may
    #: claim, and it is narrower than `targets` on purpose.
    #:
    #: Ten multiple-choice questions establish knowledge and applied judgment on
    #: written scenarios. They do not establish that someone "applies it
    #: independently on real projects" or "mentors others" — those are work
    #: histories, and we have not seen the work. The certificate said exactly
    #: that until 2026-08-31, on a document handed to employers.
    assessed: str


LEVEL_STANDARDS: dict[int, LevelStandard] = {
    1: LevelStandard(
        1, "foundational",
        targets="someone who has just started learning this skill",
        assessed="core concepts and vocabulary",
    ),
    2: LevelStandard(
        2, "working knowledge",
        targets="has used it on small tasks with guidance",
        assessed="applied basics on straightforward cases",
    ),
    3: LevelStandard(
        3, "intermediate",
        targets="applies it independently on real projects",
        assessed="independent problem-solving on typical cases",
    ),
    4: LevelStandard(
        4, "advanced",
        targets="handles edge cases, tradeoffs and non-trivial design",
        assessed="edge cases and design tradeoffs",
    ),
    5: LevelStandard(
        5, "expert",
        targets="architects/mentors others, deep internals and failure modes",
        assessed="diagnosis of failure modes and non-obvious tradeoffs",
    ),
}


def standard_for(level: int) -> LevelStandard | None:
    return LEVEL_STANDARDS.get(int(level)) if level is not None else None


def prompt_label(level: int) -> str:
    """The calibration brief handed to the question generator — who this level
    is aimed at. Unchanged wording, so an existing bank does not shift under a
    brief it was not written against."""
    std = standard_for(level)
    return f"{std.name} — {std.targets}" if std else ""


def certificate_clause(level: int) -> str:
    """What the CV line may claim: what the assessment actually demonstrated.

    Deliberately narrower than `prompt_label`. Empty for an unknown level, so a
    malformed certificate degrades to no claim rather than a wrong one.
    """
    std = standard_for(level)
    return std.assessed if std else ""
