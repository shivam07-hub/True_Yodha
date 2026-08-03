from app.repositories.scores import RoleFamilyMarket
from app.services.scoring.aspirations import fetch_aspiration_skills, fetch_role_family_market


class _RoleFamilyOnlyRepository:
    def __init__(self) -> None:
        self.calls = 0

    def get_role_family_market(self, families: list[str]) -> RoleFamilyMarket:
        assert families == ["Sales and Marketing"]
        self.calls += 1
        return RoleFamilyMarket(
            aspiration={"Sales": 4, "Customer Relationship Management": 3},
            demand={"Sales": 120, "Customer Relationship Management": 44},
        )

    def find_role_skill_rows(self, _role: str):  # pragma: no cover - must not be called
        raise AssertionError("title ILIKE must not drive aspiration demand")

    def get_skill_demand_for_keys(self, _keys):  # pragma: no cover - must not be called
        raise AssertionError("family-scoped demand must not fall back to the corpus lookup")


def test_aspiration_demand_uses_role_family_not_title_substrings() -> None:
    result = fetch_aspiration_skills(_RoleFamilyOnlyRepository(), ["Sales and Marketing"])
    assert result["Sales"] == 4


def test_one_read_returns_both_target_and_weight() -> None:
    """The invariant this module exists for: a gap's target level and its ranking
    weight come from ONE pass over ONE job set. Two reads is how they drifted —
    targets scoped to the user's families, weights counted over the whole corpus."""
    repo = _RoleFamilyOnlyRepository()
    market = fetch_role_family_market(repo, ["Sales and Marketing"])
    assert repo.calls == 1
    assert market.aspiration["Sales"] == 4
    assert market.demand["Sales"] == 120
    assert set(market.aspiration) == set(market.demand)


def test_no_target_reads_nothing() -> None:
    class _Exploding:
        def get_role_family_market(self, _families):  # pragma: no cover
            raise AssertionError("must not query without a chosen direction")

    assert fetch_role_family_market(_Exploding(), []).is_empty


def test_read_failure_degrades_to_open_market() -> None:
    class _Failing:
        def get_role_family_market(self, _families):
            raise RuntimeError("postgrest down")

    assert fetch_role_family_market(_Failing(), ["Sales and Marketing"]).is_empty
