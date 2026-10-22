"""The replay's arithmetic decides whether List Reading may go live (ADR-0027)."""
from __future__ import annotations

from scripts.triage_replay import LIST_FULL, PersonReplay, _report, _until_full


def _person(**kw) -> PersonReplay:
    base = dict(
        user_id="u1", pile=100, good=50, good_in_read_rounds=50, current_verdicts=100, rounds=2, triage_calls=2, rounds_unread=0,
        kept=30, good_kept=45, evals_today=100, evals_stop_only=80, evals_list_reading=30,
        list_reading_reached_40=True,
    )
    return PersonReplay(**{**base, **kw})


def test_reading_stops_at_the_job_that_fills_the_list() -> None:
    order = [f"j{i}" for i in range(100)]
    good = {f"j{i}" for i in range(0, 100, 2)}  # every other job clears 3.5
    assert _until_full(order, good) == 2 * LIST_FULL - 1


def test_a_pile_that_never_fills_is_read_to_the_end() -> None:
    order = [f"j{i}" for i in range(10)]
    assert _until_full(order, {"j1", "j2"}) == 10


def test_the_gate_is_recall_over_every_good_job_not_an_average_of_people() -> None:
    # Pooled over every good job: 1 of 10 beside 89 of 90 is 90/100 and passes;
    # 1 of 10 beside 80 of 90 is 81/100 and fails.
    report = _report([_person(good_in_read_rounds=10, good_kept=1), _person(good_in_read_rounds=90, good_kept=89)])
    assert report["recall"] == 0.9 and report["passes_gate"] is True
    report = _report([_person(good_in_read_rounds=10, good_kept=1), _person(good_in_read_rounds=90, good_kept=80)])
    assert report["passes_gate"] is False


def test_no_good_job_is_no_verdict_on_the_gate() -> None:
    report = _report([_person(good=0, good_in_read_rounds=0, good_kept=0)])
    assert report["recall"] is None and report["passes_gate"] is False


def test_an_unread_round_is_not_counted_against_the_triage() -> None:
    # 30 good jobs sat in a round the provider never answered; the triage kept
    # 18 of the 20 it did read.
    person = _person(good=50, good_in_read_rounds=20, good_kept=18, rounds_unread=1)
    assert person.recall == 0.9
