"""Stage A — deterministic skill extraction. The floor no job falls below.

Myro's product is the skill it reads out of a job and the gap it shows against a
CV. That means one rule, and this module exists to make it enforceable:

    No code path may create a job without skills.

Skills are an OUTPUT of ingest, not an enrichment of it. Before this module the
only writer of ``job_skills`` was the scraper's LM Studio pass — 1-2 minutes per
job — and 6,252 prod jobs (10% of the corpus) ended up with none: 2,218 died
waiting in the queue while the verifier marked their listing inactive, 1,654
were never enqueued, and 1,088 were stamped ``complete`` having written nothing.
Their descriptions averaged 3,572 characters. The text was always there.

What this does is deliberately small: match the job's text against the Lightcast
taxonomy and read WHERE in the document each hit appears. No model, no network,
~200ms per job against real prod postings. A judgment model (Stage B) still
ranks and levels these later and upgrades them in place — but it upgrades a
floor instead of being the only thing between a job and being matchable.

What this is NOT for: inventing skills outside the taxonomy, deciding liveness,
or replacing Stage B's judgment.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

from app.services.taxonomy_loader import LightcastSkill, get_all_skills

# Hyphens are KEPT as part of a token, and appear in the boundary class below.
# "flexible work-life support" must not yield the skill "Life Support": dropping
# the hyphen glues `life` to `support` into a phrase the posting never wrote.
# Keeping it also makes "E-Commerce" match "e-commerce" exactly, on both sides.
_NON_WORD = re.compile(r"[^A-Za-z0-9+#.\- ]+")
_SPACE = re.compile(r"\s+")

# A dot is both an intra-token character ("Node.js") and sentence punctuation
# ("Strong Python."). Treating it as always-intra-token made every skill at the
# end of a sentence unmatchable; treating it as always-punctuation would split
# "Node.js". So a dot only binds when a word character follows it.
_LEFT_GUARD = r"(?<![A-Za-z0-9+#\-])(?<![A-Za-z0-9]\.)"
_RIGHT_GUARD = r"(?![A-Za-z0-9+#\-])(?!\.[A-Za-z0-9])"

# Where in a job description a skill is named is the cheapest honest signal of
# how much it matters. A skill under "Requirements" is a gate; the same word in
# a paragraph about the team is not. This is the importance signal Stage A can
# produce for free, and it is why `is_primary` (true on 94.2% of prod rows) can
# eventually retire.
_MUST_HAVE_HINT = re.compile(
    r"\b(required|requirements?|must[- ]have|mandatory|minimum qualifications?"
    r"|basic qualifications?|you (?:will )?(?:must )?have|what you'?ll need"
    r"|essential|qualifications?)\b",
    re.IGNORECASE,
)
_PREFERRED_HINT = re.compile(
    r"\b(preferred|nice[- ]to[- ]have|good[- ]to[- ]have|bonus|a plus|desirable"
    r"|advantage|would be great|ideally)\b",
    re.IGNORECASE,
)

# A heading's claim has to end somewhere. Unbounded, one "Preferred" line near
# the top made every skill in the posting `preferred`, and one "Requirements"
# line made every skill a gate — both observed on real prod JDs.
_ZONE_BLOCK_MAX_LINES = 25

Zone = Literal["must_have", "preferred", "mentioned"]

# Required level by zone. Deliberately coarse: Stage A can see WHERE a skill is
# named, never how deep the role needs it. Stage B replaces these with a real
# 1-4 read. These match the levels the import path already used, so the number
# means one thing across every writer.
_LEVEL_BY_ZONE: dict[str, int] = {"must_have": 4, "preferred": 2, "mentioned": 2}
_CONFIDENCE_BY_ZONE: dict[str, float] = {"must_have": 0.82, "preferred": 0.72, "mentioned": 0.68}
_ZONE_RANK: dict[str, int] = {"must_have": 3, "preferred": 2, "mentioned": 1}

DEFAULT_LIMIT = 12


@dataclass(frozen=True)
class ExtractedSkill:
    """One taxonomy skill found in a job, with where it was found."""

    taxonomy_key: str
    zone: Zone
    required_level: int
    confidence: float

    @property
    def is_must_have(self) -> bool:
        return self.zone == "must_have"


def prepare_text(text: str) -> str:
    """Punctuation-normalized, CASE-PRESERVED text.

    Case is preserved because it is the only cheap signal that separates the
    proper-noun sense of an ambiguous skill name from the ordinary English word
    — see `_bare_form_present`. Everything downstream derives its lowercase form
    from this exact string, so character offsets stay comparable between the
    case-sensitive and case-insensitive passes.
    """
    return _SPACE.sub(" ", _NON_WORD.sub(" ", text)).strip()


def normalize_skill_label(label: str) -> str:
    return prepare_text(label).lower()


def _skill_terms(skill_name: str) -> tuple[str, str | None]:
    """(full name lowercased, bare pre-parenthetical form or None).

    The two forms are matched under different rules — that split is the point.
    """
    full = normalize_skill_label(skill_name)
    if len(full) < 3 and full not in {"c++", "c#", "go"}:
        return "", None
    bare: str | None = None
    if "(" in skill_name:
        candidate = prepare_text(skill_name.split("(", 1)[0])
        if candidate and candidate.lower() != full and (len(candidate) >= 3 or candidate.lower() in {"c++", "c#", "go"}):
            bare = candidate
    return full, bare


def _find(haystack: str, needle: str) -> tuple[int, int] | None:
    match = re.search(rf"{_LEFT_GUARD}{re.escape(needle)}{_RIGHT_GUARD}", haystack)
    return match.span() if match else None


def _bare_form_present(prepared: str, bare: str) -> tuple[int, int] | None:
    """Locate the pre-parenthetical form CASE-SENSITIVELY, or None.

    The parenthetical exists to disambiguate, so stripping it puts the ambiguity
    straight back: matched case-insensitively against prod JDs, this produced
    "Tracking (Commercial Airline Flight)" and "Scheme (Programming Language)"
    on a software role and "Derivatives" on a microfinance sales role.

    Document frequency does not separate these — `python` appears in 13.7% of
    prod JDs and `tracking` in 6.6%, so the false positive is RARER than the
    true one. Word sense is not a frequency property. Case is the signal that is
    actually available: a posting writes "Python" and "Finacle" capitalised
    mid-sentence and writes "tracking", "scheme" and "track" in lower case. Only
    this weaker form pays the tax; full taxonomy names stay case-insensitive.
    """
    return _find(prepared, bare)


@lru_cache(maxsize=1)
def _term_index() -> dict[str, tuple[tuple[LightcastSkill, str, str | None], ...]]:
    """First-token → (skill, full term, bare term), longest name first.

    Testing 35,108 regexes against every job is what turns a corpus backfill
    from minutes into hours. A term can only be present if its FIRST token is
    present, so bucketing by that token is an exact prefilter — it changes the
    cost, never the answer.
    """
    buckets: dict[str, list[tuple[LightcastSkill, str, str | None]]] = {}
    for skill in sorted(get_all_skills(), key=lambda item: len(item.name), reverse=True):
        full, bare = _skill_terms(skill.name)
        if not full:
            continue
        entry = (skill, full, bare)
        tokens = {full.split(" ", 1)[0]}
        if bare:
            tokens.add(bare.lower().split(" ", 1)[0])
        for token in tokens:
            buckets.setdefault(token, []).append(entry)
    return {token: tuple(entries) for token, entries in buckets.items()}


def _lookup_tokens(lowered: str) -> set[str]:
    """Index keys to probe for one document.

    A word ending a sentence arrives as "python." because the dot is a legal
    intra-token character, and "python." is not an index key — so the edge forms
    are probed too. Without this every skill named at the end of a sentence is
    invisible to the prefilter, whatever the matcher would have said.
    """
    tokens: set[str] = set()
    for piece in lowered.split(" "):
        if not piece:
            continue
        tokens.add(piece)
        trimmed = piece.strip(".-")
        if trimmed:
            tokens.add(trimmed)
    return tokens


def _zone_blocks(job_description: str) -> tuple[str, str]:
    """(must-have block, preferred block) — the two labelled regions of a JD.

    A heading claims the lines beneath it, because postings list the skills they
    gate on UNDER "Requirements" rather than on the same line. The claim ends at
    a blank line (the document's own block separator), at the next heading, or
    after `_ZONE_BLOCK_MAX_LINES` for postings written as one unbroken blob.
    Text under no heading belongs to neither region; its skills are `mentioned`.
    """
    must: list[str] = []
    preferred: list[str] = []
    current: list[str] | None = None
    claimed = 0
    for raw in job_description.splitlines():
        line = raw.strip()
        if not line:
            current = None
            continue
        is_must = _MUST_HAVE_HINT.search(line) is not None
        is_preferred = _PREFERRED_HINT.search(line) is not None
        # "Preferred qualifications" matches both patterns; the weaker claim
        # wins, or every optional block would read as a gate.
        if is_preferred or is_must:
            current = preferred if is_preferred else must
            claimed = 0
        elif current is not None and claimed >= _ZONE_BLOCK_MAX_LINES:
            current = None
        if current is not None:
            current.append(line)
            claimed += 1
    return prepare_text("\n".join(must)), prepare_text("\n".join(preferred))


def _locate(prepared: str, lowered: str, full: str, bare: str | None) -> tuple[int, int] | None:
    """Where this skill occurs, or None. Full name first, then the bare form."""
    return _find(lowered, full) or (_bare_form_present(prepared, bare) if bare else None)


def extract_skills(
    role_name: str,
    job_description: str,
    *,
    limit: int = DEFAULT_LIMIT,
) -> list[ExtractedSkill]:
    """Taxonomy skills present in a job, strongest evidence first.

    Deterministic and pure — the same text always yields the same skills, which
    is what lets a user be told *why* a skill is listed ("it is in their
    must-have section") instead of being asked to trust a model.

    Longest name wins its span: "Business Transformation" claims the words, so
    "Transformation (Genetics)" cannot also claim them. Without that suppression
    a consulting role is tagged with a genetics skill, which is how a taxonomy
    stops being believable.

    ``limit`` caps each zone rather than the total, so a job listing many
    must-haves does not crowd out the preferred skills it also names.
    """
    prepared = prepare_text(f"{role_name}\n{job_description}")
    if not prepared:
        return []
    lowered = prepared.lower()
    must_block, preferred_block = _zone_blocks(job_description)
    must_lower, preferred_lower = must_block.lower(), preferred_block.lower()

    index = _term_index()
    seen: set[str] = set()
    claimed: list[tuple[int, int]] = []
    by_zone: dict[str, list[ExtractedSkill]] = {"must_have": [], "preferred": [], "mentioned": []}

    candidates: list[tuple[LightcastSkill, str, str | None]] = []
    for token in _lookup_tokens(lowered):
        candidates.extend(index.get(token, ()))
    candidates.sort(key=lambda item: len(item[0].name), reverse=True)

    for skill, full, bare in candidates:
        if skill.name in seen:
            continue
        span = _locate(prepared, lowered, full, bare)
        if span is None:
            continue
        if any(span[0] < end and start < span[1] for start, end in claimed):
            continue
        seen.add(skill.name)
        claimed.append(span)
        if _locate(must_block, must_lower, full, bare):
            zone: Zone = "must_have"
        elif _locate(preferred_block, preferred_lower, full, bare):
            zone = "preferred"
        else:
            zone = "mentioned"
        by_zone[zone].append(
            ExtractedSkill(
                taxonomy_key=skill.name,
                zone=zone,
                required_level=_LEVEL_BY_ZONE[zone],
                confidence=_CONFIDENCE_BY_ZONE[zone],
            )
        )

    ordered: list[ExtractedSkill] = []
    for zone in ("must_have", "preferred", "mentioned"):
        found = sorted(by_zone[zone], key=lambda item: (-len(item.taxonomy_key), item.taxonomy_key))
        ordered.extend(found[:limit])
    return ordered


def merge_zones(skills: list[ExtractedSkill]) -> list[ExtractedSkill]:
    """Collapse duplicate taxonomy keys, strongest zone winning.

    ``job_skills`` is UNIQUE (job_id, skill_id); a duplicate inside one upsert
    batch is a Postgres error, not a silent dedupe. Callers that concatenate
    several extractions for one job must pass through here first.
    """
    best: dict[str, ExtractedSkill] = {}
    for skill in skills:
        current = best.get(skill.taxonomy_key)
        if current is None or _ZONE_RANK[skill.zone] > _ZONE_RANK[current.zone]:
            best[skill.taxonomy_key] = skill
    return sorted(
        best.values(),
        key=lambda item: (-_ZONE_RANK[item.zone], -len(item.taxonomy_key), item.taxonomy_key),
    )


def suggest_skills(
    role_name: str, job_description: str, limit: int = DEFAULT_LIMIT
) -> dict[str, list[dict[str, Any]]]:
    """Extension-preview shape over the same extraction.

    Primary is what the posting gates on; secondary is everything else it names.
    One extractor, so the skills a contributor confirms in the popup are the
    same skills the matcher will later rank.
    """
    found = extract_skills(role_name, job_description, limit=limit)

    def _shape(skill: ExtractedSkill) -> dict[str, Any]:
        return {
            "label": skill.taxonomy_key,
            "taxonomy_key": skill.taxonomy_key,
            "confidence": skill.confidence,
        }

    return {
        "primary_skills": [_shape(s) for s in found if s.is_must_have][:limit],
        "secondary_skills": [_shape(s) for s in found if not s.is_must_have][:limit],
        "emerging_skills": [],
    }
