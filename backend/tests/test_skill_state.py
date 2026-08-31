"""The one rule four surfaces used to answer four different ways."""

from __future__ import annotations

from app.repositories.scores import RoleFamilyMarket
from app.services import skill_state
from app.services.skill_state import RoleStanding, SkillStanding, for_role, level_of


class _Repo:
    """Stands in for ScoresRepository. Only the three reads for_role makes."""

    def __init__(self, *, cv=None, proven=None, market=None):
        self._cv = cv or {}
        self._proven = proven or {}
        self.market = market if market is not None else RoleFamilyMarket.empty()

    def get_user_skill_level_map(self, _user_id):
        return dict(self._cv)

    def get_user_proven_level_map(self, _user_id):
        return dict(self._proven)

    def get_role_family_market(self, _families):
        return self.market


def _market(demand: dict[str, int], aspiration: dict[str, int] | None = None) -> RoleFamilyMarket:
    return RoleFamilyMarket(aspiration=aspiration or {}, demand=demand)


# ── the rule ─────────────────────────────────────────────────────────────────

def test_practice_counts_when_it_beats_the_cv():
    assert level_of(1, 3) == (3, "proven")


def test_the_cv_counts_when_it_beats_practice():
    assert level_of(4, 2) == (4, "on_cv")


def test_a_tie_goes_to_the_cv():
    """Work you did outranks a quiz you passed at the same level — it is the
    stronger claim to put in front of an employer."""
    assert level_of(3, 3) == (3, "on_cv")


def test_no_evidence_is_level_zero_and_says_so():
    assert level_of(0, 0) == (0, "none")
    assert level_of(None, None) == (0, "none")


def test_negatives_and_junk_cannot_drag_a_level_below_zero():
    assert level_of(-4, None) == (0, "none")


# ── the role count ───────────────────────────────────────────────────────────

def test_the_count_is_cleared_over_core_not_a_percentage():
    repo = _Repo(
        cv={"Sales": 3},
        proven={"Cold Calling": 3},
        market=_market(
            demand={"Sales": 400, "Cold Calling": 300, "Banking": 200},
            aspiration={"Sales": 3, "Cold Calling": 3, "Banking": 3},
        ),
    )

    standing = for_role(repo, "u1", ["Sales Practices"])

    assert standing.total == 3
    assert standing.cleared == 2  # one from the CV, one from practice


def test_practice_alone_moves_the_count():
    """The whole point. Before this, clearing every rung in the product moved
    the user's number by nothing."""
    market = _market(demand={"Cold Calling": 300}, aspiration={"Cold Calling": 2})
    before = for_role(_Repo(market=market), "u1", ["Sales"])
    after = for_role(_Repo(proven={"Cold Calling": 2}, market=market), "u1", ["Sales"])

    assert before.cleared == 0
    assert after.cleared == 1


def test_below_the_required_level_does_not_clear():
    repo = _Repo(
        cv={"Sales": 2},
        market=_market(demand={"Sales": 400}, aspiration={"Sales": 4}),
    )
    assert for_role(repo, "u1", ["Sales"]).cleared == 0


def test_an_unknown_bar_is_never_a_met_one():
    """A skill the market demands but sets no target level for must not count as
    cleared just because the user has it. Absence of a bar is not a low bar."""
    repo = _Repo(cv={"Sales": 5}, market=_market(demand={"Sales": 400}, aspiration={}))

    standing = for_role(repo, "u1", ["Sales"])

    assert standing.total == 1
    assert standing.cleared == 0


def test_core_is_capped_and_ranked_by_demand():
    demand = {f"skill{i}": i for i in range(30)}
    repo = _Repo(market=_market(demand=demand))

    standing = for_role(repo, "u1", ["Sales"])

    assert standing.total == skill_state.CORE_SKILL_COUNT
    assert standing.core[0].taxonomy_key == "skill29"  # highest demand leads
    assert [s.demand for s in standing.core] == sorted(
        (s.demand for s in standing.core), reverse=True
    )


def test_ties_rank_deterministically():
    """This feeds a number the user watches for movement; the same inputs must
    produce the same twelve every read."""
    repo = _Repo(market=_market(demand={"b": 10, "a": 10, "c": 10}))

    first = [s.taxonomy_key for s in for_role(repo, "u1", ["Sales"]).core]
    second = [s.taxonomy_key for s in for_role(repo, "u1", ["Sales"]).core]

    assert first == second == ["a", "b", "c"]


def test_no_target_role_is_an_empty_standing_not_a_zero():
    """Rendering "0 / 12" against a market we never asked about is a verdict on
    the user for something they never did. Callers show nothing instead."""
    assert for_role(_Repo(), "u1", []) == RoleStanding(core=[])


def test_a_failed_market_read_is_empty_not_zero():
    assert for_role(_Repo(market=RoleFamilyMarket.empty()), "u1", ["Sales"]).total == 0


def test_standing_carries_the_evidence_so_a_surface_never_recomputes_it():
    repo = _Repo(
        cv={"Sales": 1},
        proven={"Sales": 4},
        market=_market(demand={"Sales": 9}, aspiration={"Sales": 3}),
    )

    only = for_role(repo, "u1", ["Sales"]).core[0]

    assert only == SkillStanding(
        taxonomy_key="Sales", level=4, evidence="proven", required_level=3, demand=9
    )
    assert only.clears is True
