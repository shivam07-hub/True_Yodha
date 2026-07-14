"""reservoir_identity — foreign-document guard for Career Reservoir ingest.

A bulk dump folder can contain OTHER people's CVs (collected candidate CVs,
shared samples, forwarded resumes). Extracting those pollutes the user's career
profile with someone else's roles and stories — the 2026-07-13 `Shivam_CV_Base`
dump landed 21 foreign roles / 71 foreign stories exactly this way, and story
dedup can never catch it (different humans are not duplicates).

Deterministic, fail-open guard. An entry is skipped ONLY when all three hold:

  1. we positively know the user's identity (profile full_name/email, or the
     contact block of their latest baseline CV),
  2. the document declares a confident owner name near the top whose tokens
     share nothing with any known name, and
  3. the document's contact window contains at least one email — none of which
     is a known email.

Any ambiguity → ingest. A false skip silently loses real user data; a false
pass merely re-creates the pre-guard status quo, curable by archive.
"""
from __future__ import annotations

import re
from typing import Any

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Words that disqualify a top-of-document line from being a person's name —
# CV section headings, job-title nouns, org-form suffixes.
_NOT_A_NAME = {
    "summary", "objective", "resume", "curriculum", "vitae", "profile",
    "experience", "education", "skills", "contact", "projects", "project",
    "achievements", "certifications", "certificates", "awards", "languages",
    "professional", "career", "personal", "about", "overview", "highlights",
    "manager", "engineer", "engineering", "consultant", "consulting",
    "developer", "analyst", "executive", "director", "lead", "intern",
    "specialist", "architect", "scientist", "designer", "officer", "head",
    "associate", "senior", "junior", "trainee", "freelance",
    "university", "institute", "college", "school", "academy",
    "technologies", "technology", "solutions", "services", "systems",
    "analytics", "insights", "digital", "global", "enterprises", "industries",
    "pvt", "ltd", "llp", "inc", "limited", "corp", "corporation", "company",
    "marketing", "sales", "strategy", "operations", "finance", "product",
    "data", "business", "development", "management", "resources",
}

# How far into the document we look. Names sit in the header; emails sit in the
# contact block. A references section further down must not vote.
_NAME_LINE_WINDOW = 8
_EMAIL_CHAR_WINDOW = 4000


def doc_emails(text: str) -> set[str]:
    """Lowercased emails in the document's contact window."""
    return {m.lower() for m in _EMAIL_RE.findall((text or "")[:_EMAIL_CHAR_WINDOW])}


def candidate_names(text: str) -> list[str]:
    """Confident person-name lines from the top of the document: 2–4 alphabetic
    words, each capitalized, none a CV-heading/title/org word."""
    names: list[str] = []
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    for line in lines[:_NAME_LINE_WINDOW]:
        if len(line) > 40:
            continue
        words = [w.strip(".,") for w in line.split()]
        if not 2 <= len(words) <= 4:
            continue
        if not all(w.isalpha() and len(w) >= 2 and w[0].isupper() for w in words):
            continue
        if any(w.lower() in _NOT_A_NAME for w in words):
            continue
        names.append(" ".join(words))
    return names


def _name_tokens(name: str) -> set[str]:
    return {t for t in re.findall(r"[a-z]+", (name or "").lower()) if len(t) >= 3}


def names_match(a: str, b: str) -> bool:
    """Same person signal: the two names share at least one substantial token
    ('Shivam Pathak' ~ 'Shivam Kumar Pathak'; 'Rishabh Guha' ≁ 'Shivam Pathak')."""
    return bool(_name_tokens(a) & _name_tokens(b))


def classify(text: str, known_names: set[str], known_emails: set[str]) -> str:
    """'own' | 'foreign' | 'unknown' (unknown → ingest, fail-open)."""
    emails = doc_emails(text)
    lowered_known = {e.lower() for e in known_emails if e}
    if emails & lowered_known:
        return "own"
    names = candidate_names(text)
    usable_known = [n for n in known_names if _name_tokens(n)]
    if not names or not usable_known:
        return "unknown"
    if any(names_match(doc, known) for doc in names for known in usable_known):
        return "own"
    # Confident mismatching owner name — require foreign email evidence too.
    return "foreign" if emails else "unknown"


def known_identity(user_id: str) -> tuple[set[str], set[str]]:
    """The user's known (names, emails) from their profile and latest baseline
    CV contact block. Fail-open: any read error → empty sets → guard stands down."""
    names: set[str] = set()
    emails: set[str] = set()
    try:
        from app.database import get_supabase_admin
        from app.db_safe import safe_read

        admin = get_supabase_admin()
        profile = safe_read(
            admin.table("user_profiles").select("full_name, email").eq("id", user_id).maybe_single(),
            default=None,
            context="reservoir_identity_profile",
        )
        if profile:
            if profile.get("full_name"):
                names.add(str(profile["full_name"]))
            if profile.get("email"):
                emails.add(str(profile["email"]).lower())

        from app.repositories.cv import CVVersionsRepository

        baseline = CVVersionsRepository(admin).latest_baseline(user_id)
        contact: dict[str, Any] = ((baseline or {}).get("cv_structured") or {}).get("contact") or {}
        if contact.get("name"):
            names.add(str(contact["name"]))
        if contact.get("email"):
            emails.add(str(contact["email"]).lower())
    except Exception:  # noqa: BLE001 — identity fetch is best-effort; guard fails open
        pass
    return names, emails


def classify_entry(entry: dict[str, Any], user_id: str) -> str:
    """Guard verdict for one cv_dump_entries row."""
    names, emails = known_identity(user_id)
    return classify(entry.get("text") or "", names, emails)
