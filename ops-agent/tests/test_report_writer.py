from pathlib import Path

from myro_ops.models import ToolResult
from myro_ops.report_writer import render_result_markdown, write_daily_report


def test_render_result_markdown_redacts_details() -> None:
    result = ToolResult(
        name="health",
        status="degraded",
        summary="Found shivam@example.com in source",
        details=["Token sk-test-1234567890 should not appear"],
        evidence=["local fixture"],
        recommendations=["Review source"],
    )

    markdown = render_result_markdown(result)

    assert "shivam@example.com" not in markdown
    assert "sk-test-1234567890" not in markdown
    assert "## Status" in markdown
    assert "[redacted-email]" in markdown
    assert "[redacted-secret]" in markdown


def test_write_daily_report_creates_dated_file(tmp_path: Path) -> None:
    result = ToolResult(
        name="brief",
        status="ready",
        summary="All local checks available",
        details=["Repo context loaded"],
        evidence=["AGENTS.md"],
        recommendations=["Run health daily"],
    )

    report_path = write_daily_report(result, report_root=tmp_path, date_text="2026-05-27")

    assert report_path == tmp_path / "daily" / "2026-05-27.md"
    assert report_path.exists()
    assert "# Myro Ops Brief - 2026-05-27" in report_path.read_text()
