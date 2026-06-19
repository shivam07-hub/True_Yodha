import pytest

from app.services.baseline_generator import generate_baseline, validate_answer


def test_validate_answer_normalizes_each_question() -> None:
    assert validate_answer(1, {"preferred_name": " Ada ", "email": ""}) == {
        "preferred_name": "Ada",
        "email": "",
    }
    assert validate_answer(3, {"achievements": [" Shipped search ", ""]}) == {
        "achievements": ["Shipped search"]
    }


def test_validate_answer_rejects_wrong_shape() -> None:
    with pytest.raises(ValueError, match="Question 2"):
        validate_answer(2, {"roles": "Engineer"})


def test_generate_baseline_uses_only_answered_facts() -> None:
    generated = generate_baseline(
        {
            "1": {"preferred_name": "Ada Lovelace", "location": "London"},
            "2": {
                "roles": [
                    {
                        "title": "Product Manager",
                        "organization": "Acme",
                        "dates": "2022-present",
                    }
                ]
            },
            "3": {"achievements": ["Improved activation from 20% to 31%"]},
            "4": {"skills": ["Product strategy", "SQL"], "projects": []},
            "5": {"education": ["BSc Computer Science"], "certifications": []},
        }
    )

    assert "Ada Lovelace" in generated.draft
    assert "Product Manager | Acme | 2022-present" in generated.draft
    assert "Improved activation from 20% to 31%" in generated.draft
    assert "Product strategy, SQL" in generated.draft
    assert "BSc Computer Science" in generated.draft
    assert "led" not in generated.draft.lower()
    assert "1.preferred_name" in generated.source_ids
    assert "3.achievements.0" in generated.source_ids


def test_generate_baseline_requires_substantive_facts() -> None:
    with pytest.raises(ValueError, match="substantive"):
        generate_baseline({"1": {"preferred_name": "Ada"}})
