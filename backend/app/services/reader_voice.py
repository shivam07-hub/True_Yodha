"""reader_voice — the one place that owns how Myro addresses a reader.

Every surface that writes prose back to the person it is about (persona canvas,
CV rewrite, gap plans, mentor replies) has the same two failure modes, and they
have each been shipped at least once:

1. THIRD PERSON. The writer describes the reader to an absent third party —
   "companies they keep coming back to". The reader then experiences their own
   career document as a case file being discussed about them. This is the single
   most damaging voice bug on a trust surface, because it is invisible to every
   type check and reads as competent prose.
2. MACHINE TELLS. Filler that survives review because it scans as fluent:
   "with a focus on", "bridge the gap", trailing "-ing" clauses that assert
   insight without carrying any ("indicating interest in ...").

Callers get two things and need to know nothing else:

    violations(text) -> list[str]   enforcement — non-empty means do not ship
    prompt_rules()   -> str         the same contract, phrased for a writer

Both render from the constants below, so the rule a model is told and the rule
it is judged against can never drift apart. That drift is why prompt-only voice
rules decay: the prompt says "second person", the output says "they", and
nothing in the pipeline disagrees.

ENFORCEMENT IS DELIBERATELY NARROWER THAN GUIDANCE. `violations()` only carries
checks with high precision, because its consequence is dropping a paragraph.
Style smells that cannot be detected reliably (rule-of-three lists, cadence)
live in `prompt_rules()` only — asking a writer to avoid something is cheap,
deleting a good paragraph on a bad regex is not. Do not "upgrade" a guidance
rule into an enforced one without evidence it fires cleanly.

Never run this over the reader's OWN words. Edits are law; a user who writes
"they" about their manager is not committing a voice error.
"""
from __future__ import annotations

import re

# ── the contract, as data ────────────────────────────────────────────────────

# Pronouns that refer to the reader. In a document addressed to one person about
# their own career these are the reader ~always, so the check is strict on
# purpose: a dropped paragraph regenerates on the next window, a shipped "they"
# is the bug this module exists to stop.
#
# "them" is deliberately NOT here. It is the one third-person pronoun with a
# constant innocent use — plural objects the reader owns ("you tailored 3 CVs,
# every one of them for a product role") — and enforcing it deleted correct
# prose in test. It stays in the writer guidance below, where a false positive
# costs nothing. Do not add it back without a check that can tell a reader from
# a list of jobs.
_THIRD_PERSON_PRONOUNS = ("they", "their", "theirs", "themselves")

# Never defensible on a surface addressed to the person being described.
_THIRD_PERSON_NOUNS = (
    "the user",
    "the candidate",
    "the reader",
    "the job seeker",
    "the jobseeker",
    "this person",
)

# Filler that reads fluent and says nothing. Each has shipped in real output.
_MACHINE_TELLS = (
    "with a focus on",
    "with an emphasis on",
    "bridge the gap",
    "bridging the gap",
    "in today's",
    "ever-evolving",
    "landscape",
    "leverage",
    "delve",
    "testament",
    "showcase",
    "robust",
    "tapestry",
    "underscore",
    "seamless",
)

# Asserted insight with no content behind it — "-ing" tails bolted to a clause.
_HOLLOW_TAILS = (
    "indicating",
    "showcasing",
    "reflecting a focus",
    "suggesting a",
    "highlighting their",
    "further cementing",
    "underscoring",
)

# Guidance only — real smells, but no precise test. See module docstring.
_UNCHECKABLE_GUIDANCE = (
    "'them' for your reader ('Myro helps them find work'). Unenforced because "
    "'them' is legitimate for things your reader owns — but never use it for "
    "the reader.",
    "Three-item lists ('procurement, audit, and business intelligence'). "
    "Use two, or one. Never three.",
    "'not just X but Y' and 'it's not X, it's Y'.",
    "Restating a signal line as prose. The evidence chip already shows it — "
    "say what it MEANS.",
    "Naming a gap without naming what fills it. Either name the missing skill, "
    "title or evidence, or delete the sentence.",
)

_PRONOUN_RE = re.compile(
    r"\b(?:%s)\b" % "|".join(_THIRD_PERSON_PRONOUNS), re.IGNORECASE
)


# ── enforcement ──────────────────────────────────────────────────────────────

def violations(text: str) -> list[str]:
    """Reasons this prose must not reach the reader. Empty = clean.

    Sorted and de-duplicated so a caller can log them as a stable metric label
    without the same paragraph producing a different string each run.
    """
    body = text or ""
    lowered = body.lower()
    found: set[str] = set()

    for hit in _PRONOUN_RE.findall(body):
        found.add(f"third_person:{hit.lower()}")
    for noun in _THIRD_PERSON_NOUNS:
        if noun in lowered:
            found.add(f"third_person:{noun.replace(' ', '_')}")
    for tell in _MACHINE_TELLS:
        if tell in lowered:
            found.add(f"machine_tell:{tell.replace(' ', '_').replace(chr(39), '')}")
    for tail in _HOLLOW_TAILS:
        if tail in lowered:
            found.add(f"hollow_tail:{tail.replace(' ', '_')}")

    return sorted(found)


def is_clean(text: str) -> bool:
    return not violations(text)


# ── the same contract, phrased for a writer ──────────────────────────────────

def prompt_rules() -> str:
    """The voice contract as prompt text, rendered from the constants above.

    Kept in this module so a rule can never be tightened in the checker while
    the prompt still permits it — the drift that lets voice bugs back in.
    """
    pronouns = ", ".join(f"'{p}'" for p in _THIRD_PERSON_PRONOUNS)
    nouns = ", ".join(f"'{n}'" for n in _THIRD_PERSON_NOUNS)
    tells = ", ".join(f"'{t}'" for t in _MACHINE_TELLS)
    tails = ", ".join(f"'{t}'" for t in _HOLLOW_TAILS)
    guidance = "\n".join(f"- {g}" for g in _UNCHECKABLE_GUIDANCE)
    return (
        "VOICE — you are writing TO one person about themselves. There is no "
        "third party in the room.\n"
        f"- NEVER refer to your reader as {pronouns}, or as {nouns}. "
        "A single slip into third person turns their own document into a file "
        "someone else is reading about them. Paragraphs that do this are "
        "deleted before the reader sees them, so the slip costs you the whole "
        "paragraph.\n"
        f"- BANNED phrases (machine-written filler): {tells}.\n"
        f"- BANNED '-ing' tails that assert insight without carrying any: {tails}.\n"
        f"{guidance}"
    )
