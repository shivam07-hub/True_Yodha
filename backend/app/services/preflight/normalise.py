"""Stored lines → what Myro will actually run them as. Pure, read-time, never saved.

The gap this fills: `line.kind` is assigned by whoever produced the line —
`memory_import` maps the distiller's `fact.kind`, `proposals` maps the mentor's
diff keys, `confirmed_from` maps profile columns. **None of the three reads the
sentence.** So "Requires roles based in India" arrives as a `wont_take` because
the distiller called it a constraint, and the resolver then counts it against a
six-slot exclusion budget and asks the user to drop four things.

Read-time on purpose. Persisting a refile would change `line.kind`, and
`merge_imports` identifies a line by `(kind, text)` — so the next import would
no longer recognise it and would append a twin. That is the `Won't take 15 of 6`
bug, re-armed. The stored Order stays the user's raw truth; this module is how
the resolver reads it. Ids are preserved, so every PATCH still addresses the
line the user is looking at.

Two rules that looked right on paper and were killed by the prod row
(`33b66361`, 2026-08-24):

- **`soft` does not mean `lean`.** `soft` is set by a phrasing hint and marks
  uncertain STRENGTH, not direction. The row carries `soft=True` on both
  "Prefers professional services or corporate environment" (positive) and
  "Prefers to avoid roles with 'specialist' in the title" (negative). Polarity
  is the signal; softness is not.
- **Absence of a negative is not evidence of a preference.** See `_POSITIVE`.
- **Seniority is not always a tilt.** "Avoids senior management roles" is a
  real exclusion for someone who does not want to manage. Refiling every level
  statement to `lean` would have quietly widened their search.
"""
from __future__ import annotations

import re

from app.services.preflight.lines import LineKind, OrderLine

#: Says NO to something. The single signal that separates an exclusion from a
#: preference, whatever the producer filed it as.
_NEGATIVE = re.compile(
    r"\b(avoid|avoids|avoiding|no|not|never|none|won'?t|wont|exclude|excluding|"
    r"rather not|unwilling|opposed)\b",
    re.I,
)
#: Explicitly states a LIKING. Required — not merely "no negative found" — because
#: `memory_import._strip_lead` stores "No large corporations" as "Large
#: corporations": the exclusion's negation lives in the SLOT, not in the text.
#: Absence of a negative is therefore evidence of nothing, and treating it as
#: evidence refiled every bare deal-breaker into a tilt, silently widening the
#: search. A refile must be argued for, never inferred from silence.
_POSITIVE = re.compile(
    r"\b(prefers?|prefer(?:red|ring)|likes?|enjoys?|interested in|keen on|"
    r"drawn to|open to|seeks?|seeking|wants?|leans? toward|ideally)\b",
    re.I,
)
_LOCATION = re.compile(
    r"\b(based (?:in|out of)|located in|roles? (?:in|based)|work(?:ing)? (?:in|from)|"
    r"open to relocat|willing to relocat|relocat\w*\s+to)\b",
    re.I,
)
_PAY = re.compile(r"(₹|\brs\.?\s*\d|\blakhs?\b|\blpa\b|\bctc\b|total comp|pay floor|\bcrores?\b)", re.I)
#: True of the person, actionable by nobody. No listing is filtered on these, so
#: they must not consume a slot — and must not be deleted either.
_NON_FILTER = re.compile(
    r"\b(notice period|serving notice|availability|available from|current ctc|"
    r"visa status|passport|date of birth)\b",
    re.I,
)

