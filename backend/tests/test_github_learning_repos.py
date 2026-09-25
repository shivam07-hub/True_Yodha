"""Which public GitHub repos a skill path is allowed to show."""
from __future__ import annotations

from pathlib import Path

from app.services.github_learning_repos import (
    ROADMAP_USE_CASE,
    TAXONOMY_FOR_ROADMAP,
    USE_CASES,
    project_learning_repos,
)

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "database"
    / "migrations"
    / "20260925133000_github_learning_repos.sql"
)


def test_every_roadmap_link_names_a_real_use_case_and_skill() -> None:
    assert set(ROADMAP_USE_CASE.values()) <= set(USE_CASES)
    for slug in TAXONOMY_FOR_ROADMAP:
        assert slug in ROADMAP_USE_CASE, slug


def test_a_path_shows_only_repos_for_skills_it_already_has() -> None:
    rows = [
        _row("python", "cpython", "python", "language", "Python (Programming Language)"),
        _row("rust-lang", "rust", "rust", "language", "Rust (Programming Language)"),
        _row("readme", "articles", "python", "language", "Python (Programming Language)", url="https://example.com/nope"),
        _row("getify", "You-Dont-Know-JS", "javascript", "language", ""),
    ]

    shown = project_learning_repos(rows, ["Python (Programming Language)"])

    assert [link["full_name"] for link in shown] == ["python/cpython"]


def test_the_same_repo_on_two_roadmaps_for_one_skill_is_one_link() -> None:
    rows = [
        _row("python", "cpython", "python-data-analysis", "language", "Python (Programming Language)"),
        _row("python", "cpython", "python", "language", "Python (Programming Language)"),
    ]

    shown = project_learning_repos(rows, ["Python (Programming Language)"])

    assert len(shown) == 1
    assert shown[0]["roadmap_slug"] == "python"


def test_catalog_migration_stores_links_against_the_taxonomy() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")
    lowered = sql.lower()

    assert "create table if not exists public.github_learning_repos" in lowered
    assert "taxonomy_key text" in lowered
    assert "https://github.com/donnemartin/system-design-primer" in sql
    assert "Python (Programming Language)" in sql
    assert "notify pgrst, 'reload schema';" in lowered
    assert sql.count("https://github.com/") > 400


def _row(
    owner: str,
    name: str,
    roadmap: str,
    use_case: str,
    taxonomy_key: str,
    url: str | None = None,
) -> dict[str, str]:
    return {
        "owner": owner,
        "name": name,
        "html_url": url or f"https://github.com/{owner}/{name}",
        "roadmap_slug": roadmap,
        "use_case": use_case,
        "taxonomy_key": taxonomy_key,
    }
