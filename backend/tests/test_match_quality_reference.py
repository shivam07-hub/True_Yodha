"""The yardstick's rules, asserted on the cases that produced them.

Every case here is a real listing from the 2026-09-19 audit, because a rule
invented in a test is a rule nobody checked against the corpus. These run
without a database so CI keeps them honest even when the nightly gate (which
needs credentials) cannot run.
"""
from __future__ import annotations

from quality.gate import GateResult, check, evaluate
from quality.profile import CandidateProfile
from quality.reference_matcher import ReferenceHit, is_relevant, level_fits, shortlist

PAYMENTS_ENGINEER = CandidateProfile(
    label="payments returner",
    skill_names=frozenset({"java (programming language)", "python (programming language)",
                           "postgresql", "fastapi", "spring boot", "reconciliation"}),
    years_experience=3.2,
    direction_families=frozenset({"Software Development"}),
    role_keywords=("payment", "reconciliation"),
)


def _job(**kw):
    base = {
        "job_id": kw.get("job_id", "j1"),
        "job_title": "Senior Associate Application Development",
        "company_name": "NPCI",
        "seniority_level": "",
        "min_years_experience": None,
        "max_years_experience": None,
        "role_family": "Software Development",
        "main_skills": [],
    }
    base.update(kw)
    return base


# ── the rule that started this: a stated range beats a title word ────────────

def test_senior_associate_asking_two_to_six_years_is_a_mid_role():
    """NPCI grades its 2-6 year engineers "Senior Associate". Production read
    the word, tagged it `senior`, and hid it from a 3.2-year candidate — two of
    her three best-fitting roles."""
    job = _job(seniority_level="senior", min_years_experience=2, max_years_experience=6)

    fits, stated = level_fits(PAYMENTS_ENGINEER, job)

    assert fits is True
    assert stated is True


def test_paytm_senior_software_engineer_asking_two_to_five_is_a_mid_role():
    job = _job(job_title="Backend - Senior Software Engineer", company_name="Paytm",
               seniority_level="senior", min_years_experience=2, max_years_experience=5)

    assert level_fits(PAYMENTS_ENGINEER, job)[0] is True


def test_a_genuine_senior_role_with_no_range_is_still_refused():
    """The title word is not worthless — it is only outranked. With nothing
    stated it is all we have."""
    job = _job(job_title="Senior Software Engineer", seniority_level="senior")

    fits, stated = level_fits(PAYMENTS_ENGINEER, job)

    assert fits is False
    assert stated is True


def test_a_role_far_above_the_stated_ceiling_is_refused():
    job = _job(min_years_experience=8)

    assert level_fits(PAYMENTS_ENGINEER, job)[0] is False


def test_a_role_below_the_stated_floor_is_refused_with_slack():
    """1-2 years for a 3.2-year candidate: one year of slack is generous, two
    is a different job."""
    job = _job(min_years_experience=1, max_years_experience=2)

    assert level_fits(PAYMENTS_ENGINEER, job)[0] is False


def test_an_untagged_listing_is_a_candidate_not_a_reject():
    """9,323 live listings state no level. Production hides them from anyone who
    set a band; a human reads the title. Keeping them is what makes the gap
    measurable."""
    job = _job(job_title="Software Development Engineer Backend", company_name="Juspay")

    fits, stated = level_fits(PAYMENTS_ENGINEER, job)

    assert fits is True
    assert stated is False


# ── relevance: direction, then a title a human recognises, then evidence ─────

def test_a_payments_title_outside_every_chosen_family_is_still_relevant():
    """"Payments Planning and Analysis Developer" sits in no family she picked,
    and belongs on a payments engineer's list."""
    job = _job(job_title="Payments Planning and Analysis Developer",
               company_name="JP Morgan Chase", role_family="General Finance")

    relevant, reason = is_relevant(PAYMENTS_ENGINEER, job)

    assert relevant is True
    assert reason == "title:payment"


def test_an_off_direction_job_with_no_shared_skill_is_not_relevant():
    """The DBS contact-centre roles: no family of hers, nothing in common."""
    job = _job(job_title="Assistant Officer, Specialist, Contact Centre",
               company_name="DBS Bank", role_family="General Finance")

    assert is_relevant(PAYMENTS_ENGINEER, job)[0] is False


def test_evidence_alone_can_carry_a_job_in():
    job = _job(job_title="Platform Engineer", role_family="Cloud Computing",
               main_skills=["Python (Programming Language)", "PostgreSQL", "FastAPI"])

    assert is_relevant(PAYMENTS_ENGINEER, job) == (True, "skills")


# ── shortlist shape ──────────────────────────────────────────────────────────

def test_shortlist_puts_on_direction_before_raw_overlap():
    on_direction = _job(job_id="on", main_skills=["Java (Programming Language)"])
    off_direction = _job(job_id="off", role_family="Cloud Computing",
                         job_title="Platform Engineer",
                         main_skills=["Python (Programming Language)", "PostgreSQL",
                                      "FastAPI", "Spring Boot"])

    ranked = shortlist(PAYMENTS_ENGINEER, [off_direction, on_direction])

    assert [h.job_id for h in ranked] == ["on", "off"]


