"""JD Reflection — what proves a JD requirement, and what does not.

Pure. Two rules (ARCHITECTURE_JD_REFLECTION.md §0, 2026-10-19):

1. Named tools are a string fact. A requirement that offers tools as
   alternatives is proven by any line that names one of them.
2. Everything else is the judge's call. This module writes the judge's prompt
   and reads its answer; `jd_coverage` makes the one batched call per panel and
   caches the verdicts. Nobody else decides proof.

The phrase rule this replaced proved 63 of 68 lines on a single word ("plan"
proved "Plan and budget projects") and missed real evidence, so it is gone.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

_ALT_MARKERS = (
    "at least one of the following",
    "one of the following",
    "at least one of",
    "such as",
)

_TOKEN = re.compile(r"[a-z0-9+#]+")

# A tool name is short and named: an acronym, a capitalised word, or a token
# carrying a digit or a symbol (C++, A/B, S3). "scripting" is a field, not a tool.
_NAMED = re.compile(r"[A-Z0-9]|\+\+|#")

#: The judge reads at most this many lines per requirement.
CANDIDATES_PER_REQUIREMENT = 3


@dataclass(frozen=True)
class Candidate:
    """One line of the person's own evidence, as the judge sees it."""

    id: str
    text: str


# ── 1 · named tools ────────────────────────────────────────────────────────────

def named_tools(requirement: str) -> list[str] | None:
    """Tools the requirement offers as alternatives, or None when it offers none."""
    low = requirement.lower()
    for marker in _ALT_MARKERS:
        at = low.find(marker)
        if at < 0:
            continue
        tail = requirement[at + len(marker):]
        if ":" in tail:
            tail = tail.split(":", 1)[1]
        names = _split_names(re.sub(r"\([^)]*\)", " ", tail))
        if len(names) >= 2:
            return names
    return _or_list(requirement)


def names_a_tool(requirement: str, text: str) -> bool:
    """True when the text names one of the tools this requirement offers."""
    tools = named_tools(requirement)
    if not tools:
        return False
    hay = _tokens(text)
    return any(_contains(hay, _tokens(tool)) for tool in tools)


def _or_list(requirement: str) -> list[str] | None:
    """'SQL, Python, or R' — a list joined by "or" whose items are named tools.

    The first item is the tail of a clause ("…using SQL"), so it keeps only its
    last named run. Any lowercase item ("scripting") is a field and drops out;
    two named tools are still a list.
    """
    if not re.search(r"\bor\b", requirement):
        return None
    text = re.sub(r"\([^)]*\)", " ", requirement)
    parts = [p.strip(" .") for p in re.split(r",|\bor\b", text) if p.strip(" .")]
    if len(parts) < 2:
        return None
    head = _trailing_name(parts[0])
    names = ([head] if head else []) + [p for p in parts[1:] if _is_name(p)]
    return names if len(names) >= 2 else None


def _split_names(tail: str) -> list[str]:
    return [
        name.strip(" .")
        for name in re.split(r",|\band\b|\bor\b", tail, flags=re.I)
        if name.strip(" .")
    ]


def _is_name(part: str) -> bool:
    words = part.split()
    return 0 < len(words) <= 3 and all(_NAMED.search(word) for word in words)


def _trailing_name(clause: str) -> str:
    words = clause.split()
    run: list[str] = []
    for word in reversed(words):
        if not _NAMED.search(word) or len(run) == 3:
            break
        run.insert(0, word)
    # The clause's first word is capitalised as a sentence start, not as a name.
    if run and len(run) == len(words):
        run = run[1:]
    return " ".join(run)


def _tokens(text: str) -> list[str]:
    return _TOKEN.findall(text.lower().replace("-", " ").replace("–", " ").replace("/", " "))


def _contains(hay: list[str], needle: list[str]) -> bool:
    if not needle or len(hay) < len(needle):
        return False
    return any(
        hay[start:start + len(needle)] == needle
        for start in range(len(hay) - len(needle) + 1)
    )


# ── 2 · the judge's prompt and answer ─────────────────────────────────────────

JUDGE_SYSTEM = (
    "You are a strict hiring manager. For each requirement of a job you are shown "
    "a few lines from one candidate's own CV and career stories. Decide which "
    "lines give DIRECT evidence that the candidate has done what the requirement "
    "asks.\n"
    "A line proves a requirement only if a recruiter reading that line alone would "
    "accept it as evidence of the requirement's core activity, in work of the same "
    "kind:\n"
    "- The same activity, not a related one. Building dashboards proves 'build "
    "dashboards'. Presenting to a CEO proves 'present to senior leadership'; it "
    "does not prove 'scope complex data analyses'.\n"
    "- The same kind of work. College events, clubs, sponsorship drives and "
    "coursework do not prove client projects, research deadlines, or work in a "
    "global team.\n"
    "- Shared words are not proof: a sales 'pipeline' is not a data pipeline; "
    "'partnered with the marketing team' is not partnering with sector teams on "
    "client projects.\n"
    "- A skills line proves only a requirement that asks for one of the tools it "
    "names — never a responsibility, a domain, or a habit.\n"
    "- A generic requirement (communication, teamwork, learning, quality, "
    "deadlines) is proven only by a line that shows that behaviour at work.\n"
    "When unsure, the line does not prove it. For most requirements, most lines "
    "do not.\n"
    "For every line you accept, copy the exact words from that line that show the "
    "activity.\n"
    'Return ONLY compact JSON: {"proven": {"<requirement number>": '
    '[{"id": "<line id>", "shows": "<exact words from the line>"}]}}. '
    "An empty list means no line proves it. No prose outside the JSON."
)

