from datetime import date
from pathlib import Path

from myro_ops.models import ToolResult
from myro_ops.redaction import redact_sensitive


def _bullet_lines(items: list[str]) -> str:
    if not items:
        return "- None"
    return "\n".join(f"- {redact_sensitive(item)}" for item in items)


def render_result_markdown(result: ToolResult, *, title: str | None = None) -> str:
    heading = title or f"Myro Ops {result.name.replace('-', ' ').title()}"
    return "\n".join(
        [
            f"# {heading}",
            "",
            "## Status",
            "",
            redact_sensitive(result.status.title()),
            "",
            "## Summary",
            "",
            redact_sensitive(result.summary),
            "",
            "## Details",
            "",
            _bullet_lines(result.details),
            "",
            "## Risks",
            "",
            _bullet_lines([item for item in result.details if "risk" in item.lower() or "blocked" in item.lower()]),
            "",
            "## Recommended Next Move",
            "",
            _bullet_lines(result.recommendations),
            "",
            "## Evidence",
            "",
            _bullet_lines(result.evidence),
            "",
        ]
    )


def write_daily_report(
    result: ToolResult,
    *,
    report_root: Path,
    date_text: str | None = None,
) -> Path:
    day = date_text or date.today().isoformat()
    target = report_root / "daily" / f"{day}.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        render_result_markdown(result, title=f"Myro Ops Brief - {day}"),
        encoding="utf-8",
    )
    return target
