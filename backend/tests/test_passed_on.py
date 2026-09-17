"""passed_on — the directions a user rejected twice, read from their own skips.

The module is the test surface: what a skip is allowed to say, what it is never
allowed to say, and the per-direction grading that keeps one shared skill from
taking down a direction nobody rejected.
"""
from __future__ import annotations

from app.services.matching import passed_on

CORE = {
    "Engineering & Data": ["PySpark", "Data Pipelines", "ETL", "Airflow"],
    "Sales Management": ["Regional Sales", "Sales Process", "Stakeholder Management"],
    "IT Strategy": ["Stakeholder Management", "IT Governance", "Enterprise Architecture"],
}

DATA_JOB = ["PySpark", "Data Pipelines", "Python"]
SALES_JOB = ["Regional Sales", "Sales Process"]


def test_a_job_fits_every_direction_it_asks_for(): 
    vocab = passed_on.vocabularies(CORE)
    assert passed_on.directions_for(DATA_JOB, vocab) == {"Engineering & Data"}
    assert passed_on.directions_for(["Stakeholder Management", "IT Governance"], vocab) == {"IT Strategy"}


def test_one_skip_is_a_bad_listing_two_is_a_pattern():
    assert passed_on.select_passed_on([DATA_JOB], CORE) == set()
    assert passed_on.select_passed_on([DATA_JOB, DATA_JOB], CORE) == {"Engineering & Data"}


def test_a_direction_you_chose_is_never_passed_on_behind_your_back():
    # Saying "not my role" inside your own target means the target may be wrong,
    # and that is a change only the user makes.
    assert passed_on.select_passed_on(
        [SALES_JOB, SALES_JOB], CORE, target_families=["Sales Management"]
    ) == set()


def test_rejecting_a_tech_role_does_not_cost_the_sales_role_that_shares_a_skill():
    # Shivam's question: stakeholder management belongs to both profiles.
    passed = passed_on.select_passed_on(
        [["Stakeholder Management", "IT Governance"], ["Stakeholder Management", "Enterprise Architecture"]],
        CORE,
        target_families=["Sales Management"],
    )
    assert passed == {"IT Strategy"}
    vocabs = [passed_on.vocabularies(CORE)["IT Strategy"]]
    assert not passed_on.is_passed_on(SALES_JOB, vocabs)


def test_a_job_with_no_skills_counts_for_nothing():
    assert passed_on.select_passed_on([None, None, []], CORE) == set()


def test_two_hits_spread_across_two_passed_directions_is_not_one_of_them():
    vocab = passed_on.vocabularies(CORE)
    vocabs = [vocab["Engineering & Data"], vocab["IT Strategy"]]
    # One skill from each — a job neither direction would claim.
    assert not passed_on.is_passed_on(["PySpark", "IT Governance"], vocabs)
    assert passed_on.is_passed_on(["PySpark", "Airflow"], vocabs)


def test_nobody_can_reject_their_way_out_of_the_corpus():
    many = {f"Family {i}": [f"Skill {i}a", f"Skill {i}b"] for i in range(20)}
    skips = [[f"Skill {i}a", f"Skill {i}b"] for i in range(20)] * 2
    passed = passed_on.select_passed_on(skips, many)
    assert len(passed) == passed_on.MAX_PASSED_ON


class _Repo:
    """Enough repo for the read path — no client, so the snapshot read raises and
    the module must degrade to 'nothing is passed on'."""

    client = None

    def __init__(self, job_ids: list[str]) -> None:
        self._ids = job_ids

    def recent_personal_feedback_job_ids(self, _user: str, *, reason_code: str, days: int) -> list[str]:
        assert reason_code == "not_my_role"
        assert days == passed_on.WINDOW_DAYS
        return self._ids

    def main_skills_by_ids(self, ids: list[str]) -> dict[str, list[str]]:
        return {i: DATA_JOB for i in ids}


def test_too_few_skips_never_reads_the_corpus():
    assert passed_on.for_user(_Repo(["j1"]), "u1") is passed_on.NOTHING_PASSED_ON


def test_an_unreadable_corpus_shows_more_jobs_not_fewer():
    result = passed_on.for_user(_Repo(["j1", "j2"]), "u1")
    assert result.families == frozenset()
    assert not result
