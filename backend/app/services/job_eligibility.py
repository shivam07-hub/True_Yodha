"""Deterministic Career Band and seniority gates for jobs.

Both browse and Career Ops call this module before a job can be ranked.  It
deliberately has no model dependency: a client preference or LLM verdict cannot
silently widen a candidate's role family or job level.
"""
from __future__ import annotations

import re
from typing import Any, Literal

from app.schemas.jobs import SeniorityCompat

CareerBand = Literal[
    "engineering_data",
    "business_product_operations",
    "research_people_public_impact",
    "design_creative",
]

CAREER_BANDS = frozenset({
    "engineering_data",
    "business_product_operations",
    "research_people_public_impact",
    "design_creative",
})
_SENIORITY_RANK = {
    "intern": 0,
    "entry": 1,
    "mid": 2,
    "senior": 3,
    "lead": 4,
    "executive": 5,
}
SOURCE_SENIORITY = frozenset(_SENIORITY_RANK)
_SENIORITY_ALIASES = {
    "junior": "entry",
    "graduate": "entry",
    "director": "executive",
    "vp": "executive",
    "internship": "intern",
}
_ROLE_DOMAIN_BANDS = {
    "software engineering": "engineering_data",
    "data & analytics": "engineering_data",
    "it & infrastructure": "engineering_data",
    "manufacturing": "engineering_data",
    "finance": "business_product_operations",
    "strategy & consulting": "business_product_operations",
    "sales & marketing": "business_product_operations",
    "operations": "business_product_operations",
    "product management": "business_product_operations",
    "risk & compliance": "business_product_operations",
    "general management": "business_product_operations",
    "supply chain": "business_product_operations",
    "research & science": "research_people_public_impact",
    "hr & people": "research_people_public_impact",
    "legal & compliance": "research_people_public_impact",
}

_DESIGN_TITLE = re.compile(
    r"\b(?:ux|ui|product|graphic|visual|brand|motion|content|creative)\s+"
    r"(?:designer|design|writer|artist|illustrator)\b|\b(?:ux|ui)\b",
    re.IGNORECASE,
)
_TECHNICAL_TITLE = re.compile(
    r"\b(?:software|data|machine learning|ai|devops|sre|cloud|cyber|security|"
    r"qa|quality assurance|platform|backend|front[ -]?end|full[ -]?stack|"
    r"engineer|developer|programmer|architect|infrastructure|manufacturing|"
    r"embedded|systems?)\b",
    re.IGNORECASE,
)
_BUSINESS_TITLE = re.compile(
    r"\b(?:product manager|marketing|sales|finance|consultant|consulting|strategy|"
    r"operations|business analyst|supply chain|procurement|revenue|account executive|"
    r"partnerships?|growth)\b",
    re.IGNORECASE,
)
_PUBLIC_IMPACT_TITLE = re.compile(
    r"\b(?:research|policy|public affairs|government relations|social impact|"
    r"human resources|\bhr\b|people|talent|legal|counsel|compliance|community|"
    r"education|programme? officer)\b",
    re.IGNORECASE,
)


def career_band_for_job(job: dict[str, Any]) -> CareerBand | str:
    """Resolve a job's source band, preserving explicit title facts over domain."""
    stored = _career_band(job.get("career_band"))
    if stored:
        return stored
    title_band = _career_band_from_title(_title(job))
    if title_band:
        return title_band
    return _ROLE_DOMAIN_BANDS.get(_text(job.get("role_domain")), "")


def career_band_for_profile(profile: dict[str, Any]) -> CareerBand | str:
    """Return the persisted band or a deterministic target-role fallback."""
    stored = _career_band(profile.get("target_career_band"))
    if stored:
        return stored
    return (career_bands_for_profile(profile) or [""])[0]


def career_bands_for_profile(profile: dict[str, Any]) -> list[CareerBand | str]:
    """Bands implied by human job titles the candidate typed.

    `target_roles` is a taxonomy family name, and so is a title slot filled from
    that family (migration 20260909120000). Neither is a job title.
    `career_band_for_job` runs title regexes, which read the label "Artificial
    Intelligence and Machine Learning (AI/ML)" as engineering because the words
    "ai" and "machine learning" occur in it. A family's bands live on
    `role_family_labels.bands`; this function does not guess them from the name.
    """
    raw_roles = profile.get("target_roles") or []
    if isinstance(raw_roles, str):
        raw_roles = [raw_roles]
    families = {name.strip() for name in raw_roles if isinstance(name, str) and name.strip()}
    titles = profile.get("target_role_titles") or []
    if isinstance(titles, str):
        titles = [titles]
    bands: list[CareerBand | str] = []
    for title in [*titles, profile.get("target_role_title")]:
        if not isinstance(title, str) or not title.strip() or title.strip() in families:
            continue
        band = career_band_for_job({"job_title": title})
        if band and band not in bands:
            bands.append(band)
    return bands


