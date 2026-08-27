"""Deterministic Career Band and seniority gates for jobs.

Both browse and Career Ops call this module before a job can be ranked.  It
deliberately has no model dependency: a client preference or LLM verdict cannot
silently widen a candidate's role family or job level.
"""
from __future__ import annotations

import re
from typing import Any, Literal

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
    """Derive every distinct role family a candidate explicitly targeted."""
    titles = profile.get("target_role_titles") or []
    if isinstance(titles, str):
        titles = [titles]
    bands: list[CareerBand | str] = []
    for title in [*titles, profile.get("target_role_title"), *(profile.get("target_roles") or [])]:
        if isinstance(title, str) and title.strip():
            band = career_band_for_job({"job_title": title})
            if band and band not in bands:
                bands.append(band)
    return bands


def explored_bands_for_profile(profile: dict[str, Any], *, primary: str) -> list[CareerBand | str]:
    """Preserve explicit exploration and include additional saved target roles."""
    bands: list[CareerBand | str] = []
    for value in [*_as_list(profile.get("explored_career_bands")), *career_bands_for_profile(profile)]:
        band = _career_band(value)
        if band and band != primary and band not in bands:
            bands.append(band)
    return bands


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


def job_is_eligible(
    profile: dict[str, Any],
    job: dict[str, Any],
    *,
    include_stretch: bool = False,
) -> bool:
    """True only if the job is in an enabled Career Band and safe level range."""
    primary = career_band_for_profile(profile)
    if not primary:
        return False
    explored = set(explored_bands_for_profile(profile, primary=primary))
    if career_band_for_job(job) not in {primary, *explored}:
        return False
    return seniority_is_eligible(
        target_seniority_for_profile(profile),
        seniority_for_job(job),
        include_stretch=include_stretch,
    )


def job_is_browse_eligible(
    profile: dict[str, Any],
    job: dict[str, Any],
    *,
    include_stretch: bool = False,
) -> bool:
    """Family-span browse at the candidate's canonical seniority, or nothing.

    Without a six-band target the gate owns the next step — this function does
    not invent entry-level eligibility from ``any`` or a missing field.
    """
    if career_band_for_profile(profile):
        return job_is_eligible(profile, job, include_stretch=include_stretch)
    return seniority_is_eligible(
        target_seniority_for_profile(profile),
        seniority_for_job(job),
        include_stretch=include_stretch,
    )


def seniority_is_eligible(target: str, actual: str, *, include_stretch: bool = False) -> bool:
    """Apply the strict default and explicit one-level stretch policy."""
    target = canonical_source_seniority(target)
    if target not in SOURCE_SENIORITY:
        return False
    if actual not in _SENIORITY_RANK:
        return False
    allowed = {
        "intern": {"intern", "entry"},
        "entry": {"intern", "entry"},
        "mid": {"entry", "mid"},
        "senior": {"mid", "senior"},
        "lead": {"senior", "lead"},
        "executive": {"lead", "executive"},
    }[target].copy()
    if include_stretch and target != "executive":
        allowed.add(next(level for level, rank in _SENIORITY_RANK.items() if rank == _SENIORITY_RANK[target] + 1))
    return actual in allowed


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
