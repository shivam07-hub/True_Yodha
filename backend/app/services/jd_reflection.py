"""JD Reflection — does one line of the person's evidence entail one JD motion?

Pure. Coverage, the weave interview, the writer, reservoir projection, and
Match Eval read this. None of them decides entailment again. Cosine is not an
input: it may order lines elsewhere, and it cannot mark a motion proven.

Spec: ARCHITECTURE_JD_REFLECTION.md.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Words that name the asking, not the motion. A requirement still has to keep
# a real phrase after these are removed; if nothing remains, the motion is a gap.
_FILLER = frozenset(
    """
    a an the of to for in on with via and or at by from into over per
    least one following such your their our this that these those within across
    lead leading manage managing develop developing oversee overseeing
    conduct conducting confirm confirming collaborate collaborating
    provide providing utilize utilizing utilise utilising prepare preparing
    present presenting create creating maintain maintaining drive driving
    support supporting deliver delivering build building design designing
    implement implementing demonstrate demonstrating excel excelling use using
    creation initiative initiatives service services solution solutions
    strategy strategies insight insights opportunity opportunities
    process processes team teams member members skill skills performance
    innovation finding findings recommendation recommendations
    client clients engagement engagements business strategic decision making
    quality integrity security framework frameworks
    """.split()
)

_ALT_MARKERS = (
    "at least one of the following",
    "one of the following",
    "at least one of",
    "such as",
)

_TOKEN = re.compile(r"[a-z0-9+#]+")


@dataclass(frozen=True)
class Evidence:
    id: str
    text: str


@dataclass(frozen=True)
class Motion:
    requirement: str
    status: str  # "proven" | "gap"
    evidence_id: str | None


def reflect(requirements: list[str], evidence: list[Evidence]) -> list[Motion]:
    """One Motion per requirement, in the same order. `proven` names the line."""
    return [
        Motion(requirement=requirement, status=status, evidence_id=evidence_id)
        for requirement in requirements
        for status, evidence_id in (_judge(requirement, evidence),)
    ]


def entails(requirement: str, text: str) -> bool:
    """True when this text alone carries the requirement's motion."""
    return _judge(requirement, [Evidence(id="_", text=text)])[1] is not None


def proving_ids(requirement: str, evidence: list[Evidence]) -> list[str]:
    """Every line that carries the motion, in evidence order."""
    phrases = _alternatives(requirement) or _motion_phrases(requirement)
    if not phrases:
        return []
    return [
        line.id
        for line in evidence
        if any(_contains_phrase(line.text, phrase) for phrase in phrases)
    ]


def pointer_inside_source(source: str, pointer: str) -> bool:
    """A rewritten pointer may only use phrases the source already contains.

    An interview answer that becomes "engineered a robust inbound pipeline"
    when the person said "qualified pipeline" does not land. A fragment
    shorter than a line does not land either, unless it is the whole source.
    """
    text = " ".join((pointer or "").split())
    if not text:
        return False
    if len(text.split()) < 8 and text not in " ".join((source or "").split()):
        return False
    words = _content_tokens(text)
    if len(words) < 2:
        return bool(words) and _contains_phrase(source, words[0])
    for start in range(len(words) - 1):
        if not _contains_phrase(source, f"{words[start]} {words[start + 1]}"):
            return False
    return True


def format_block(requirements: list[str], lines: list[str]) -> str:
    """Facts for the judge. Not a grade."""
    evidence = [
        Evidence(id=str(i), text=text)
        for i, text in enumerate(lines)
        if str(text or "").strip()
    ]
    by_id = {line.id: line for line in evidence}
    motions = reflect([r for r in requirements if r.strip()], evidence)
    if not motions:
        return ""
    proven = [
        f"- {m.requirement} — {by_id[m.evidence_id].text}"
        for m in motions
        if m.status == "proven" and m.evidence_id in by_id
    ]
    gaps = [f"- {m.requirement}" for m in motions if m.status == "gap"]
    parts = []
    if proven:
        parts.append("Motions this person's own lines prove:\n" + "\n".join(proven))
    if gaps:
        parts.append("Motions still unproven:\n" + "\n".join(gaps))
    return "\n\n".join(parts)


def _judge(requirement: str, evidence: list[Evidence]) -> tuple[str, str | None]:
    phrases = _alternatives(requirement) or _motion_phrases(requirement)
    if not phrases:
        return "gap", None
    for line in evidence:
        if any(_contains_phrase(line.text, phrase) for phrase in phrases):
            return "proven", line.id
    return "gap", None


def _alternatives(requirement: str) -> list[str] | None:
    """Tool or field lists offered as substitutes. Any one name can prove it."""
    low = requirement.lower()
    for marker in _ALT_MARKERS:
        at = low.find(marker)
        if at < 0:
            continue
        tail = requirement[at + len(marker):]
        if ":" in tail:
            tail = tail.split(":", 1)[1]
        names = [
            name.strip(" .")
            for name in re.split(r",|\band\b|\bor\b", tail, flags=re.I)
            if name.strip(" .")
        ]
        if len(names) >= 2:
            return names
    return None


def _motion_phrases(requirement: str) -> list[str]:
    """Each clause's remaining words, in order. A shared head noun is not enough."""
    text = re.sub(r"\([^)]*\)", " ", requirement)
    phrases: list[str] = []
    for chunk in re.split(r"\band\b|,", text, flags=re.I):
        words = [word for word in _tokens(chunk) if _stem(word) not in _FILLER and word not in _FILLER]
        if words:
            phrases.append(" ".join(words[-3:]))
    return phrases


def _content_tokens(text: str) -> list[str]:
    """Asking-words dropped, so 'payments to the cloud' can meet 'payments cloud'."""
    return [word for word in _tokens(text) if _stem(word) not in _FILLER and word not in _FILLER]


def _contains_phrase(text: str, phrase: str) -> bool:
    hay = _content_tokens(text)
    needle = _content_tokens(phrase)
    if not needle or len(hay) < len(needle):
        return False
    for start in range(len(hay) - len(needle) + 1):
        if all(_same(hay[start + offset], needle[offset]) for offset in range(len(needle))):
            return True
    return False


def _tokens(text: str) -> list[str]:
    return _TOKEN.findall(text.lower().replace("-", " ").replace("–", " ").replace("/", " "))


def _same(left: str, right: str) -> bool:
    return _stem(left) == _stem(right)


def _stem(word: str) -> str:
    if len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "is", "us")):
        return word[:-1]
    return word