_STOP = {
    "a", "an", "the", "of", "or", "and", "in", "at", "to", "for", "with", "on",
    "is", "are", "be", "roles", "role", "work", "working", "jobs", "job",
    "prefers", "prefer", "preferred", "avoids", "avoid", "seeks", "seeking",
    "interested", "requires", "required", "wants", "want", "like", "likes",
}
#: Words that name the same thing. Without this, "avoids large corporations" and
#: "prefers large or established companies" share one token out of four and the
#: contradiction stays invisible — which is what prod is doing right now.
_SYNONYM = {
    "corporations": "company", "corporation": "company", "corporate": "company",
    "companies": "company", "firms": "company", "firm": "company",
    "organisations": "company", "organizations": "company", "mnc": "company",
    "startups": "startup", "start-ups": "startup", "start": "startup",
    "established": "large", "big": "large", "enterprise": "large",
    "small": "small", "early-stage": "startup", "seed": "startup",
    "remote": "remote", "wfh": "remote", "onsite": "onsite", "office": "onsite",
}


def _tokens(text: str) -> frozenset[str]:
    raw = re.findall(r"[a-z0-9-]+", _NEGATIVE.sub(" ", text.lower()))
    return frozenset(_SYNONYM.get(w, w) for w in raw if w not in _STOP and len(w) > 2)


def overlap(left: str, right: str) -> float:
    """Jaccard over content tokens. 0.5 is the line between "the same subject"
    and "two subjects that share a word"."""
    a, b = _tokens(left), _tokens(right)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def refile(line: OrderLine) -> tuple[LineKind, str | None]:
    """What this statement IS, and the note to show if that differs from how it
    was filed. Never changes the text — only which slot runs it."""
    text = line.text
    negative = bool(_NEGATIVE.search(text))

    if _NON_FILTER.search(text):
        return "fact", "kept on your profile — no job is filtered on this"
    if line.kind in ("wont_take", "lean") and _PAY.search(text):
        return "pay_floor", "read as your pay floor"
    if line.kind == "wont_take" and not negative and _LOCATION.search(text):
        return "location", "read as where you'll work, not an exclusion"
    if line.kind == "wont_take" and not negative and _POSITIVE.search(text):
        return "lean", "this tilts the ranking — it doesn't exclude anything"
    if line.kind == "lean" and negative and not _PAY.search(text):
        return "wont_take", "read as a hard no"
    return line.kind, None


#: Slots that hold exactly one value. Mirrors `spec.SLOT_ARITY`; kept local so
#: this module stays importable by the resolver without a cycle. Asserted equal
#: in `test_preflight_normalise.py`.
_ONE_ONLY: dict[str, tuple[str, ...]] = {"target_location": ("location",), "career_goal": ("goal",),
                                         "superpower": ("strength",)}


def _refiled(line: OrderLine, kind: LineKind, note: str | None) -> OrderLine:
    return OrderLine(**{**line.to_dict(), "kind": kind,
                        "source_note": note or line.source_note, "ref": line.ref})


def apply(lines: list[OrderLine]) -> list[OrderLine]:
    """Every kept line, filed by what it says. Ids and text are untouched.

    A refile YIELDS to a line the user filed there themselves. "Requires roles
    based in India" reads as a location, but the prod order already holds
    "Bengaluru" — and `target_location` takes one. Asking "Bengaluru or India?"
    would be Myro's own reinterpretation picking a fight with an answer the user
    gave directly; Bengaluru is in India, so there is no question to ask. The
    refiled line steps aside as a `fact`: still on screen, still kept, just not
    spending the slot. Native lines that genuinely collide still conflict.
    """
    out: list[OrderLine] = []
    moved: set[str] = set()
    for line in lines:
        kind, note = refile(line)
        if kind == line.kind:
            out.append(line)
            continue
        moved.add(line.id)
        out.append(_refiled(line, kind, note))

    for kinds in _ONE_ONLY.values():
        holders = [x for x in out if x.kind in kinds]
        if len(holders) < 2:
            continue
        natives = [x for x in holders if x.id not in moved]
        if not natives:
            continue  # every claimant was refiled — a real question, leave it
        yielding = {x.id for x in holders if x.id in moved}
        out = [
            _refiled(x, "fact", "already covered by what you set above") if x.id in yielding else x
            for x in out
        ]
    return out
