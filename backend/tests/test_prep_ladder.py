"""The four-step ladder's arithmetic (Unified Prep v2, artboard 2b).

Every one of these is a claim the rail makes to the user in a number or a pip,
so each is asserted rather than reasoned about at the call site.
"""
from __future__ import annotations

from app.services import prep_ladder
from app.services.jd_coverage import CoverageItem, CoverageResult


def _coverage(covered: int = 0, weak: int = 0, gap: int = 0) -> CoverageResult:
    items = (
        [CoverageItem(requirement=f"c{i}", status="covered") for i in range(covered)]
        + [CoverageItem(requirement=f"w{i}", status="weak") for i in range(weak)]
        + [CoverageItem(requirement=f"g{i}", status="gap") for i in range(gap)]
    )
    return CoverageResult(requirements=items, covered=covered, weak=weak, gap=gap)


class TestEvidenceStep:
    def test_no_assessment_is_not_started(self) -> None:
        assert prep_ladder.evidence_step(None) == prep_ladder.NOT_STARTED

    def test_parsed_nothing_is_not_started(self) -> None:
        assert prep_ladder.evidence_step(CoverageResult()) == prep_ladder.NOT_STARTED

    def test_all_covered_is_clear(self) -> None:
        assert prep_ladder.evidence_step(_coverage(covered=4)) == prep_ladder.CLEAR

    def test_a_weak_row_is_not_clear(self) -> None:
        """`weak` means an adjacent story, not proof — the panel is still asking."""
        assert prep_ladder.evidence_step(_coverage(covered=3, weak=1)) == prep_ladder.STARTED

    def test_gaps_only_is_not_started(self) -> None:
        assert prep_ladder.evidence_step(_coverage(gap=3)) == prep_ladder.NOT_STARTED


class TestLevelStep:
    def test_job_with_no_levelled_skills_is_clear(self) -> None:
        """Nothing to close. Holding it at 0 would cap the room at 75% forever."""
        assert prep_ladder.level_step({}, {}) == prep_ladder.CLEAR

    def test_all_levels_met_is_clear(self) -> None:
        wanted = {"Python Programming": 3, "Data Science": 2}
        held = {"python programming": 4, "data science": 2}
        assert prep_ladder.level_step(wanted, held) == prep_ladder.CLEAR

    def test_partial_level_is_started(self) -> None:
        assert prep_ladder.level_step({"Data Science": 3}, {"data science": 1}) == prep_ladder.STARTED

    def test_nothing_held_is_not_started(self) -> None:
        assert prep_ladder.level_step({"Data Science": 3}, {}) == prep_ladder.NOT_STARTED

    def test_user_map_is_matched_case_insensitively(self) -> None:
        """`get_user_skill_map` lowercases its keys; `wanted_skills` does not."""
        assert prep_ladder.level_step({"Machine Learning": 2}, {"machine learning": 2}) == prep_ladder.CLEAR


class TestRehearsalStep:
    def test_absent_is_not_started(self) -> None:
        assert prep_ladder.rehearsal_step(None) == prep_ladder.NOT_STARTED
        assert prep_ladder.rehearsal_step({}) == prep_ladder.NOT_STARTED

    def test_all_questions_worked_is_clear(self) -> None:
        assert prep_ladder.rehearsal_step({"answered": 6, "total": 6}) == prep_ladder.CLEAR

    def test_some_worked_is_started(self) -> None:
        assert prep_ladder.rehearsal_step({"answered": 2, "total": 6}) == prep_ladder.STARTED

    def test_answered_without_a_total_is_started_not_clear(self) -> None:
        """A payload that lost its denominator must not round up to done."""
        assert prep_ladder.rehearsal_step({"answered": 3}) == prep_ladder.STARTED


class TestBriefStep:
    def test_absent_is_not_started(self) -> None:
        assert prep_ladder.brief_step(None) == prep_ladder.NOT_STARTED

    def test_whitespace_is_not_a_brief(self) -> None:
        assert prep_ladder.brief_step("   ") == prep_ladder.NOT_STARTED

    def test_present_is_clear(self) -> None:
        assert prep_ladder.brief_step('{"lead_with": []}') == prep_ladder.CLEAR


class TestLevelRows:
    @staticmethod
    def _row(key: str, level: int, *, levelled: bool = True) -> dict:
        return {
            "is_primary": True,
            "required_level": level,
            "skills": {
                "taxonomy_key": key,
                "practice_mode": "levelled" if levelled else "scenario",
                "skill_kind": "hard",
            },
        }

    def test_deepest_unmet_gap_comes_first(self) -> None:
        rows = [self._row("A", 2), self._row("B", 4)]
        assert [r["name"] for r in prep_ladder.level_rows(rows, {})] == ["B", "A"]

    def test_met_levels_are_kept_but_sink(self) -> None:
        """A card that only shows what is missing never shows what was cleared."""
        rows = [self._row("Met", 2), self._row("Open", 3)]
        result = prep_ladder.level_rows(rows, {"met": 2})
        assert [r["name"] for r in result] == ["Open", "Met"]
        assert result[1]["held"] == 2

    def test_a_skill_with_no_assessment_is_flagged(self) -> None:
        rows = [self._row("Vendor Management", 3, levelled=False)]
        assert prep_ladder.level_rows(rows, {})[0]["has_drill"] is False

    def test_a_duplicate_key_is_listed_once(self) -> None:
        rows = [self._row("A", 2), self._row("a", 3)]
        assert len(prep_ladder.level_rows(rows, {})) == 1


class TestRoomPct:
    def test_empty_room(self) -> None:
        assert prep_ladder.room_pct([0, 0, 0, 0]) == 0

    def test_full_room(self) -> None:
        assert prep_ladder.room_pct([2, 2, 2, 2]) == 100

    def test_the_designs_sanofi_room(self) -> None:
        """2b's hero room: step 1 clear, step 2 started, nothing else. 38%."""
        assert prep_ladder.room_pct([2, 1, 0, 0]) == 38


class TestCurrentStep:
    def test_first_unclear_step(self) -> None:
        assert prep_ladder.current_step([2, 1, 0, 0]) == 2

    def test_untouched_room_is_on_step_one(self) -> None:
        assert prep_ladder.current_step([0, 0, 0, 0]) == 1

    def test_finished_room_never_claims_a_fifth_step(self) -> None:
        assert prep_ladder.current_step([2, 2, 2, 2]) == prep_ladder.STEP_COUNT


class TestTotals:
    def test_no_rooms(self) -> None:
        result = prep_ladder.totals([])
        assert result.step_pct == [0, 0, 0, 0]
        assert result.rooms == 0
        assert result.bottleneck_step == 1

    def test_weighted_progress_per_step(self) -> None:
        result = prep_ladder.totals([[2, 1, 0, 0], [2, 0, 0, 0]])
        assert result.step_pct == [100, 25, 0, 0]
        assert result.rooms == 2

    def test_bottleneck_is_the_worst_step(self) -> None:
        result = prep_ladder.totals([[2, 2, 1, 0], [2, 2, 2, 0]])
        assert result.bottleneck_step == 4

    def test_bottleneck_ties_take_the_earliest_step(self) -> None:
        """Two equally-stalled steps: send the user to the one that unblocks the other."""
        result = prep_ladder.totals([[2, 0, 0, 2]])
        assert result.bottleneck_step == 2
