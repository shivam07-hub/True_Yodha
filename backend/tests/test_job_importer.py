from datetime import date

from app.services.job_importer import (
    build_extension_job_id,
    normalize_skill_label,
    split_confirmed_skills,
)


def test_normalize_skill_label_collapses_case_punctuation_and_spaces() -> None:
    assert normalize_skill_label("  Lang Graph!! ") == "lang graph"


def test_normalize_skill_label_preserves_common_technical_tokens() -> None:
    assert normalize_skill_label("C++ / .NET / Node.js") == "c++ .net node.js"


def test_build_extension_job_id_prefers_source_url() -> None:
    first = build_extension_job_id("https://jobs.example.com/role/123", "Role", "Co", "India")
    second = build_extension_job_id("https://jobs.example.com/role/123", "Other", "Else", "Remote")

    assert first == second
    assert first.startswith("ext_")


def test_build_extension_job_id_falls_back_to_job_facts() -> None:
    first = build_extension_job_id(None, "Data Engineer", "Acme", "Bengaluru")
    second = build_extension_job_id(None, "Data Engineer", "Acme", "Bengaluru")

    assert first == second
    assert first.startswith("ext_")


def test_split_confirmed_skills_keeps_canonical_and_returns_emerging() -> None:
    canonical, emerging = split_confirmed_skills(
        ["Python (Programming Language)", "LangGraph"],
        valid_taxonomy_keys={"Python (Programming Language)"},
        skill_type="primary",
    )

    assert canonical == ["Python (Programming Language)"]
    assert emerging == [{"label": "LangGraph", "skill_type": "primary", "source": "user_added"}]


def test_split_confirmed_skills_dedupes_canonical_and_emerging() -> None:
    canonical, emerging = split_confirmed_skills(
        ["SQL", "SQL", "LangGraph", "lang graph", "  "],
        valid_taxonomy_keys={"SQL"},
        skill_type="secondary",
    )

    assert canonical == ["SQL"]
    assert emerging == [{"label": "LangGraph", "skill_type": "secondary", "source": "user_added"}]
