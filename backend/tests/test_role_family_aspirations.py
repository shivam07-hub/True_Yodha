from app.services.scoring.aspirations import fetch_aspiration_skills


class _RoleFamilyOnlyRepository:
    def get_role_family_aspiration_skills(self, families: list[str]) -> dict[str, int]:
        assert families == ["Sales and Marketing"]
        return {"Sales": 4, "Customer Relationship Management": 3}

    def find_role_skill_rows(self, _role: str):  # pragma: no cover - must not be called
        raise AssertionError("title ILIKE must not drive aspiration demand")


def test_aspiration_demand_uses_role_family_not_title_substrings() -> None:
    result = fetch_aspiration_skills(_RoleFamilyOnlyRepository(), ["Sales and Marketing"])
    assert result["Sales"] == 4
