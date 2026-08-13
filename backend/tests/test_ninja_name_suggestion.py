"""ninja_name.suggestion_for — what to put in the box, and whether to ask.

The behaviour that made 476 of 481 names stay untouched: `suggest` echoed back
the random slug it had generated at signup, so the naming moment asked the user
to confirm noise. `ninja_name_claimed_at` is what separates a name a human chose
from one we invented for them.
"""
from __future__ import annotations

from app.services import ninja_name as nn


class _Admin:
    """Stub for the two calls suggestion_for makes: read the profile, then check
    availability of a generated candidate."""

    def __init__(self, profile: dict | None, *, raise_on_read: bool = False) -> None:
        self._profile = profile
        self._raise = raise_on_read
        self._select = ""

    def table(self, name: str) -> "_Admin":
        return self

    def select(self, cols: str) -> "_Admin":
        self._select = cols
        return self

    def eq(self, *a: object) -> "_Admin":
        return self

    def limit(self, *a: object) -> "_Admin":
        return self

    def maybe_single(self) -> "_Admin":
        return self

    def execute(self) -> object:
        if "ninja_name_claimed_at" in self._select:
            if self._raise:
                raise RuntimeError("db down")
            return type("R", (), {"data": self._profile})()
        return type("R", (), {"data": []})()  # availability: nothing taken


def test_claimed_name_is_returned_untouched() -> None:
    """Never re-suggest a different name to someone who already picked one —
    'I already gave a name, why is it different?' was a real QA complaint."""
    out = nn.suggestion_for(
        "u1",
        admin=_Admin({"ninja_name": "chai-fuelled-panda", "full_name": "Shivam Pathak",
                      "ninja_name_claimed_at": "2026-08-13T00:00:00Z"}),
    )
    assert out == {"ninja_name": "chai-fuelled-panda", "claimed": True}


def test_unclaimed_slug_is_replaced_by_a_name_derived_suggestion() -> None:
    """The persisted value is OUR random slug. Suggesting it back is what made
    everyone skip; a name they recognise reads as a starting point."""
    out = nn.suggestion_for(
        "u1",
        admin=_Admin({"ninja_name": "cosmic-otter-4b1x", "full_name": "Shivam Pathak",
                      "ninja_name_claimed_at": None}),
    )
    assert out["claimed"] is False
    assert out["ninja_name"].startswith("shivam-pathak-")
    assert out["ninja_name"] != "cosmic-otter-4b1x"


def test_no_full_name_still_yields_a_valid_suggestion() -> None:
    out = nn.suggestion_for(
        "u1", admin=_Admin({"ninja_name": "cosmic-otter-4b1x", "full_name": None,
                            "ninja_name_claimed_at": None})
    )
    assert out["claimed"] is False
    assert nn.is_valid(out["ninja_name"])


def test_read_failure_fails_soft_to_an_unclaimed_suggestion() -> None:
    """The naming moment sits on the screen where the user picks a first role.
    A profile read problem must not raise into it."""
    out = nn.suggestion_for("u1", admin=_Admin(None, raise_on_read=True))
    assert out["claimed"] is False
    assert nn.is_valid(out["ninja_name"])
