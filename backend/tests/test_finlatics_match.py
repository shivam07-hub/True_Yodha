"""Which three Finlatics programmes the rail shows, and what each may claim.

The `why` line is the only thing on these cards that asserts something about
the user's board. A wrong one is a trust breach, so the shapes and the
word-boundary guard are pinned here.
"""
from __future__ import annotations

from app.services import finlatics_match
from app.services.finlatics_match import SkillGap


def gap(key: str, level: int = 3, company: str | None = "Sanofi", drill: bool = True) -> SkillGap:
    return SkillGap(taxonomy_key=key, required_level=level, company=company, has_drill=drill)


class TestCovers:
    def test_exact_and_qualified_keys_both_match(self) -> None:
        assert finlatics_match.covers("pm", "Product Management")
        assert finlatics_match.covers("pm", "Digital Product Management")

    def test_match_is_case_insensitive(self) -> None:
        assert finlatics_match.covers("ml", "AZURE MACHINE LEARNING")

    def test_word_boundary_blocks_the_lookalikes(self) -> None:
        """The taxonomy is dense with these. A substring match claims all of them."""
        assert not finlatics_match.covers("fm", "Art Portfolio")
        assert not finlatics_match.covers("fm", "Design Portfolio")
        assert not finlatics_match.covers("bads", "Pythonesque Humour")

    def test_unknown_program_matches_nothing(self) -> None:
        assert not finlatics_match.covers("nope", "Product Management")


class TestWhyLine:
    def test_no_gaps_makes_no_claim(self) -> None:
        assert finlatics_match.why_line([]) is None

    def test_many_rooms_counts_them(self) -> None:
        gaps = [gap("Key Performance Indicators (KPIs)", 3, c) for c in ("A", "B", "C", "D")]
        assert (
            finlatics_match.why_line(gaps)
            == "Covers Key Performance Indicators · the L3 ask in 4 of your rooms"
        )

    def test_the_parenthetical_is_dropped(self) -> None:
        """`Key Performance Indicators (KPIs)` is taxonomy noise in an 11px row."""
        line = finlatics_match.why_line([gap("Key Performance Indicators (KPIs)", 3, "A")] * 3)
        assert "(KPIs)" not in line

    def test_few_rooms_name_the_companies(self) -> None:
        gaps = [gap("Data Analysis", 2, "3M"), gap("Data Analysis", 2, "OpenAI")]
        assert finlatics_match.why_line(gaps) == "Covers Data Analysis L2 · asked by 3M and OpenAI"

    def test_one_room_names_one_company(self) -> None:
        assert finlatics_match.why_line([gap("Data Analysis", 2, "3M")]) == (
            "Covers Data Analysis L2 · asked by 3M"
        )

    def test_a_missing_company_never_leaves_a_hole(self) -> None:
        assert finlatics_match.why_line([gap("Data Analysis", 2, None)]) == (
            "Covers Data Analysis · the L2 ask in 1 of your rooms"
        )

    def test_no_drill_wins_over_the_room_count(self) -> None:
        """The one shape that says why a programme is the ONLY answer we have."""
        gaps = [gap("Vendor Management", 3, c, drill=False) for c in ("A", "B", "C", "D")]
        assert finlatics_match.why_line(gaps) == (
            "Covers Vendor Management · the one level with no drill yet"
        )

    def test_the_deepest_ask_sets_the_level(self) -> None:
        gaps = [gap("Data Analysis", 2, "A"), gap("Data Analysis", 4, "B")]
        assert "L4" in finlatics_match.why_line(gaps)


class TestSelect:
    def test_always_returns_three(self) -> None:
        assert len(finlatics_match.select([])) == finlatics_match.RAIL_SIZE

    def test_an_empty_board_claims_nothing(self) -> None:
        assert all(m.why is None and not m.matched for m in finlatics_match.select([]))

    def test_the_most_asked_programme_leads(self) -> None:
        gaps = [gap("Product Management", 3, c) for c in ("A", "B", "C")] + [
            gap("Machine Learning", 2, "D")
        ]
        picked = finlatics_match.select(gaps)
        assert picked[0].program_id == "pm"
        assert picked[0].matched
        assert picked[0].why is not None

    def test_the_rail_fills_to_three_after_the_matches(self) -> None:
        picked = finlatics_match.select([gap("Product Management", 3, "A")])
        assert picked[0].program_id == "pm"
        assert len(picked) == 3
        assert [m.matched for m in picked[1:]] == [False, False]

    def test_no_programme_appears_twice(self) -> None:
        gaps = [gap("Data Analysis", 3, "A"), gap("Product Management", 3, "B")]
        ids = [m.program_id for m in finlatics_match.select(gaps)]
        assert len(ids) == len(set(ids))

    def test_an_unmatched_filler_never_carries_a_claim(self) -> None:
        for match in finlatics_match.select([gap("Product Management", 3, "A")]):
            if not match.matched:
                assert match.why is None


class TestRailNote:
    def test_no_gaps_says_so(self) -> None:
        assert finlatics_match.rail_note(has_gaps=False, bottleneck_step=2) == (
            "Nothing in your live rooms is short a level right now."
        )

    def test_claims_step_two_only_when_step_two_stalls(self) -> None:
        assert finlatics_match.rail_note(has_gaps=True, bottleneck_step=2).startswith(
            "Step 2 is where your rooms stall."
        )

    def test_a_board_stalled_elsewhere_does_not_point_at_step_two(self) -> None:
        note = finlatics_match.rail_note(has_gaps=True, bottleneck_step=1)
        assert "Step 2 is where your rooms stall" not in note
        assert note == "These three cover the levels your live rooms keep asking for."
