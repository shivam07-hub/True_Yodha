"""The yardstick: every job a careful human would shortlist, from the whole corpus.

Slow and uncapped on purpose. Production has to be fast, so it bounds what it
considers; this bounds nothing and reads all ~39k live listings in pages. What
it produces is not a feed — it is the answer key the feed is marked against.

Independent of production by construction:

  * scores from `jobs.main_skills` (the array on the row), never the
    `job_skills` join the matcher ranks on
  * re-states the experience rule in its own terms instead of importing
    `job_eligibility`
  * has no notion of a candidate pool, a cache, or a shortlist size

The rules below were not invented. They are what a human actually did when they
built three shortlists by hand, written down:

  1. The employer's STATED range decides the level, not the title. NPCI's
     "Senior Associate" asks for 2-6 years; Paytm's "Senior Software Engineer"
     asks for 2-5. Both are mid roles wearing a senior word.
  2. A listing with NO level stated is a candidate, not a reject. Production
     hides 9,323 of these; a human reads the title and decides. Keeping them
     here is what makes that gap measurable instead of invisible.
  3. Relevance is the chosen direction OR a title a human would recognise —
     "Payments Planning and Analysis Developer" belongs on a payments
     engineer's list and sits in no family she picked.
  4. Soft skills never make a job relevant (see `profile.py`).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from quality.profile import CandidateProfile

logger = logging.getLogger(__name__)

_PAGE = 1000
_COLUMNS = (
    "job_id, job_title, company_name, location_country, location_city, "
    "seniority_level, min_years_experience, max_years_experience, "
    "role_family, career_band, main_skills, apply_url, last_verified_live_at"
)
# Slack on both ends of an employer's range. A 3.2-year candidate is a real
# applicant to "4+ years" and to "1-3 years"; a hard boundary would grade
# production against a stricter rule than any recruiter applies.
_YEARS_SLACK = 1.0


@dataclass(frozen=True)
class ReferenceHit:
    job_id: str
    title: str
    company: str
    overlap: int
    level_stated: bool
    on_direction: bool
    reason: str

    @property
    def rank_key(self) -> tuple:
        # Direction first, then evidence, then a stable id — never recency: the
        # corpus's own dates were unreliable for months and a yardstick must not
        # inherit that.
        return (not self.on_direction, -self.overlap, self.job_id)


def fetch_corpus(db: Any, *, countries: frozenset[str] = frozenset()) -> list[dict[str, Any]]:
    """Every live, applyable listing. Paged — a silent 1,000-row stop here would
    quietly shrink the answer key and flatter production.

    Keyset-paged on `job_id`, not `.range()`. An OFFSET walks every row it skips,
    so page 30 of 39 re-scanned 30,000 rows and tripped the statement timeout
    mid-run: the yardstick failed to build at all, which reads like a broken gate
    rather than a slow read. `job_id > last` is one index seek per page.
    """
    rows: list[dict[str, Any]] = []
    after: str | None = None
    while True:
        query = (
            db.table("jobs")
            .select(_COLUMNS)
            .eq("is_active", True)
            .eq("listing_confidence", "active")
            .not_.is_("apply_url", "null")
            .order("job_id")
            .limit(_PAGE)
        )
        if after is not None:
            query = query.gt("job_id", after)
        if countries:
            query = query.in_("location_country", sorted(countries))
        page = query.execute().data or []
        rows.extend(page)
        if len(page) < _PAGE:
            return rows
        after = page[-1]["job_id"]


def level_fits(profile: CandidateProfile, job: dict[str, Any]) -> tuple[bool, bool]:
    """(fits, level_was_stated) — the employer's range wins over the title word."""
    low = job.get("min_years_experience")
    high = job.get("max_years_experience")
    years = profile.years_experience

    if low is not None or high is not None:
        if low is not None and years + _YEARS_SLACK < float(low):
            return False, True
        if high is not None and years - _YEARS_SLACK > float(high):
            return False, True
        return True, True

    # Nothing stated. The title's own word is all there is, and "untagged" is
    # not a rejection — see rule 2 in the module docstring.
    tag = (job.get("seniority_level") or "").strip().lower()
    if not tag:
        return True, False
    senior_words = {"senior", "lead", "principal", "staff", "executive", "director"}
    if tag in senior_words and years < 5:
        return False, True
    if tag in {"intern"}:
        return False, True
    return True, True


def is_relevant(profile: CandidateProfile, job: dict[str, Any]) -> tuple[bool, str]:
    family = (job.get("role_family") or "").strip()
    if family and family in profile.direction_families:
        return True, "direction"
    title = (job.get("job_title") or "").lower()
    for word in profile.role_keywords:
        if word.lower() in title:
            return True, f"title:{word}"
    if profile.overlap(job.get("main_skills")) >= 3:
        return True, "skills"
    return False, ""


# Rule 5 of the hand-built shortlists, which the first version of this file
# forgot to write down: at most two roles per employer, and one row per
# (employer, title). A human handed nobody five Google requisitions — two
# requisitions with the same title read as one job to a person, and an employer
# that posts 300 roles would otherwise eat the whole list.
#
# Leaving it out did not make the yardstick stricter, it made it DIFFERENT, and
# recall then measured rule disagreement rather than quality: three of the forty
# were Google roles the retrieval was never permitted to admit, so they counted
# as unreachable while the product was obeying a rule the yardstick shared.
_PER_COMPANY = 2


def shortlist(
    profile: CandidateProfile, corpus: list[dict[str, Any]], *, limit: int = 40
) -> list[ReferenceHit]:
    """The answer key: what this person should be shown, best first."""
    hits: list[ReferenceHit] = []
    for job in corpus:
        title = (job.get("job_title") or "").lower()
        if any(word in title for word in profile.exclude_title_words):
            continue
        fits, stated = level_fits(profile, job)
        if not fits:
            continue
        relevant, reason = is_relevant(profile, job)
        if not relevant:
            continue
        hits.append(ReferenceHit(
            job_id=str(job.get("job_id") or ""),
            title=job.get("job_title") or "",
            company=job.get("company_name") or "",
            overlap=profile.overlap(job.get("main_skills")),
            level_stated=stated,
            on_direction=reason == "direction",
            reason=reason,
        ))
    hits.sort(key=lambda h: h.rank_key)

    kept: list[ReferenceHit] = []
    seen_titles: set[tuple[str, str]] = set()
    per_company: dict[str, int] = {}
    for hit in hits:
        company = hit.company.strip().lower()
        title_key = (company, hit.title.strip().lower())
        if title_key in seen_titles:
            continue
        if per_company.get(company, 0) >= _PER_COMPANY:
            continue
        seen_titles.add(title_key)
        per_company[company] = per_company.get(company, 0) + 1
        kept.append(hit)
        if len(kept) == limit:
            break
    return kept
