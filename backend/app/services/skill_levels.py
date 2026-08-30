"""What a Myro level MEANS — the one definition, in front of two audiences.

This started as a private dict inside the question generator, where it was the
calibration brief: "write questions for someone at level 3". It is now also the
sentence on a user's CV, in front of an employer who has never heard of Myro.

Those two uses cannot be allowed to drift apart. If the certificate describes a
bar the questions were not written to, the certificate is a claim we did not
test — which is the no-fabrication rule broken on the one artifact where it
matters most. So the standard lives here, once, and both sides import it.

That shared definition is also what makes the claim checkable. "Level 3 of 5"
alone tells a recruiter nothing — it has no scale and no meaning. "Level 3 of 5:
applies it independently on real projects" tells them exactly what was assessed,
in the same words the assessment was built from.

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
    #: What a person at this level can do. Written to be read by someone outside
    #: Myro, with no scale in their head and no interest in our vocabulary.
    means: str


LEVEL_STANDARDS: dict[int, LevelStandard] = {
    1: LevelStandard(1, "foundational", "has started learning this skill"),
    2: LevelStandard(2, "working knowledge", "uses it on small tasks with guidance"),
    3: LevelStandard(3, "intermediate", "applies it independently on real projects"),
    4: LevelStandard(4, "advanced", "handles edge cases, tradeoffs and non-trivial design"),
    5: LevelStandard(5, "expert", "architects and mentors others, including failure modes"),
}


def standard_for(level: int) -> LevelStandard | None:
    return LEVEL_STANDARDS.get(int(level)) if level is not None else None


def prompt_label(level: int) -> str:
    """The calibration brief handed to the question generator.

    Keeps the original shape ("intermediate — someone who…") so the generated
    bank does not shift under a bank that was written against the old wording.
    """
    std = standard_for(level)
    if std is None:
        return ""
    return f"{std.name} — {std.means}"


def certificate_clause(level: int) -> str:
    """What the CV line says this level means. Empty for an unknown level, so a
    malformed certificate degrades to no claim rather than a wrong one."""
    std = standard_for(level)
    return std.means if std else ""