def test_shortlist_drops_internships_whatever_their_skills_say():
    job = _job(job_id="intern", job_title="Software Engineer, Intern",
               main_skills=["Python (Programming Language)", "PostgreSQL", "FastAPI"])

    assert shortlist(PAYMENTS_ENGINEER, [job]) == []


def test_shortlist_is_capped_but_never_padded():
    # One employer per listing, because the shape rules cap an employer at two —
    # sixty identical NPCI requisitions correctly collapse to one, and a fixture
    # that used them was only ever passing by accident.
    jobs = [_job(job_id=f"j{i}", company_name=f"Co{i}",
                 main_skills=["Java (Programming Language)"]) for i in range(60)]

    assert len(shortlist(PAYMENTS_ENGINEER, jobs, limit=40)) == 40
    assert len(shortlist(PAYMENTS_ENGINEER, jobs[:3], limit=40)) == 3


def test_an_employer_never_takes_more_than_two_places():
    """Rule 5 of the hand-built shortlists. Honeywell took 7 of the first 12
    without it, and a yardstick that hands a person five Google roles is not the
    human it claims to encode — it then counts the product wrong for obeying a
    rule they share."""
    jobs = [_job(job_id=f"g{i}", company_name="Google", job_title=f"Engineer {i}",
                 main_skills=["Java (Programming Language)"]) for i in range(6)]

    assert len(shortlist(PAYMENTS_ENGINEER, jobs, limit=40)) == 2


def test_two_requisitions_with_one_title_read_as_one_job():
    jobs = [_job(job_id="a", company_name="Infosys", job_title="Java Developer",
                 main_skills=["Java (Programming Language)"]),
            _job(job_id="b", company_name="Infosys", job_title="Java Developer",
                 main_skills=["Java (Programming Language)"])]

    assert [h.job_id for h in shortlist(PAYMENTS_ENGINEER, jobs, limit=40)] == ["a"]


# ── the gate's two numbers ───────────────────────────────────────────────────

def test_recall_counts_only_what_production_can_actually_reach():
    reference = [ReferenceHit("a", "A", "Co", 3, True, True, "direction"),
                 ReferenceHit("b", "B", "Co", 2, True, True, "direction")]
    production = [{"job_id": "a", "job_title": "A", "company_name": "Co",
                   "role_family": "Software Development", "main_skills": []}]

    result = evaluate(PAYMENTS_ENGINEER, reference, production)

    assert result.reached == 1
    assert result.recall == 0.5
    assert result.missed_examples == ["Co — B"]


def test_a_shown_job_that_fails_the_level_rule_is_a_violation():
    production = [{"job_id": "x", "job_title": "Senior Software Engineer",
                   "company_name": "Co", "seniority_level": "senior",
                   "role_family": "Software Development", "main_skills": []}]

    result = evaluate(PAYMENTS_ENGINEER, [], production)

    assert result.violations == ["level: Co — Senior Software Engineer"]
    assert result.violation_rate == 1.0


def test_the_ratchet_stays_silent_for_a_profile_that_has_earned_nothing_yet():
    """A new persona's first run is a baseline. A gate that failed it would
    punish measuring something for the first time."""
    result = GateResult(label="new persona", reference_size=40, production_size=0,
                        reached=0, admitted=0)

    assert check(result, {}) == []


def test_the_ratchet_fails_a_drop_below_what_was_earned():
    result = GateResult(label="payments returner", reference_size=40,
                        production_size=30, reached=12, admitted=30)

    failures = check(result, {"payments returner": {"min_recall": 0.5}})

    assert failures and "below earned" in failures[0]


def test_a_job_going_unreachable_fails_even_when_the_shown_list_holds_up():
    """The two numbers fail differently, and one can hide the other. Ranking can
    keep recall flat while a filter change quietly makes jobs unreachable at any
    depth — the exact fault that measured 0% and was invisible for months."""
    result = GateResult(label="payments returner", reference_size=40,
                        production_size=40, reached=14, admitted=10)

    failures = check(result, {"payments returner": {
        "min_recall": 0.35, "min_admissible_recall": 0.68}})

    assert len(failures) == 1
    assert "unreachable" in failures[0]


def test_a_shaped_feed_card_is_judged_on_the_listing_not_on_its_missing_keys():
    """The feed returns cards, not rows: `_feed_shape_row` carries neither
    `role_family` nor `main_skills`. Reading those absent keys off a card once
    made this gate report 100% violations against a feed whose real fault was a
    different one — an absent field is not a verdict."""
    card = {"job_id": "j1", "job_title": "Application Engineer - II",
            "company_name": "Vanguard Group", "seniority_level": "mid",
            "min_years_experience": 3}
    corpus_row = {"job_id": "j1", "job_title": "Application Engineer - II",
                  "company_name": "Vanguard Group", "seniority_level": "mid",
                  "min_years_experience": 3, "role_family": "Software Development",
                  "main_skills": ["Java (Programming Language)"]}

    blind = evaluate(PAYMENTS_ENGINEER, [], [card])
    informed = evaluate(PAYMENTS_ENGINEER, [], [card], {"j1": corpus_row})

    assert blind.violations == ["off-direction, no shared skill: Vanguard Group — Application Engineer - II"]
    assert informed.violations == []
