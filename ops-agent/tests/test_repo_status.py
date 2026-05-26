from pathlib import Path

from myro_ops.tools.repo_status import check_required_paths, parse_git_status


def test_parse_git_status_extracts_branch_ahead_and_dirty_entries() -> None:
    parsed = parse_git_status(
        "## Develop...origin/Develop [ahead 2]\n"
        " M frontend/lib/api.ts\n"
        "?? ops-agent/\n"
    )

    assert parsed.branch == "Develop"
    assert parsed.ahead == 2
    assert parsed.dirty_entries == ["M frontend/lib/api.ts", "?? ops-agent/"]


def test_check_required_paths_reports_missing_files(tmp_path: Path) -> None:
    (tmp_path / "AGENTS.md").write_text("rules", encoding="utf-8")
    (tmp_path / "backend" / "app").mkdir(parents=True)
    (tmp_path / "backend" / "app" / "main.py").write_text("app", encoding="utf-8")

    missing = check_required_paths(
        tmp_path,
        required_paths=["AGENTS.md", "backend/app/main.py", "frontend/app/layout.tsx"],
    )

    assert missing == ["frontend/app/layout.tsx"]
