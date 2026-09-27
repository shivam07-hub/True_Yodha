"""The 29: a role title with an empty scope, left by the 2026-09-15 phantom repair.

A heal, not a backfill — it finishes a direction the user chose, on the visit
they were already making. Shivam, 2026-09-27: restore it silently; asking them
to re-pick a target their own Career Path page is showing them is what makes a
product read as broken.
"""
from __future__ import annotations

import pytest

from app.services import forward_pass


@pytest.fixture(autouse=True)
def _always_claim(monkeypatch):
    monkeypatch.setattr(forward_pass, "_claim", lambda name, user_id: True)


def _wire(monkeypatch, *, snapshot, commits):
    monkeypatch.setattr("app.database.get_supabase_admin", lambda: object())
    monkeypatch.setattr("app.repositories.users.UsersRepository", lambda db: object())
    monkeypatch.setattr("app.services.career_target.current_snapshot", lambda db, uid: snapshot)
    monkeypatch.setattr(
        "app.services.targeting_write.commit",
        lambda repo, uid, patch: commits.append(patch),
    )


def test_a_remembered_family_is_restored_for_the_matcher(monkeypatch) -> None:
    commits: list[dict] = []
    _wire(monkeypatch, snapshot={"l2_role_family": "Data Science"}, commits=commits)
    done = forward_pass.restore_scope_from_snapshot(
        "u1", {"target_role_titles": ["Data Scientist"], "target_roles": []}
    )
    assert done
    assert commits == [{"target_role_titles": ["Data Scientist"], "role_families": ["Data Science"]}]


def test_a_healthy_direction_is_left_alone(monkeypatch) -> None:
    commits: list[dict] = []
    _wire(monkeypatch, snapshot={"l2_role_family": "Data Science"}, commits=commits)
    assert not forward_pass.restore_scope_from_snapshot(
        "u1", {"target_role_titles": ["Data Scientist"], "target_roles": ["Data Science"]}
    )
    assert commits == []


def test_someone_with_no_remembered_direction_is_asked_instead(monkeypatch) -> None:
    """The other 15. The picker is the right answer for them, not a guess."""
    commits: list[dict] = []
    _wire(monkeypatch, snapshot=None, commits=commits)
    assert not forward_pass.restore_scope_from_snapshot(
        "u1", {"target_role_titles": ["Data Scientist"], "target_roles": []}
    )
    assert commits == []


def test_a_user_with_no_titles_is_not_touched(monkeypatch) -> None:
    commits: list[dict] = []
    _wire(monkeypatch, snapshot={"l2_role_family": "Data Science"}, commits=commits)
    assert not forward_pass.restore_scope_from_snapshot("u1", {"target_roles": []})
    assert commits == []


def test_the_restore_goes_through_the_one_write_door(monkeypatch) -> None:
    """`role_families`, not a raw `target_roles`. `commit` re-checks the family
    against the corpus, so one that has since left it is dropped, not restored."""
    commits: list[dict] = []
    _wire(monkeypatch, snapshot={"l2_role_family": "Data Science"}, commits=commits)
    forward_pass.restore_scope_from_snapshot(
        "u1", {"target_role_titles": ["Data Scientist"], "target_roles": []}
    )
    assert "target_roles" not in commits[0], "never write the derived key directly"


def test_a_failure_never_breaks_the_page(monkeypatch) -> None:
    def boom(db, uid):
        raise RuntimeError("snapshot read down")

    monkeypatch.setattr("app.database.get_supabase_admin", lambda: object())
    monkeypatch.setattr("app.services.career_target.current_snapshot", boom)
    assert not forward_pass.restore_scope_from_snapshot(
        "u1", {"target_role_titles": ["Data Scientist"], "target_roles": []}
    )
