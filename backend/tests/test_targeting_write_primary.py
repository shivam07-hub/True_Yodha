"""A residual bucket cannot be the main role.

`target_role_titles[0]` is the primary — the score label, the career-target
snapshot, the chip the person sees first. Rupanjana's first pick was
"Scripting Languages", a catch-all; 23 of 165 people with a target were in
the same shape. The write path reorders so a real family sits first. A list
of only buckets is left alone — there is nothing to promote.
"""

from __future__ import annotations

from typing import Any

from app.services import targeting_write
from app.services.targeting_write import demote_catch_all_primary


BUCKETS = {"Scripting Languages", "Business Operations"}


def test_a_real_family_is_promoted_over_a_leading_bucket() -> None:
    assert demote_catch_all_primary(
        ["Scripting Languages", "Software Development", "Business Operations"],
        BUCKETS,
    ) == ["Software Development", "Scripting Languages", "Business Operations"]


def test_an_already_real_primary_is_left_in_place() -> None:
    names = ["Software Development", "Scripting Languages"]
    assert demote_catch_all_primary(names, BUCKETS) == names


def test_an_all_bucket_list_is_left_alone() -> None:
    names = ["Scripting Languages", "Business Operations"]
    assert demote_catch_all_primary(names, BUCKETS) == names


def test_an_empty_list_is_a_no_op() -> None:
    assert demote_catch_all_primary([], BUCKETS) == []


class _Repo:
    def __init__(self, profile: dict[str, Any]) -> None:
        self._profile = profile
        self._db = object()
        self.updates: dict[str, Any] = {}

    def get_profile(self, _user_id: str) -> dict[str, Any]:
        return self._profile

    def update_profile(self, _user_id: str, updates: dict[str, Any]) -> bool:
        self.updates = updates
        self._profile.update(updates)
        return True


def test_commit_will_not_store_a_bucket_as_the_primary(monkeypatch) -> None:
    repo = _Repo({})
    monkeypatch.setattr(
        targeting_write.RoleFamiliesRepository,
        "family_flags",
        lambda self, names: {n: n in BUCKETS for n in names},
    )
    targeting_write.commit(
        repo,
        "u1",
        {
            "target_role_titles": ["Scripting Languages", "Software Development"],
            "role_families": ["Scripting Languages", "Software Development"],
        },
    )
    assert repo.updates["target_role_title"] == "Software Development"
    assert repo.updates["target_role_titles"][0] == "Software Development"
    assert repo.updates["target_roles"][0] == "Software Development"
    assert "Scripting Languages" in repo.updates["target_role_titles"]
