from pathlib import Path

from myro_ops.cli import main
from myro_ops.context import OpsContext


def _context(tmp_path: Path) -> OpsContext:
    agent_root = tmp_path / "ops-agent"
    agent_root.mkdir()
    (tmp_path / "docs" / "beta-testing").mkdir(parents=True)
    (tmp_path / "docs" / "beta-testing" / "2026-05-24-first-beta-testing-report.md").write_text(
        "Users asked for clearer upload recovery.",
        encoding="utf-8",
    )
    return OpsContext(repo_root=tmp_path, agent_root=agent_root, instructions="rules", env={})


def test_cli_feedback_prints_markdown(tmp_path: Path, capsys) -> None:
    exit_code = main(["feedback"], context=_context(tmp_path))

    output = capsys.readouterr().out
    assert exit_code == 0
    assert "# Myro Ops Feedback" in output
    assert "clearer upload recovery" in output


def test_cli_ask_routes_known_feedback_question(tmp_path: Path, capsys) -> None:
    exit_code = main(["ask", "what are users saying?"], context=_context(tmp_path))

    output = capsys.readouterr().out
    assert exit_code == 0
    assert "# Myro Ops Feedback" in output


def test_cli_unknown_ask_lists_supported_questions(tmp_path: Path, capsys) -> None:
    exit_code = main(["ask", "who is the CEO?"], context=_context(tmp_path))

    output = capsys.readouterr().out
    assert exit_code == 1
    assert "Supported ask patterns" in output
