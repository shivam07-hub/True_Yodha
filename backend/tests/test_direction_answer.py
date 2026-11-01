"""What the role picker opens with (`_direction_answer`).

"Not for you" is saved as a won't-take by pressing Continue, and a job that breaks
a won't-take is on no surface. So that box holds only what the person wrote. Myro's
guesses were filed there by kind, and the kind does not say which way a sentence
points: "Open to roles located in Gurugram" reached a won't-take list that way.
"""
from __future__ import annotations

from typing import Any

import pytest

from app.services import onboarding_service


def _answer(
    monkeypatch: pytest.MonkeyPatch,
    facts: list[tuple[str, str, str]],
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rows = [{"kind": kind, "text": text, "source": source} for kind, text, source in facts]

    class _Memory:
        def __init__(self, _db: Any) -> None:
            pass

        def list_active(self, _user_id: str, kinds: list[str] | None = None) -> list[dict[str, Any]]:
            return [row for row in rows if not kinds or row["kind"] in kinds]

    monkeypatch.setattr("app.repositories.user_memory.UserMemoryRepository", _Memory)
    return onboarding_service._direction_answer(object(), "u1", profile or {})


def test_not_for_you_keeps_the_persons_own_words(monkeypatch) -> None:
    answer = _answer(
        monkeypatch,
        [("constraint", "Avoids early-stage startups", "distilled")],
        {"deal_breakers": ["No agency work"]},
    )

    assert answer["avoid"] == ["No agency work"]
    assert answer["proposed"] == []


@pytest.mark.parametrize(
    ("kind", "text"),
    [
        ("constraint", "Avoids early-stage startups"),
        ("constraint", "Open to roles located in Gurugram"),
        ("constraint", "Notice period is 60 days."),
        ("work_mode", "Prefers remote work."),
        ("work_mode", "No night shifts"),
    ],
)
def test_a_guess_never_fills_not_for_you(monkeypatch, kind: str, text: str) -> None:
    answer = _answer(monkeypatch, [(kind, text, "distilled")])

    assert answer["avoid"] == []
    assert "avoid" not in answer["proposed"]


def test_a_liking_filed_as_a_constraint_is_offered_as_drawn_to(monkeypatch) -> None:
    answer = _answer(monkeypatch, [("work_mode", "Prefers remote work.", "distilled")])

    assert answer["lean"] == ["Prefers remote work."]
    assert answer["proposed"] == ["lean"]


@pytest.mark.parametrize(
    "text",
    [
        "No night shifts",
        "Avoids early-stage startups",
        "Open to roles located in Gurugram",
        "Notice period is 60 days.",
    ],
)
def test_what_is_not_a_liking_stays_out_of_drawn_to(monkeypatch, text: str) -> None:
    answer = _answer(monkeypatch, [("constraint", text, "distilled")])

    assert answer["lean"] == []
    assert answer["proposed"] == []


def test_their_own_leans_are_not_topped_up_with_guesses(monkeypatch) -> None:
    answer = _answer(
        monkeypatch,
        [
            ("preference", "Partner-led sales", "authored"),
            ("work_mode", "Prefers remote work.", "distilled"),
        ],
    )

    assert answer["lean"] == ["Partner-led sales"]
    assert answer["proposed"] == []


def test_a_distilled_preference_is_still_offered(monkeypatch) -> None:
    answer = _answer(monkeypatch, [("preference", "Prefers corporate functions", "distilled")])

    assert answer["lean"] == ["Prefers corporate functions"]
    assert answer["proposed"] == ["lean"]
