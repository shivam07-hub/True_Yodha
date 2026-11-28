"""A room's step 2 counts a level proven in practice (ONE_PREP P2).

`prep_user_state` read `user_skills.matched_level` only, so a pass inside a
room (which writes `skill_assessed_level`) never moved that room's rung — the
room's "what you clear here carries" was false for step 2. The function now
takes the higher of the two per skill: `skill_state.level_of`, the rule the
target-role room already used.
"""
from __future__ import annotations

from pathlib import Path

from app.services.skill_state import level_of

MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20261128110000_prep_levels_count_practice.sql"
)


def _body() -> str:
    return MIGRATION.read_text().split("as $$", 1)[1].split("$$;", 1)[0]


def test_step_two_reads_the_cv_level_and_the_practised_level():
    body = _body()
    assert "from public.user_skills us" in body
    assert "from public.skill_assessed_level sal" in body
    assert "union all" in body


def test_the_higher_level_wins_per_skill_as_level_of_says():
    body = _body()
    assert "max(levels.level)" in body
    assert "group by 1" in body
    # The rule the SQL mirrors, stated in Python: the higher level wins.
    assert level_of(1, 3)[0] == 3
    assert level_of(3, 1)[0] == 3
    assert level_of(2, 2) == (2, "on_cv")


def test_it_still_reads_only_the_callers_own_rows():
    body = _body()
    assert body.count("auth.uid()") == 3
    assert "security definer" not in MIGRATION.read_text().lower()
    assert "set search_path to ''" in MIGRATION.read_text()