def chosen_bands_for_profile(profile: dict[str, Any]) -> list[CareerBand | str]:
    """The Career Bands the person actually said yes to — the whole answer.

    `explored_career_bands` holds every band they chose, the primary included, and
    `target_career_band` is the first of them. The primary sits in both columns on
    purpose: every caller builds the same union, so carrying it twice costs nothing
    and buys the one thing a split could not give — an EMPTY list here means
    "nobody has been asked", not "chose exactly one band". The Direction journey's
    landing rule reads that difference to decide whether to ask again, and a
    representation where one pick looks like no pick would ask everybody forever.

    It used to union the stored value with `career_bands_for_profile`, which reads
    bands off the TITLES someone typed. So saving a second target role silently
    widened the feed into a band nobody had chosen, and CONTEXT.md's rule that
    expansion is never implicit was contradicted by the writer enforcing it. A
    title is evidence about a band; it is not consent to browse one.
    """
    bands: list[CareerBand | str] = []
    for value in _as_list(profile.get("explored_career_bands")):
        band = _career_band(value)
        if band and band not in bands:
            bands.append(band)
    return bands


def eligible_bands_for_profile(profile: dict[str, Any]) -> set[CareerBand | str]:
    """Which bands this person's feed may show. Their answer, or their titles.

    ANSWERED — exactly the bands they chose, and nothing else. The band step is
    the deliberate persisted preference CONTEXT.md §Career Band Eligibility asks
    for, so once it exists nothing may widen past it.

    NOT ASKED YET — every band their stated target roles land in. Choosing a
    second target role in another band is a deliberate act and stays a valid
    cross-band route; what changed is that it is DERIVED here, at read time,
    instead of being regex'd into the stored answer on every write. Stored, it
    could not be removed — the next save re-added it — and it made a profile
    nobody had asked look answered.
    """
    chosen = set(chosen_bands_for_profile(profile))
    if chosen:
        return chosen
    derived = {band for band in career_bands_for_profile(profile) if band}
    primary = career_band_for_profile(profile)
    if primary:
        derived.add(primary)
    return derived


def canonical_source_seniority(value: Any) -> str:
    """Normalise a Firecrawl/source seniority field to one of the six bands."""
    return _seniority(value)


def adjacent_source_bands(anchor: str) -> tuple[str | None, str | None]:
    """One lower and one higher band around the chosen anchor, when they exist."""
    target = canonical_source_seniority(anchor)
    if target not in _SENIORITY_RANK:
        return None, None
    rank = _SENIORITY_RANK[target]
    lower = next((level for level, value in _SENIORITY_RANK.items() if value == rank - 1), None)
    higher = next((level for level, value in _SENIORITY_RANK.items() if value == rank + 1), None)
    return lower, higher


def seniority_for_job(job: dict[str, Any]) -> str:
    """Job-card seniority is the source field. Missing stays unknown."""
    return canonical_source_seniority(job.get("seniority_level"))


def target_seniority_for_profile(profile: dict[str, Any]) -> str:
    """Canonical six-band target, or empty. Never invents entry from ``any``."""
    target = canonical_source_seniority(profile.get("target_seniority"))
    return target if target in SOURCE_SENIORITY else ""


def reported_target_seniority(profile: dict[str, Any]) -> str | None:
    """API-facing seniority: a six-band value, ``any`` as compatibility, or omitted."""
    target = target_seniority_for_profile(profile)
    if target:
        return target
    stored = str(profile.get("target_seniority") or "").strip().lower()
    return "any" if stored == "any" else None


#: Person span when `years_experience` is null. The same six rows as
#: `candidates_for_user`. Order matches the migration so a text pin can quote it.
PERSON_YEAR_SPAN_BY_BAND: tuple[tuple[str, int, int], ...] = (
    ("intern", 0, 1),
    ("entry", 0, 2),
    ("mid", 2, 5),
    ("senior", 5, 8),
    ("lead", 8, 12),
    ("executive", 12, 40),
)
_SPAN_BY_BAND = {band: (lo, hi) for band, lo, hi in PERSON_YEAR_SPAN_BY_BAND}

#: Rejected only when the employer states no years at all and the person's
#: centre is under 5. Principal and staff are tags, not canonical bands.
SENIOR_LEVEL_TAGS: tuple[str, ...] = (
    "senior",
    "lead",
    "principal",
    "staff",
    "executive",
    "director",
)
_SENIOR_LEVEL_TAGS = frozenset(SENIOR_LEVEL_TAGS)
_OPEN_SPAN = (0.0, 40.0)
_SENIOR_TAG_CENTRE = 5.0


