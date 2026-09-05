"""Server-side field backstop for extension job imports.

The extension extracts role/company/location client-side (JSON-LD → OG → portal
selectors → validated title-parse). When a field is still missing or only weakly
sourced it sets ``needs_backstop`` — this module fills the gaps from the supplied
JSON-LD and, failing that, an LLM read of the JD. It also re-validates every
field so junk like ``"Job ID: 10426211"`` never reaches the importer.

Fail-soft: the LLM step is best-effort. If the provider errors we keep the
client values — the backstop never blocks a preview.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.services.job_file_parser import JobFileParseError, extract_job_from_text
from app.services.llm_provider import get_llm_provider

logger = logging.getLogger(__name__)

_GENERIC_COMPANY = {
    "jobs", "careers", "job", "apply", "home", "search", "linkedin", "indeed",
    "naukri", "glassdoor", "amazon.jobs", "workday", "greenhouse",
}
# Function/department nouns. A "company" whose EVERY word is one of these is an
# internal team name leaking out of the JD ("Sales Strategy", "Digital
# Transformation Team"), not an employer — real employers carry a proper noun.
# Caught live 2026-07-14: LinkedIn import stored company "Sales Strategy" for a
# Deloitte posting ("the USI Sales Strategy and Transformation team…").
_TEAM_WORDS = {
    "sales", "strategy", "marketing", "growth", "transformation", "team",
    "digital", "customer", "consulting", "operations", "product", "products",
    "engineering", "data", "insights", "analytics", "design", "technology",
    "cloud", "platform", "innovation", "delivery", "enablement", "success",
    "experience", "talent", "people", "finance", "commercial", "business",
    "development", "management", "services", "solutions", "practice", "unit",
    "group", "department", "division", "global", "regional", "enterprise",
    "and", "of", "the", "&",
}
# Words that mean "we did not find one". They are not values, and every one of
# them passed all three validators — `is_valid_location("unknown")` was True, so
# the string reached the card and printed as the job's location on 6 of the 20
# extension imports in prod. A placeholder must fail validation so the backstop
# re-derives the field instead of trusting it.
_PLACEHOLDER = {
    "unknown", "unknown company", "n/a", "na", "none", "null", "nil", "-", "--",
    "not specified", "not available", "not disclosed", "tbd", "undisclosed",
}

_JOB_ID_RE = re.compile(r"^(job|req|requisition|posting)\s*(id|#|number)?\b", re.I)
_NUMERIC_RE = re.compile(r"^[\d\s.,#:/-]+$")
_URL_RE = re.compile(r"^https?://", re.I)

# A genuine job title almost always carries a role noun. When one is present the
# title is trusted as-is; only titles WITHOUT one can be flagged as taglines.
_ROLE_NOUNS = {
    "manager", "engineer", "developer", "analyst", "lead", "director", "officer",
    "specialist", "consultant", "designer", "associate", "executive", "head",
    "intern", "coordinator", "architect", "scientist", "representative", "agent",
    "administrator", "technician", "strategist", "vp", "president", "founder",
    "recruiter", "marketer", "accountant", "nurse", "teacher", "assistant",
    "supervisor", "advisor", "adviser", "partner", "principal", "fellow",
    "apprentice", "trainee", "clerk", "operator", "planner", "controller",
    "auditor", "counsel", "attorney", "paralegal", "writer", "editor",
    "producer", "chef", "cook", "driver", "pilot", "electrician", "plumber",
    "mechanic", "technologist", "practitioner", "therapist", "pharmacist",
    "physician", "surgeon", "dentist", "teller", "cashier", "salesperson",
    "seller", "buyer", "broker", "trader", "underwriter", "actuary",
    "statistician", "researcher", "instructor", "professor", "tutor", "coach",
    "chief", "evangelist", "advocate", "ambassador", "liaison", "generalist",
    "bdr", "sdr", "ae", "cto", "ceo", "cfo", "coo", "cmo", "cio", "hacker",
}
# Marketing-page headlines/CTAs start with an imperative verb. A "title" that
# opens with one and carries no role noun is a product tagline, not a role
# ("Accelerate Your Hiring Process" — MOPID's OG title leaked in as the role).
_MARKETING_VERBS = {
    "accelerate", "boost", "hire", "find", "discover", "unlock", "transform",
    "grow", "scale", "simplify", "streamline", "empower", "get", "join", "meet",
    "welcome", "introducing", "start", "create", "power", "supercharge",
    "elevate", "drive", "achieve", "reach", "build", "launch", "explore",
    "try", "book", "learn", "see", "make",
}


def _is_tagline_role(value: Any) -> bool:
    """True when a *valid-looking* role reads like a marketing tagline rather
    than a job title — an OG/page-title headline that slipped past ``is_valid_role``.
    Conservative: any role carrying a real role noun is never a tagline."""
    words = re.findall(r"[a-z]+", _clean(value).lower())
    if not words or any(w in _ROLE_NOUNS for w in words):
        return False
    if "your" in words or "you" in words:  # taglines address the reader
        return True
    return words[0] in _MARKETING_VERBS  # imperative headline


def _clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def is_valid_company(value: Any) -> bool:
    t = _clean(value)
    if len(t) < 2 or len(t) > 80:
        return False
    if t.lower() in _PLACEHOLDER:
        return False
    if _JOB_ID_RE.match(t) or _NUMERIC_RE.match(t) or _URL_RE.match(t):
        return False
    if t.lower() in _GENERIC_COMPANY:
        return False
    words = re.findall(r"[a-z&]+", t.lower())
    if words and all(w in _TEAM_WORDS for w in words):
        return False  # pure function-noun phrase = team name, not an employer
    return True


def is_valid_role(value: Any) -> bool:
    t = _clean(value)
    if t.lower() in _PLACEHOLDER:
        return False
    return 2 <= len(t) <= 160 and not _URL_RE.match(t) and not _JOB_ID_RE.match(t)


def is_valid_location(value: Any) -> bool:
    t = _clean(value)
    if t.lower() in _PLACEHOLDER:
        return False
    return 2 <= len(t) <= 120 and not _URL_RE.match(t)


def _json_ld_field(json_ld: dict[str, Any] | None, key: str) -> str:
    if not isinstance(json_ld, dict):
        return ""
    return _clean(json_ld.get(key))


async def backfill_fields(
    *,
    role_name: str | None,
    company_name: str | None,
    location: str | None,
    job_description: str,
    json_ld: dict[str, Any] | None = None,
    needs_backstop: bool = False,
) -> dict[str, str | None]:
    """Return validated/filled {role_name, company_name, location}.

    Order per field: client value (if valid) → JSON-LD → LLM read of the JD.
    The LLM is only invoked when something is still missing AND there is enough
    JD text to read.
    """
    role = _clean(role_name) if is_valid_role(role_name) else ""
    company = _clean(company_name) if is_valid_company(company_name) else ""
    loc = _clean(location) if is_valid_location(location) else ""

    # A role that passed is_valid_role but reads like a page tagline is treated
    # as unresolved — re-derived from JSON-LD, then the JD, before being trusted.
    role_suspicious = bool(role) and _is_tagline_role(role)

    # Cheap structured fill/repair before any LLM.
    if not role or role_suspicious:
        cand = _json_ld_field(json_ld, "roleName")
        if is_valid_role(cand) and not _is_tagline_role(cand):
            role, role_suspicious = cand, False
    if not company:
        cand = _json_ld_field(json_ld, "companyName")
        if is_valid_company(cand):
            company = cand
    if not loc:
        cand = _json_ld_field(json_ld, "location")
        if is_valid_location(cand):
            loc = cand

    missing = (not role) or (not company) or (not loc)
    if (needs_backstop or missing or role_suspicious) and len(job_description.strip()) >= 80:
        try:
            parsed = await extract_job_from_text(job_description, get_llm_provider())
        except JobFileParseError as exc:
            logger.warning("metric import.backstop_failed reason=llm error=%s", exc)
        else:
            cand = _clean(parsed.get("role"))
            # Fill an empty role, or swap a tagline for a real (non-tagline) one.
            if is_valid_role(cand) and (not role or (role_suspicious and not _is_tagline_role(cand))):
                role = cand
            if not company and is_valid_company(parsed.get("company")):
                company = _clean(parsed["company"])
            if not loc and is_valid_location(parsed.get("location")):
                loc = _clean(parsed["location"])

    return {
        "role_name": role or None,
        "company_name": company or None,
        "location": loc or None,
    }
