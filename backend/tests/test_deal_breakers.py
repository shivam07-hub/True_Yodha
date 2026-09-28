"""Deal-Breaker: one reading of what a person will not take.

The prod row that shaped this (`33b66361`, 2026-09-28) held "less than 30
lakhs" beside two won't-take lines, and the brain received all three as one
comma-joined string.
"""
from __future__ import annotations

import pytest

from app.services import deal_breakers


@pytest.mark.parametrize(
    ("text", "floor"),
    [
        ("less than 30 lakhs", 30.0),
        ("Pay floor ₹35 LPA", 35.0),
        ("Pay floor ₹45L total comp", 45.0),
        ("35-40 LPA", 35.0),
        ("35 to 40 lakhs", 35.0),
        ("₹35,00,000 CTC", 35.0),
        ("above 1.2 crore", 120.0),
        # The 5 is years, not lakhs: only the head of a range borrows the unit.
        ("5+ years, above 30 lakhs", 30.0),
    ],
)
def test_a_pay_sentence_states_its_floor_in_lakhs(text: str, floor: float) -> None:
    assert deal_breakers.pay_floor_lpa(text) == floor


def test_a_sentence_that_is_not_about_pay_states_no_floor() -> None:
    assert deal_breakers.pay_floor_lpa("Avoids early-stage start-ups") is None
    assert deal_breakers.pay_floor_lpa("Pay floor, to be decided") is None


def test_pay_lines_become_the_floor_and_the_rest_stay_in_order() -> None:
    read = deal_breakers.read({
        "deal_breakers": [
            "Avoids early-stage start-ups",
            "less than 30 lakhs",
            "Avoids roles focused on financial accounting",
            "Pay floor ₹35 LPA",
        ]
    })
    # Two floors answer one question; the stricter one is the person's floor.
    assert read.pay_floor_lpa == 35.0
    assert read.wont_take == (
        "Avoids early-stage start-ups",
        "Avoids roles focused on financial accounting",
    )


def test_no_lines_is_no_floor_and_nothing_to_break() -> None:
    read = deal_breakers.read({"deal_breakers": None})
    assert read.pay_floor_lpa is None
    assert read.wont_take == ()


def test_broken_answers_in_the_persons_own_words() -> None:
    read = deal_breakers.read({"deal_breakers": ["No start-ups", "No accounting"]})
    # 1-based, as the prompt numbers them. Out-of-range and repeats are dropped.
    assert read.broken([2, 2, 7, 0]) == ["No accounting"]


def test_below_the_floor_is_the_top_of_the_band_under_it() -> None:
    assert deal_breakers.below_floor(35.0, 30.0) is True
    # A band that reaches the floor is negotiable, not below.
    assert deal_breakers.below_floor(35.0, 38.0) is False
    assert deal_breakers.below_floor(None, 30.0) is None
    assert deal_breakers.below_floor(35.0, None) is None