JUDGE_MAX_TOKENS = 1600


def judge_messages(batch: list[tuple[str, list[Candidate]]]) -> list[dict]:
    """One prompt for a whole panel: each requirement with its candidate lines."""
    blocks = []
    for number, (requirement, candidates) in enumerate(batch, start=1):
        lines = "\n".join(f"  [{c.id}] {' '.join(c.text.split())}" for c in candidates)
        blocks.append(f"{number}. {requirement}\n{lines or '  (no lines)'}")
    return [
        {"role": "system", "content": JUDGE_SYSTEM},
        {"role": "user", "content": "\n\n".join(blocks)},
    ]


def parse_verdicts(raw: str, batch: list[tuple[str, list[Candidate]]]) -> list[set[str]] | None:
    """Per requirement, the candidate ids the judge ruled proving.

    None when the answer is not the JSON asked for — a failed judge must not be
    read as "nothing proves it". A proof counts only when it names a line offered
    for THAT requirement and quotes words that really are in the line: the
    judge has to point at the evidence, not just assert it.
    """
    obj = _json_object(raw)
    if obj is None or not isinstance(obj.get("proven"), dict):
        return None
    proven = obj["proven"]
    out: list[set[str]] = []
    for number, (_requirement, candidates) in enumerate(batch, start=1):
        text_by_id = {c.id: c.text for c in candidates}
        entries = proven.get(str(number)) or []
        ids: set[str] = set()
        for entry in entries if isinstance(entries, list) else []:
            if not isinstance(entry, dict):
                continue
            line_id = str(entry.get("id") or "")
            if line_id in text_by_id and _quoted(str(entry.get("shows") or ""), text_by_id[line_id]):
                ids.add(line_id)
        out.append(ids)
    return out


def _quoted(shows: str, line: str) -> bool:
    """The quoted words appear in the line, give or take case and spacing."""
    needle = _tokens(shows)
    return len(needle) >= 2 and _contains(_tokens(line), needle)


def _json_object(raw: str) -> dict | None:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        nl = text.find("\n")
        if nl != -1 and text[:nl].lower().startswith("json"):
            text = text[nl + 1:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    body = text[start:end + 1]
    try:
        parsed = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        # Models end lists with a trailing comma ('"11": [],\n}}' — measured on
        # the judgment lane, 2026-10-19). That is the only repair made.
        try:
            parsed = json.loads(_TRAILING_COMMA.sub(r"\1", body))
        except (json.JSONDecodeError, ValueError):
            return None
    return parsed if isinstance(parsed, dict) else None


_TRAILING_COMMA = re.compile(r",\s*([}\]])")


# ── readers of the verdicts ───────────────────────────────────────────────────

def format_block(verdicts: list[tuple[str, str | None]]) -> str:
    """Facts for Match Eval, from the panel: (requirement, proving line or None).

    Not a grade. The judge that rates the job reads which motions this person's
    own lines prove and which are still gaps.
    """
    proven = [f"- {req} — {line}" for req, line in verdicts if req.strip() and line]
    gaps = [f"- {req}" for req, line in verdicts if req.strip() and not line]
    parts = []
    if proven:
        parts.append("Motions this person's own lines prove:\n" + "\n".join(proven))
    if gaps:
        parts.append("Motions still unproven:\n" + "\n".join(gaps))
    return "\n\n".join(parts)


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


# Words that name the asking, not the deed — dropped on both sides so a pointer
# that says "payments to the cloud" can sit inside "payments cloud".
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


def _content_tokens(text: str) -> list[str]:
    return [word for word in _tokens(text) if _stem(word) not in _FILLER and word not in _FILLER]


def _contains_phrase(text: str, phrase: str) -> bool:
    hay = _content_tokens(text)
    needle = _content_tokens(phrase)
    if not needle or len(hay) < len(needle):
        return False
    for start in range(len(hay) - len(needle) + 1):
        if all(_stem(hay[start + offset]) == _stem(needle[offset]) for offset in range(len(needle))):
            return True
    return False


def _stem(word: str) -> str:
    if len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "is", "us")):
        return word[:-1]
    return word
