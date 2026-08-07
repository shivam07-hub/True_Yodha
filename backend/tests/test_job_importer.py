from datetime import date
from types import SimpleNamespace

from app.services.job_importer import (
    build_extension_job_id,
    build_imported_job,
    normalize_skill_label,
    split_confirmed_skills,
)


def _import_body(**overrides):
    base = dict(
        role_name="Senior Marketing Manager",
        company_name="GitHub, Inc.",
        location="Remote, India",
        job_description="Lead regional marketing strategy and execution across India.",
        source_url="https://githubinc.jibeapply.com/x",
        source_platform="jibe",
        primary_skills=[],
        secondary_skills=[],
        emerging_skills=[],
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_imported_job_is_labelled_user_discovery() -> None:
    # A job the user tracked via the extension is THEIR discovery, not a Myro
    # algorithmic match — so it surfaces in Liked/All and never claims to be a
    # "Myro found" match (journey: "can't find the job I added on my dashboard").
    plan = build_imported_job("u1", _import_body())
    assert plan["application_row"]["source"] == "user_discovery"


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


def test_imported_job_stamps_todays_feed_markers() -> None:
    # first_seen/last_seen were NULL on every extension row in prod (2026-08-06),
    # which parks the job below every freshness floor and out of every
    # newest-first order. The columns are YYYYMMDD ints, not timestamps.
    plan = build_imported_job("u1", _import_body())
    today = int(date.today().strftime("%Y%m%d"))

    assert plan["job_row"]["first_seen"] == today
    assert plan["job_row"]["last_seen"] == today
    assert plan["job_row"]["batch_date"] == today


def test_imported_job_builds_canonical_skill_rows() -> None:
    # The match candidate pool is job_skills-derived, so a job with no canonical
    # rows can never be a candidate however good its main_skills array looks.
    plan = build_imported_job(
        "u1",
        _import_body(
            primary_skills=["Python (Programming Language)"],
            secondary_skills=["SQL (Programming Language)", "LangGraph"],
        ),
    )

    assert [(s.taxonomy_key, s.is_must_have, s.required_level) for s in plan["skill_rows"]] == [
        ("Python (Programming Language)", True, 4),
        ("SQL (Programming Language)", False, 2),
    ]
    # LangGraph is not in the taxonomy — it stays a candidate, never a job_skill.
    assert [row["raw_label"] for row in plan["candidate_rows"]] == ["LangGraph"]


def test_imported_job_skill_rows_keep_a_repeated_key_once_as_primary() -> None:
    # job_skills is UNIQUE (job_id, skill_id); a duplicate inside one upsert
    # batch is a Postgres error, not a silent dedupe.
    plan = build_imported_job(
        "u1",
        _import_body(
            primary_skills=["Python (Programming Language)"],
            secondary_skills=["Python (Programming Language)"],
        ),
    )

    assert [(s.taxonomy_key, s.is_must_have, s.required_level) for s in plan["skill_rows"]] == [
        ("Python (Programming Language)", True, 4)
    ]


def test_split_confirmed_skills_dedupes_canonical_and_emerging() -> None:
    canonical, emerging = split_confirmed_skills(
        ["SQL", "SQL", "LangGraph", "lang graph", "  "],
        valid_taxonomy_keys={"SQL"},
        skill_type="secondary",
    )

    assert canonical == ["SQL"]
    assert emerging == [{"label": "LangGraph", "skill_type": "secondary", "source": "user_added"}]
