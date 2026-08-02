"""Deterministic Career Band and seniority gates for jobs.

Both browse and Career Ops call this module before a job can be ranked.  It
deliberately has no model dependency: a client preference or LLM verdict cannot
silently widen a candidate's role family or job level.
"""
from __future__ import annotations

import math
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
_SENIORITY_ALIASES = {
    "junior": "entry",
    "graduate": "entry",
    "director": "executive",
    "vp": "executive",
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
_EXECUTIVE_TITLE = re.compile(r"\b(?:chief|vice president|vp|director)\b", re.IGNORECASE)
_LEAD_TITLE = re.compile(r"\b(?:head|principal|staff|lead)\b", re.IGNORECASE)
_SENIOR_TITLE = re.compile(r"\b(?:senior|sr)\b", re.IGNORECASE)
_MID_TITLE = re.compile(r"\b(?:manager|engineer ii|engineer 2|sde ii|sde 2|consultant)\b", re.IGNORECASE)
_ENTRY_TITLE = re.compile(r"\b(?:junior|jr|graduate|entry|associate|analyst|assistant)\b", re.IGNORECASE)
_INTERN_TITLE = re.compile(r"\b(?:intern|internship|apprentice|trainee)\b", re.IGNORECASE)


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


def seniority_for_job(job: dict[str, Any]) -> str:
    """Normalize legacy and source seniority without writing a historic row."""
    candidates = [
        _seniority(job.get("seniority_level")),
        _seniority_from_title(_title(job)),
        _seniority_from_years(_year(job.get("min_years_experience"))),
    ]
    known = [level for level in candidates if level in _SENIORITY_RANK]
    return max(known, key=_SENIORITY_RANK.__getitem__) if known else ""


def target_seniority_for_profile(profile: dict[str, Any]) -> str:
    """Return the safe target level for new and legacy candidate profiles.

    ``any`` was the historic onboarding default, not evidence that a candidate
    asked to see every level. Treat it like a missing preference so an
    untouched fresher profile defaults to the entry-level contract.
    """
    target = _seniority(profile.get("target_seniority"))
    return target if target and target != "any" else "entry"


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
    """Apply safe browse eligibility before a candidate has chosen a role family.

    An incomplete profile has no evidence for a role-family filter, but it still
    must not be shown senior or executive work. The market browse surface may
    therefore span families at the candidate's safe seniority level until they
    give Myro a target; matching remains stricter through ``job_is_eligible``.
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
    target = _seniority(target)
    if target == "any" or not target:
        target = "entry"
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


def _seniority_from_title(title: str) -> str:
    matches = [
        ("executive", _EXECUTIVE_TITLE), ("lead", _LEAD_TITLE),
        ("senior", _SENIOR_TITLE), ("mid", _MID_TITLE),
        ("entry", _ENTRY_TITLE), ("intern", _INTERN_TITLE),
    ]
    known = [level for level, pattern in matches if pattern.search(title)]
    return max(known, key=_SENIORITY_RANK.__getitem__) if known else ""


def _seniority_from_years(minimum: int | None) -> str:
    if minimum is None:
        return ""
    if minimum <= 1:
        return "entry"
    if minimum <= 4:
        return "mid"
    if minimum <= 7:
        return "senior"
    if minimum <= 10:
        return "lead"
    return "executive"


def _seniority(value: Any) -> str:
    text = _text(value)
    return _SENIORITY_ALIASES.get(text, text) if text in _SENIORITY_RANK or text in _SENIORITY_ALIASES else ""


def _career_band(value: Any) -> CareerBand | str:
    text = _text(value)
    return text if text in CAREER_BANDS else ""


def _year(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return int(parsed) if math.isfinite(parsed) and parsed.is_integer() and 0 <= parsed <= 60 else None


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _title(job: dict[str, Any]) -> str:
    return str(job.get("job_title") or job.get("title") or "")


def _text(value: Any) -> str:
    return str(value or "").strip().casefold()
