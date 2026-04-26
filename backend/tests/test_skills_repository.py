from unittest.mock import MagicMock

from app.repositories.skills import SkillsRepository


def _q(data: list[dict] | dict | None = None) -> MagicMock:
    q = MagicMock()
    for method in ("select", "eq", "order"):
        getattr(q, method).return_value = q

    result = MagicMock()
    result.data = data if isinstance(data, list) else ([] if data is None else [data])
    q.execute.return_value = result
    return q


def test_list_active_skills_normalizes_missing_grouping() -> None:
    db = MagicMock()
    db.table.return_value = _q(
        [
            {
                "id": 1,
                "taxonomy_key": "Python",
                "display_name": "Python",
                "lightcast_id": None,
                "l1_domain": None,
                "l2_cluster": "",
            }
        ]
    )

    records = SkillsRepository(db).list_active_skills()

    assert records[0].l1_domain == "General"
    assert records[0].l2_cluster == "General"


def test_list_active_domains_dedupes_and_sorts() -> None:
    db = MagicMock()
    db.table.return_value = _q(
        [
            {"l1_domain": "IT"},
            {"l1_domain": "Business"},
            {"l1_domain": "IT"},
            {"l1_domain": None},
        ]
    )

    result = SkillsRepository(db).list_active_domains()

    assert result == ["Business", "IT"]

