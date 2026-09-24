"""One reading of a job's level, admitted and graded the same way.

Two modules used to answer "is this job at this person's level":

  - `job_eligibility.seniority_is_eligible` — adjacency sets, returning a bool;
  - `match_credibility.seniority_compatibility` — `actual == target`.

They disagreed on six of the thirty-six target×level pairs, every one the band
BELOW the target, which the gate admits on purpose. Those jobs were let into the
pool in order to be shown and then graded `incompatible` — never `strong`, never
`worth_it`, never recommendable. 22 prod rows across 17 users. An intern was
admitted every entry job and told every one of them was the wrong level.

Separately, a missing `seniority_level` read as "no" at the gate. 26% of the live
corpus carries none — per source adapter, not at random — so a missing field
became a permanent decision to show the job to nobody. It is admitted now, on
EVERY path: pool-only admission was itself two rules in one system, and the
Match Quality gate measured the disagreement as 9,323 hidden listings.
"""
from __future__ import annotations

import itertools

import pytest

from app.services.job_eligibility import (
    SOURCE_SENIORITY,
    job_is_browse_eligible,
    job_is_eligible,
    seniority_fit,
    seniority_is_eligible,
)
from app.services.match_credibility import evaluate_credibility, seniority_compatibility

LEVELS = ("intern", "entry", "mid", "senior", "lead", "executive")

# The opt-in band above each target. Not intern: its "one above" is entry, which
# is already its own pool — intern and entry are one pool by definition.
STRETCH = (("entry", "mid"), ("mid", "senior"), ("senior", "lead"), ("lead", "executive"))

# The band below each target — the half of the adjacency rule the verdict used to
# contradict. Named, so a regression fails with the pair in the message.
BAND_BELOW = (
    ("intern", "entry"),
    ("entry", "intern"),
    ("mid", "entry"),
    ("senior", "mid"),
    ("lead", "senior"),
    ("executive", "lead"),
)


def _job(level: str | None, band: str = "business_product_operations") -> dict:
    job = {"job_id": "j", "job_title": "Analyst", "career_band": band}
    if level is not None:
        job["seniority_level"] = level
    return job


def _profile(target: str, band: str = "business_product_operations") -> dict:
    return {"target_seniority": target, "explored_career_bands": [band]}


# ── the drift guard ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("target,actual", list(itertools.product(LEVELS, LEVELS)))
def test_the_gate_and_the_verdict_never_disagree_about_at_level(target: str, actual: str) -> None:
    """Admitted without a stretch ⇔ graded compatible. For every pair.

    This is the test that did not exist. Both halves were individually tested;
    nothing asserted they agreed, so they didn't.
    """
    admitted = seniority_is_eligible(target, actual)
    graded = seniority_compatibility(target, {"seniority_level": actual})
    assert admitted == (graded == "compatible"), (
        f"{target} candidate × {actual} job: gate says {admitted}, verdict says {graded!r}"
    )


@pytest.mark.parametrize("target,actual", BAND_BELOW)
def test_the_band_below_is_at_level_not_a_mismatch(target: str, actual: str) -> None:
    assert seniority_fit(target, actual) == "compatible", f"{target}×{actual}"


def test_an_intern_is_told_an_entry_job_is_their_level() -> None:
    # The user this was found through: intern target, 25 matching jobs in NCR,
    # every one tagged entry. Each would have been graded incompatible.
    job = {**_job("entry"), "title": "Record to Report Ops Associate"}
    assert seniority_compatibility("intern", job) == "compatible"


def test_a_strong_match_one_band_below_can_now_be_recommended() -> None:
    profile = {
        **_profile("intern"),
        "baseline_version_id": 1,
        "target_role_title": "Financial Analysis",
    }
    cred = evaluate_credibility(profile, _job("entry"), overall_score=4.2, recommendation="Apply")
    assert cred.seniority_compatibility == "compatible"
    assert cred.credible is True


# ── unreadable job seniority: admitted everywhere, graded nowhere ────────────


@pytest.mark.parametrize("blank", [None, "", "  ", "Not Applicable"])
def test_an_unreadable_job_level_is_unknown_never_incompatible(blank: str | None) -> None:
    job = _job(blank)
    assert seniority_compatibility("entry", job) == "unknown"


@pytest.mark.parametrize("blank", [None, ""])
def test_every_path_admits_an_unreadable_level(blank: str | None) -> None:
    # ONE admission rule. It was briefly pool-only, and that put two rules in
    # one system: the Match Quality gate measured browse hiding 9,323 listings
    # its yardstick calls candidates, while the pool beside it admitted the very
    # same rows. Two halves that disagree about one job disagree forever.
    assert job_is_eligible(_profile("entry"), _job(blank))
    assert job_is_browse_eligible(_profile("entry"), _job(blank))


def test_admitting_an_unreadable_level_never_crosses_a_band() -> None:
    # The seniority relaxation must not become a band relaxation.
    other = _job(None, band="engineering_data")
    assert not job_is_eligible(_profile("entry"), other)


def test_an_unreadable_target_still_admits_nothing() -> None:
    # Legacy `any` is an absent answer, not `entry`. Admitting an unreadable JOB
    # is not licence to read an unreadable TARGET as a level.
    for job in (_job(None), _job("entry"), _job("executive")):
        assert not job_is_eligible(_profile("any"), job)


def test_an_unreadable_level_is_not_graded_compatible_by_the_gate() -> None:
    # Admission is not a verdict. The brain may upgrade it (F3); the gate must not.
    assert seniority_fit("entry", "") == "unknown"


# ── stretch: admitted on request, never promoted ─────────────────────────────


@pytest.mark.parametrize("target,above", STRETCH)
def test_the_stretch_band_is_admitted_only_on_request(target: str, above: str) -> None:
    assert not seniority_is_eligible(target, above)
    assert seniority_is_eligible(target, above, include_stretch=True)


@pytest.mark.parametrize("target,above", STRETCH)
def test_the_stretch_band_is_still_graded_off_level(target: str, above: str) -> None:
    # The candidate chose to look up a level; Myro is not recommending it.
    assert seniority_fit(target, above) == "incompatible"


def test_stretch_reaches_one_band_and_no_further() -> None:
    assert not seniority_is_eligible("entry", "senior", include_stretch=True)
    assert not seniority_is_eligible("intern", "mid", include_stretch=True)
    # Nothing sits above executive, so stretch adds nothing and a two-band drop
    # is still refused. (A garbage level like "executive_plus" is not "above" —
    # it is UNREADABLE, and unreadable is admitted everywhere by design.)
    assert not seniority_is_eligible("executive", "mid", include_stretch=True)
    assert seniority_is_eligible("executive", "executive_plus") is True


# ── the vocabulary ───────────────────────────────────────────────────────────


def test_every_level_has_an_at_level_definition() -> None:
    for level in SOURCE_SENIORITY:
        assert seniority_fit(level, level) == "compatible", level


@pytest.mark.parametrize("alias,canonical", [("junior", "entry"), ("graduate", "entry"), ("internship", "intern")])
def test_source_aliases_read_as_their_level(alias: str, canonical: str) -> None:
    assert seniority_fit(canonical, alias) == "compatible"