def person_year_span(profile: dict[str, Any]) -> tuple[float, float]:
    """The `[lo, hi]` `candidates_for_user` uses for this person.

    A known `years_experience` is `[years - 1, years + 1]`, and 0 is a real
    answer: `[−1, 1]`. None is not 0. Every account older than the column
    holds NULL, and reading that as zero would reject every listing that
    asks for 2 or more years.
    """
    years = profile.get("years_experience")
    if years is not None:
        value = float(years)
        return value - 1.0, value + 1.0
    span = _SPAN_BY_BAND.get(target_seniority_for_profile(profile))
    if span is None:
        return _OPEN_SPAN
    return float(span[0]), float(span[1])


def stated_range_admits(profile: dict[str, Any], job: dict[str, Any]) -> bool:
    """Whether this job's level fits, by the years the employer stated.

    The `cand` predicate in `candidates_for_user`: the two ranges overlap.
    A missing job bound is 0 or 40, so an unstated side does not reject.
    The seniority tag is read only when both bounds are null, and then only
    to reject a senior-side tag for a person whose centre is under 5.
    """
    lo, hi = person_year_span(profile)
    centre = (lo + hi) / 2.0
    job_lo = job.get("min_years_experience")
    job_hi = job.get("max_years_experience")
    if job_lo is None and job_hi is None:
        tag = str(job.get("seniority_level") or "").strip().casefold()
        return not (tag in _SENIOR_LEVEL_TAGS and centre < _SENIOR_TAG_CENTRE)
    low = 0.0 if job_lo is None else float(job_lo)
    high = 40.0 if job_hi is None else float(job_hi)
    return low <= hi and high >= lo


def job_is_eligible(
    profile: dict[str, Any],
    job: dict[str, Any],
    *,
    include_stretch: bool = False,
) -> bool:
    """True when the job is in an enabled Career Band and its level fits.

    Level is `stated_range_admits`, the same predicate as `candidates_for_user`.
    `include_stretch` used to admit the next seniority band. That is the bucket
    this gate stopped reading: a stated range that does not overlap stays out,
    and a flag cannot put it back. The argument remains so existing callers
    still type-check.
    """
    del include_stretch
    eligible = eligible_bands_for_profile(profile)
    if not eligible:
        return False
    if career_band_for_job(job) not in eligible:
        return False
    return stated_range_admits(profile, job)


#: What "at level" means: own level and the one below. CONTEXT.md §Seniority Fit.
_AT_LEVEL: dict[str, frozenset[str]] = {
    "intern": frozenset({"intern", "entry"}),
    "entry": frozenset({"intern", "entry"}),
    "mid": frozenset({"entry", "mid"}),
    "senior": frozenset({"mid", "senior"}),
    "lead": frozenset({"senior", "lead"}),
    "executive": frozenset({"lead", "executive"}),
}


def seniority_fit(target: str, actual: str) -> SeniorityCompat:
    """The verdict's grade of a job's tag against a target. CONTEXT.md §Seniority Fit.

    The match-run gate does not admit by this. It admits by `stated_range_admits`.
    Unreadable is `unknown`.
    """
    target = canonical_source_seniority(target)
    actual = canonical_source_seniority(actual)
    if target not in SOURCE_SENIORITY or not actual:
        return "unknown"
    return "compatible" if actual in _AT_LEVEL[target] else "incompatible"


def seniority_is_eligible(target: str, actual: str, *, include_stretch: bool = False) -> bool:
    """Band-adjacency reading of two seniority tags. Not the match-run gate.

    The match run and `/market` admit by `stated_range_admits`. This function
    remains because `seniority_fit` — the verdict's grade — is this same set
    with stretch off, and the two are pinned together in tests. Calling it to
    decide whether a job enters the pool puts the tag back in front of a
    stated "2-6 years".

    An unreadable job tag is admitted here. An unreadable target is not.
    `include_stretch` is the band above, still graded `incompatible`.
    """
    fit = seniority_fit(target, actual)
    if fit == "unknown":
        # An unreadable TARGET (legacy `any`) still admits nothing: a blank
        # answer is never silently read as `entry`.
        return canonical_source_seniority(target) in SOURCE_SENIORITY
    _below, above = adjacent_source_bands(target)
    return fit == "compatible" or (include_stretch and canonical_source_seniority(actual) == above)


def _career_band_from_title(title: str) -> CareerBand | str:
    if _DESIGN_TITLE.search(title):
        return "design_creative"
    if _TECHNICAL_TITLE.search(title):
        return "engineering_data"
    if _BUSINESS_TITLE.search(title):
        return "business_product_operations"
    if _PUBLIC_IMPACT_TITLE.search(title):
        return "research_people_public_impact"
    return ""


def _seniority(value: Any) -> str:
    text = _text(value)
    return _SENIORITY_ALIASES.get(text, text) if text in _SENIORITY_RANK or text in _SENIORITY_ALIASES else ""


def _career_band(value: Any) -> CareerBand | str:
    text = _text(value)
    return text if text in CAREER_BANDS else ""


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _title(job: dict[str, Any]) -> str:
    return str(job.get("job_title") or job.get("title") or "")


def _text(value: Any) -> str:
    return str(value or "").strip().casefold()
